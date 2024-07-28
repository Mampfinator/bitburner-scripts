import { NS } from "@ns";
import { getServerGraph, ServerGraph } from "./graph";

/**
 * Connect to a server using `singularity`.
 */
export function connect(
    ns: NS,
    server: string,
    graph?: ServerGraph,
): [true, () => void] | [false, null] {
    const { singularity } = ns;
    const startedAt = singularity.getCurrentServer();

    if (!graph) graph = getServerGraph(ns, { startFrom: startedAt });

    const path = graph.path(startedAt, server);
    if (!path) return [false, null];

    const walked = [startedAt];
    const goBack = () => {
        for (const server of walked) singularity.connect(server);
    };

    while (path.length > 0) {
        const server = path.shift()!;

        const success = singularity.connect(server);

        if (success) {
            walked.unshift(server);
        } else {
            // walk back the path we came from to recover initial terminal state.
            console.warn(
                `Unable to connect from "${singularity.getCurrentServer()}" to ${server}.`,
                path,
                graph,
            );
            for (const server of walked) singularity.connect(server);
            goBack();
            return [false, null];
        }
    }

    singularity.connect(server);
    return [true, goBack];
}
