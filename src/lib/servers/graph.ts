import { NS } from "@ns";

export class ServerGraph {
    public edges = new Map<string, Set<string>>();
    public nodes = new Set<string>();

    /**
     * @private
     */
    addEdge(from: string, to: string) {
        this.nodes.add(from).add(to);

        if (!this.edges.has(from)) this.edges.set(from, new Set());
        this.edges.get(from)!.add(to);

        if (!this.edges.has(to)) this.edges.set(to, new Set());
        this.edges.get(to)!.add(to);
    }

    public neighors(node: string) {
        return this.edges.get(node) ?? new Set();
    }

    /**
     * Find a path leading between `from` and `to`, excluding the start and end nodes. This path is not guaranteed to be optimal.
     */
    public path(from: string, to: string): string[] | null {
        const cameFrom = new Map();

        const queue = [from];

        while (queue.length > 0) {
            const node = queue.shift()!;
            if (node === to) return reconstruct(cameFrom, from, to);

            for (const neighbor of this.neighors(node)) {
                if (cameFrom.has(neighbor)) continue;

                cameFrom.set(neighbor, node);
                queue.push(neighbor);
            }
        }

        return null;
    }

    public toTree(root: string = "home"): TreeNode {
        const rootNode: TreeNode = { name: root, children: new Map() };

        const seen = new Set([root]);

        const queue: [string, TreeNode][] = [[root, rootNode]];

        while (queue.length > 0) {
            const [current, currentNode] = queue.shift()!;
            const neighbors = this.neighors(current);

            for (const neighbor of neighbors) {
                if (seen.has(neighbor)) continue;
                seen.add(neighbor);

                const node = { name: neighbor, children: new Map() };
                currentNode.children.set(neighbor, node);
                queue.push([neighbor, node]);
            }
        }

        return rootNode;
    }
}

export interface TreeNode {
    name: string;
    children: Map<string, TreeNode>;
}

export interface GraphOptions {
    startFrom?: string;
    backdoorIsHomeLink?: boolean;
}

export function getServerGraph(ns: NS, options?: GraphOptions) {
    const graph = new ServerGraph();

    const queue = [options?.startFrom ?? "home"];

    while (queue.length > 0) {
        const current = queue.shift()!;

        for (const to of ns.scan(current)) {
            if (!graph.nodes.has(to)) queue.push(to);

            const server = globalThis.servers.get(to)!;
            if (
                (typeof options?.backdoorIsHomeLink === "undefined" || options.backdoorIsHomeLink) &&
                server.backdoorInstalled
            )
                graph.addEdge("home", to);
            graph.addEdge(current, to);
        }
    }

    return graph;
}

function reconstruct(cameFrom: Map<string, string>, from: string, to: string) {
    const path = [];

    let current = cameFrom.get(to);
    while (!!current) {
        if (current === from) return path.reverse();
        path.push(current);

        const next = cameFrom.get(current);

        if (next === current) throw new Error(`next === current; Aborting.`);

        current = next;
    }

    return null;
}
