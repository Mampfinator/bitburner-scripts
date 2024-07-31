//! Load external dependencies.
import { NS } from "@ns";
const doc = eval("document") as Document;

function join(base: string, uri: string) {
    if (base.endsWith(".js")) base = base.replace(/(?<=\/)(?:.(?!\/))+$/, "");
    return new URL(uri, base).href;
}

// FIXME: Absolute paths are not supported and will crash the game.
async function makeScript(dep: ScriptDependency, element: HTMLScriptElement) {
    const original = await fetch(dep.src).then((res) => res.text());
    let source = original;

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

    if (original !== source) {
        console.log(`Modified script source for ${dep.src}`);
    }

    element.textContent = source;

    // We want to wait for the script to be fully parsed before continuing. 
    // I'm *pretty sure* this is the best way to do it.
    element.async = false;

    return element;
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

export async function apply(dep: Dependency, id: string) {
    const oldElement = doc.querySelector(`#${id}`);

    let element;
    if (oldElement) element = oldElement;
    else {
        const node = dep.type.toLowerCase();

        element = doc.createElement(node.includes("script") ? "script" : node === "stylesheet" ? "link" : "style");
        element.id = id;
    }

    if (dep.type === "script") await makeScript(dep, element as HTMLScriptElement);
    else if (dep.type === "stylesheet") await makeStyleSheet(dep, element as HTMLLinkElement);
    else if (dep.type === "rawScript") await makeRawScript(dep, element as HTMLScriptElement);
    else if (dep.type === "rawStylesheet") await makeRawStyleSheet(dep, element as HTMLStyleElement);

    if (!oldElement) {
        doc.head.appendChild(element);
    }
}

type DependenciesFile = {
    [id: string]: Dependency;
}

export async function load(ns: NS) {
    const dependencies: DependenciesFile = JSON.parse(ns.read("dependencies.json"));

    for (const [id, dep] of Object.entries(dependencies)) {
        await apply(dep, id);
    }
}
