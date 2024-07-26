import { NS } from "@ns";
import type * as ReactFlowNamespace from "reactflow";
import { getServerGraph } from "/lib/servers/graph";
import { ServerNode } from "./ServerNode";

declare global {
    var ReactFlow: typeof ReactFlowNamespace;
}

const {
    d3: {
        forceSimulation,
        forceManyBody,
        forceLink,
        forceX,
        forceY,
        forceCollide: collide,
    },
    React,
    React: { useMemo },
    ReactFlow: {
        ReactFlow,
        ReactFlowProvider,
        Panel,
        useNodesState,
        useEdgesState,
        useReactFlow,
        useNodesInitialized,
    },
} = globalThis;

const simulation = forceSimulation()
    .force("charge", forceManyBody().strength(-1000))
    .force("x", forceX().x(0).strength(0.05))
    .force("y", forceY().y(0).strength(0.05))
    .force("collide", collide())
    .alphaTarget(0.05)
    .stop();

const useLayoutedElements = () => {
    const { getNodes, setNodes, getEdges, fitView } = useReactFlow();
    const initialized = useNodesInitialized();

    return useMemo(() => {
        let nodes = getNodes().map((node) => ({
            ...node,
            x: node.position.x,
            y: node.position.y,
        }));
        let edges = getEdges().map((edge) => edge);
        let running = false;

        // If React Flow hasn't initialized our nodes with a width and height yet, or
        // if there are no nodes in the flow, then we can't run the simulation!
        if (!initialized || nodes.length === 0) return [false, {}];

        simulation.nodes(nodes).force(
            "link",
            forceLink(edges)
                .id((d) => (d as any).id)
                .strength(0.05)
                .distance(100),
        );

        // The tick function is called every animation frame while the simulation is
        // running and progresses the simulation one step forward each time.
        const tick = () => {
            getNodes().forEach((node, i) => {
                const dragging = Boolean(
                    document.querySelector(`[data-id="${node.id}"].dragging`),
                );

                // Setting the fx/fy properties of a node tells the simulation to "fix"
                // the node at that position and ignore any forces that would normally
                // cause it to move.
                (nodes[i] as any).fx = dragging ? node.position.x : null;
                (nodes[i] as any).fy = dragging ? node.position.y : null;
            });

            simulation.tick();
            setNodes(
                nodes.map((node) => ({
                    ...node,
                    position: { x: node.x, y: node.y },
                })),
            );

            globalThis.requestAnimationFrame(() => {
                // Give React and React Flow a chance to update and render the new node
                // positions before we fit the viewport to the new layout.
                fitView();

                // If the simulation hasn't be stopped, schedule another tick.
                if (running) tick();
            });
        };

        const toggle = () => {
            running = !running;
            running && globalThis.requestAnimationFrame(tick);
        };

        const isRunning = () => running;

        return [true, { toggle, isRunning }];
    }, [initialized]);
};

// TODO: floating Handles to reduce visual clutter.
const LayoutFlow = ({ ns }: { ns: NS }) => {
    const graph = getServerGraph(ns, { backdoorIsHomeLink: false });

    function isExtraHome(name: string) {
        return name.startsWith("home") && Number(name.replace("home", "")) > 24;
    }

    const initialNodes = [...graph.nodes]
        .map((serverName) => {
            return {
                id: serverName,
                position: { x: Math.random() * 200, y: Math.random() * 200 },
                type: "server",
                data: { name: serverName },
            };
        })
        .filter((node) => !isExtraHome(node.id));

    const edgeMap = new Map<string, ReactFlowNamespace.Edge<any>>();
    for (const [from, tos] of graph.edges) {
        if (isExtraHome(from)) continue;
        for (const to of tos) {
            if (isExtraHome(to)) continue;
            const [a, b] = [from, to].sort();

            if (!edgeMap.has(a))
                edgeMap.set(`${a}-${b}`, {
                    source: a,
                    target: b,
                    id: `${a}-${b}`,
                });
        }
    }

    const initialEdges = [...edgeMap.values()];

    const [nodes, , onNodesChange] = useNodesState(initialNodes);
    const [edges, , onEdgesChange] = useEdgesState(initialEdges);
    const [initialized, { toggle, isRunning }] = useLayoutedElements() as [
        boolean,
        { toggle: () => void; isRunning: () => boolean },
    ];

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={{ server: ServerNode }}
        >
            <Panel position="bottom-left">
                {initialized && (
                    <button onClick={toggle}>
                        {isRunning() ? "Stop" : "Start"} force simulation
                    </button>
                )}
            </Panel>
        </ReactFlow>
    );
};

export async function main(ns: NS) {
    ns.disableLog("ALL");
    ns.clearLog();

    ns.tail();
    ns.resizeTail(1000, 600);

    ns.printRaw(
        <div style={{ height: "1000px", width: "100%" }}>
            <ReactFlowProvider>
                <LayoutFlow ns={ns} />
            </ReactFlowProvider>
        </div>,
    );

    while (true) {
        await ns.asleep(50000);
    }
}
