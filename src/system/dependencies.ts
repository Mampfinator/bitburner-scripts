//! Load external dependencies.
import { NS } from "@ns";

const doc = eval("document") as Document;

function makeScript(src: string, id: string) {
    const element = doc.createElement("script");

    element.src = src;
    element.id = id;

    return element;
}

function makeStyleSheet(href: string, id: string) {
    const element = doc.createElement("link");

    element.id = id;
    element.href = href;
    element.rel = "stylesheet";

    return element;
}

type Dependency =
    | { type: "script"; id: string; src: string }
    | { type: "stylesheet"; id: string; href: string };

const DEPENDENCIES: Dependency[] = [];

export async function load(_: NS) {
    const head = doc.querySelector("head")!;

    for (const dependency of DEPENDENCIES) {
        if (doc.querySelector(`#${dependency.id}`)) continue;

        let element;
        if (dependency.type === "script")
            element = makeScript(dependency.src, dependency.id);
        else if (dependency.type === "stylesheet")
            element = makeStyleSheet(dependency.href, dependency.id);
        else
            throw new Error(
                `Unknown dependency type: ${JSON.stringify(dependency)}`,
            );

        head.appendChild(element);
    }
}
