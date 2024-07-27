//! Load external dependencies.
import { NS } from "@ns";
const doc = eval("document") as Document;

const IMPORT_MAP = {
    imports: {},
} as { imports: Record<string, string> };

function join(base: string, uri: string) {
    if (base.endsWith(".js")) base = base.replace(/(?<=\/)(?:.(?!\/))+$/, "");
    return new URL(uri, base).href;
}

async function makeScript(dep: ScriptDependency, element: HTMLScriptElement) {
    let source = await fetch(dep.src).then((res) => res.text());

    if (dep.type) element.type = dep.type;
    if (dep.type === "module") {
        source = source.replaceAll(
            /(?<=import *.+ *from *\")(.+?)(?=\")/g,
            (match: string) => {
                const replacer = IMPORT_MAP.imports[match];
                if (replacer) {
                    console.log(`Replacing ${match} with ${replacer}.`);
                    return replacer;
                }

                // if import is relative, make it absolute.
                if (match.startsWith(".")) {
                    return join(dep.src, match);
                }

                return match;
            },
        );
    }

    if (dep.append) {
        if (!source.endsWith(";")) source += ";";
        source += `\n${dep.append}`;
    }

    element.textContent = source;

    console.log(`Modified source for ${dep.src}.`);

    return element;
}

async function makeRawScript(
    dep: RawScriptDependency,
    element: HTMLScriptElement,
) {
    element.textContent = dep.src;
    if (dep.type) element.type = dep.type;
}

async function makeStyleSheet(
    dep: StylesheetDependency,
    element: HTMLLinkElement,
) {
    element.href = dep.href;
    element.rel = "stylesheet";
}

async function makeRawStyleSheet(
    dep: RawStyleSheetDependency,
    element: HTMLStyleElement,
) {
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
    node: "script";
    id: string;
    src: string;
    append?: string;
    type?: "module";
}
interface RawScriptDependency {
    node: "rawScript";
    id: string;
    src: string;
    type?: "module";
}
interface StylesheetDependency {
    node: "stylesheet";
    id: string;
    href: string;
}
interface RawStyleSheetDependency {
    node: "rawStylesheet";
    id: string;
    style: Record<string, React.CSSProperties>;
}

type Dependency =
    | ScriptDependency
    | RawScriptDependency
    | StylesheetDependency
    | RawStyleSheetDependency;

const DEPENDENCIES: Dependency[] = [];

/**
 * Register an external scripts/stylesheet.
 */
export function register({
    dependency,
    imports,
}: {
    dependency?: Dependency;
    imports?: Record<string, string>;
}) {
    if (dependency) DEPENDENCIES.push(dependency);
    if (imports) {
        IMPORT_MAP.imports = {
            ...IMPORT_MAP.imports,
            ...imports,
        };
    }
}

export async function apply(dep: Dependency) {
    const oldElement = doc.querySelector(`#${dep.id}`);

    let element;
    if (oldElement) element = oldElement;
    else {
        const node = dep.node.toLowerCase();

        element = doc.createElement(
            node.includes("script") ? "script" : 
            node === "stylesheet" ?"link" :
            "style",
        );
        element.id = dep.id;
    }

    if (dep.node === "script")
        await makeScript(dep, element as HTMLScriptElement);
    else if (dep.node === "stylesheet")
        await makeStyleSheet(dep, element as HTMLLinkElement);
    else if (dep.node === "rawScript")
        await makeRawScript(dep, element as HTMLScriptElement);
    else if (dep.node === "rawStylesheet")
        await makeRawStyleSheet(dep, element as HTMLStyleElement);

    if (!oldElement) {
        doc.head.appendChild(element);
    }
}

export async function load(_: NS) {
    register({
        dependency: {
            node: "script",
            id: "chalk",
            src: "https://cdn.jsdelivr.net/npm/chalk@5.3.0/source/index.min.js",
            append: "globalThis.chalk = chalk",
            type: "module",
        },
        imports: {
            "#ansi-styles":
                "https://cdn.jsdelivr.net/npm/chalk@5.3.0/source/vendor/ansi-styles/index.min.js",
            "#supports-color":
                "https://cdn.jsdelivr.net/npm/chalk@5.3.0/source/vendor/supports-color/browser.min.js",
        },
    });

    register({
        dependency: {
            node: "script",
            id: "reactflow",
            src: "https://cdn.jsdelivr.net/npm/reactflow@11.11.4/dist/umd/index.min.js",
        },
    });

    register({
        dependency: {
            node: "stylesheet",
            id: "reactflow-style",
            href: "https://cdn.jsdelivr.net/npm/reactflow@11.11.4/dist/style.min.css",
        },
    });

    register({
        dependency: {
            node: "script",
            id: "d3",
            src: "https://d3js.org/d3.v7.min.js",
        },
    });

    register({
        dependency: {
            node: "script",
            id: "d3-force",
            src: "https://cdn.jsdelivr.net/npm/d3-force@3",
        },
    });

    for (const dependency of DEPENDENCIES) {
        await apply(dependency);
    }
}
