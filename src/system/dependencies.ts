//! Load external dependencies.
import { NS } from "@ns";
const doc = eval("document") as Document;

function join(base: string, uri: string) {
    if (base.endsWith(".js")) base = base.replace(/(?<=\/)(?:.(?!\/))+$/, "");
    return new URL(uri, base).href;
}

const PENDING_DEPENDENCIES = new Map<string, ReturnType<PromiseConstructor["withResolvers"]>>();

// FIXME: Absolute paths are not supported and will crash the game.
async function makeScript(dep: ScriptDependency, element: HTMLScriptElement) {
    let ready: Promise<void>;

    if (dep.append || dep.prepend || (dep.module && !!dep.imports)) {
        const original = await fetch(dep.src).then((res) => res.text());
        let source = original;

        if (dep.prepend) source = dep.prepend + source;

        if (dep.module && !!dep.imports) {
            element.type = "module";
            source = source.replaceAll(/(?<=import *.+ *from *\")(.+?)(?=\")/g, (match: string) => {
                const replacer = dep.imports![match];
                if (replacer) {
                    console.log(`Replacing ${match} with ${replacer}.`);
                    return replacer;
                }

                // if import is relative, make it absolute.
                if (match.startsWith(".")) {
                    return join(dep.src, match);
                }

                return match;
            });
        }

        if (dep.append) {
            if (!source.endsWith(";")) source += ";";
            source += `\n${dep.append}`;
        }

        // `script#onload` is only triggered when the script is **down**loaded.
        // So to to be able to await script execution for text scripts,
        // we add a function to the global scope that will be called when the script is loaded
        // and append a call to that function to the script source.
        const resolvers = Promise.withResolvers();
        PENDING_DEPENDENCIES.set(dep.src, resolvers);
        source += `;\nglobalThis.dependencyLoaded("${dep.src}");`;

        if (original !== source) {
            console.log(`Modified script source for ${dep.src}`);
        }
        element.textContent = source;
        element.async = true;

        ready = resolvers.promise as Promise<void>;
    } else {
        element.src = dep.src;
        if (dep.module) element.type = "module";
        element.async = true;

        ready = new Promise((resolve) => element.addEventListener("load", resolve)).then(() => {});
    }

    return ready;
}

async function makeRawScript(dep: RawScriptDependency, element: HTMLScriptElement) {
    element.textContent = dep.src;
    if (dep.module) element.type = "module";
}

async function makeStyleSheet(dep: StylesheetDependency, element: HTMLLinkElement) {
    element.href = dep.href;
    element.rel = "stylesheet";
}

async function makeRawStyleSheet(dep: RawStyleSheetDependency, element: HTMLStyleElement) {
    let text = "";
    for (const [key, style] of Object.entries(dep.style)) {
        text += `${key} {`;
        for (const [key, value] of Object.entries(style)) {
            text += `${key}: ${value};`;
        }
        text += "}\n";
    }

    element.innerHTML = text;
}

interface ScriptDependency {
    type: "script";
    src: string;
    append?: string;
    prepend?: string;
    module?: boolean;
    imports?: Record<string, string>;
}
interface RawScriptDependency {
    type: "rawScript";
    src: string;
    module?: boolean;
}
interface StylesheetDependency {
    type: "stylesheet";
    href: string;
}
interface RawStyleSheetDependency {
    type: "rawStylesheet";
    style: Record<string, React.CSSProperties>;
}

type Dependency = ScriptDependency | RawScriptDependency | StylesheetDependency | RawStyleSheetDependency;

const MAKE_ELEMENT = {
    script: makeScript,
    stylesheet: makeStyleSheet,
    rawScript: makeRawScript,
    rawStylesheet: makeRawStyleSheet,
};

declare global {
    function dependencyLoaded(id: string): void;
}

export async function apply(dep: Dependency, id: string) {
    globalThis.dependencyLoaded = (id: string) => {
        if (PENDING_DEPENDENCIES.has(id)) {
            PENDING_DEPENDENCIES.get(id)!.resolve(undefined as void);
            PENDING_DEPENDENCIES.delete(id);
        }
    };

    const oldElement = doc.querySelector(`#${id}`);

    let element;
    if (oldElement) element = oldElement;
    else {
        const node = dep.type.toLowerCase();

        element = doc.createElement(node.includes("script") ? "script" : node === "stylesheet" ? "link" : "style");
        element.id = id;
    }

    const ready = MAKE_ELEMENT[dep.type](dep as any, element as any);

    if (!oldElement) {
        doc.head.appendChild(element);
    }

    await ready;
}

type DependenciesFile = {
    [id: string]: Dependency;
};

export async function load(ns: NS) {
    const dependencies: DependenciesFile = JSON.parse(ns.read("dependencies.json"));

    for (const [id, dep] of Object.entries(dependencies)) {
        console.log(`Loading ${id} (${dep.type})`);
        await apply(dep, id);
    }
}
