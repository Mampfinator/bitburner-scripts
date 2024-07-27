import { NS } from "@ns";
import { SERVER_NODE_STYLE, ServerNode } from "./ServerNode";
import { apply } from "/system/dependencies";
import { getServerGraph, TreeNode } from "/lib/servers/graph";
import { Edge, Node, type Position } from "reactflow";
import { auto } from "/system/proc/auto";
import { splitFilter } from "/lib/lib";

const HEIGHT = 1250;
const SPACE_X = 230;
const SPACE_Y = 115;

const {
    React,
    ReactFlow: {
        ReactFlowProvider,
        ReactFlow,
        Controls,
        useNodesState,
        useEdgesState,
        Position: PositionEnum,
    },
    dagre,
} = globalThis;

function getLayoutedElements(ns: NS): { nodes: Node[]; edges: Edge[] } {
    const serverGraph = getServerGraph(ns, {
        startFrom: "home",
        backdoorIsHomeLink: false,
    });

    const tree = serverGraph.toTree("home");

    const initialNodes: Node[] = [];
    const initialEdges: Edge[] = [];

    type HandleType = "source" | "target";

    function pushNode(
        server: string,
        x: number,
        y: number,
        handles?: [HandleType, Position][],
    ) {
        initialNodes.push({
            id: server,
            position: { x, y },
            type: "server",
            data: {
                server: ns.getServer(server),
                handles,
                ns,
            },
        });
    }
    
    type GridData = {
        server: string;
        handles?: [HandleType, Position][];
    };

    const grid = {
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0,
        grid: {} as Record<string, Record<string, GridData>>,
        *[Symbol.iterator]() {
            for (let x = grid.minX; x <= grid.maxX; x++) {
                for (let y = grid.minY; y <= grid.maxY; y++) {
                    const data = grid.grid[x]?.[y];
                    if (data) yield { x, y, data };
                }
            }
        },
        has(x: number, y: number) {
            return this.grid[x]?.[y] !== undefined;
        }
    };

    function pushGrid(x: number, y: number, data: GridData) {
        if (grid.has(x, y)) console.warn(`Overriding old grid data at ${x}, ${y}`, grid.grid[x][y]);
        const row = grid.grid[x] ??= {};
        row[y] = data;

        grid.minX = Math.min(grid.minX, x);
        grid.minY = Math.min(grid.minY, y);
        grid.maxX = Math.max(grid.maxX, x);
        grid.maxY = Math.max(grid.maxY, y);
    }

    pushGrid(0, 0, {
        server: "home",
        handles: [["source", PositionEnum.Right], ["source", PositionEnum.Left]],
    });

    const [purchasedServers, children] = splitFilter([...tree.children.values()], (element => ns.getServer(element.name).purchasedByPlayer));

    const next: [{name: string, x: number, y: number}, TreeNode[]][] = [[{name: "home", x: 0, y: 0}, [...children.values()]]];
    while (next.length > 0) {
        const current = next.shift()!;
        console.log(current, next)
        const [{name: parent, x: parentX, y: parentY}, nodes] = current;

        const x = parentX + 1;
        let y = parentY;

        function push(direction: number) {
            for (const node of nodes) {
                const handles: [HandleType, Position][] = [["target", PositionEnum.Left]];
                if (node.children.size > 0) {
                    handles.push(["source", PositionEnum.Right]);
                    next.push([{x, y, name: node.name}, [...node.children.values()]]);
                }

                pushGrid(x, y, {
                    server: node.name,
                    handles,
                });

                initialEdges.push({
                    id: `${parent}-${node.name}`,
                    source: parent,
                    target: node.name,
                });

                y += direction;
            }
        }

        let canGrow = true;
        const lower = { value: y + Math.floor(nodes.length / 2), direction: -1 };
        const upper = { value: y - Math.floor(nodes.length / 2), direction: 1 };

        function contiguousFree(from: number, direction: number) {
            if (!canGrow && (from + ((nodes.length - 1) * direction) > grid.maxY || from + ((nodes.length - 1) * direction) < grid.minY)) return false;
            for (let i = 0; i < nodes.length; i++) {
                if (grid.has(x, from + (i * direction))) return false;
            }
            return true;
        }

        while (true) {
            if (!canGrow && (lower.value <= grid.minY || lower.value >= grid.maxY) && (upper.value <= grid.minY || upper.value >= grid.maxY)) {
                canGrow = true;
            }
            const [a, b] = [lower, upper].sort((a, b) => Math.abs(a.value) - Math.abs(b.value));
            if (contiguousFree(a.value, a.direction)) {
                y = a.value;
                push(a.direction);
                break;
            } else if (contiguousFree(b.value, b.direction)) {
                y = b.value;
                push(b.direction);
                break;
            }


            if (lower.value > grid.minY || canGrow) {
                console.log("Lower: ", lower.value, grid.minY);
                lower.value--;
            } else {
                console.log("Lower (failed): ", lower.value, grid.minY, "canGrow", canGrow);
            }

            if (upper.value < grid.maxY || canGrow) {
                console.log("Upper: ", upper.value, grid.maxY);
                upper.value++;
            } else {
                console.log("Upper (failed): ", upper.value, grid.maxY, "canGrow", canGrow);
            }
        }
    }

    const PURCHASED_HANDLES: [HandleType, Position][] = [["target", PositionEnum.Right]];
    let x = -1;

    while (purchasedServers.length > 0) {

        for (let y = grid.minY; y < grid.maxY; y++) {
            const node = purchasedServers.shift();
            if (!node) break;

            pushGrid(x, y, {
                server: node.name,
                handles: PURCHASED_HANDLES,
            });

            initialEdges.push({
                id: `purchased-${node.name}`,
                source: "home",
                target: node.name,
                sourceHandle: "1",
            });
        }

        x -= 1;
    }


    for (const {x, y, data} of grid) {
        pushNode(data.server, x * SPACE_X, y * SPACE_Y, data.handles);
    }

    return {nodes: initialNodes, edges: initialEdges}
}

// FIXME: Dagre layouting doesn't seem to work.
// TODO: implement splitting of purchased and other servers similar to normal `getLayoutedElements`.
function getLayoutedElementsDagre(ns: NS): { nodes: Node[], edges: Edge[] } {
    const tree = getServerGraph(ns).toTree("home");

    function getElements(node: TreeNode, nodes: Node[] = [], edges: Edge[] = []) {
        nodes.push(...[...node.children.values()].map(child => {
            const handles = [["target", PositionEnum.Left]];
            if (child.children.size > 0) handles.push(["source", PositionEnum.Right]);

            return {
                id: child.name,
                position: { x: 0, y: 0 },
                type: "server",
                data: {
                    server: ns.getServer(child.name),
                    ns,
                    handles,
                },
            }
        }));

        edges.push(...[...node.children.values()].map(child => {
            return {
                id: `${node.name}-${child.name}`,
                source: node.name,
                target: child.name,
                type: "smoothstep",
            }
        }));

        for (const child of node.children.values()) {
            const { nodes: childNodes, edges: childEdges } = getElements(child);

            nodes.push(...childNodes);
            edges.push(...childEdges);
        }
        
        return { nodes, edges }
    }

    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    const nodeWidth = SPACE_X * 0.7;
    const nodeHeight = SPACE_Y * 0.7;

    const { nodes, edges } = getElements(tree);

    nodes.push({
        id: "home",
        position: { x: 0, y: 0 },
        type: "server",
        data: {
            server: ns.getServer("home"),
            ns,
            handles: [
                ["source", PositionEnum.Right],
                ["source", PositionEnum.Left],
            ]
        },
    });

    dagreGraph.setGraph({rankdir: "LR"});

    for (const node of nodes) {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    }

    for (const edge of edges) {
        dagreGraph.setEdge(edge.source, edge.target);
    }

    dagre.layout(dagreGraph);

    const positionedNodes = nodes.map(node => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            ...node,
            position: {
                x: nodeWithPosition.x,
                y: nodeWithPosition.y,
            },
        };
    });
    
    return { nodes: positionedNodes, edges }
}

function NetworkTree({ ns }: { ns: NS }): React.ReactElement {
    const { nodes: initialNodes, edges: initialEdges } = getLayoutedElements(ns);

    const [nodes] = useNodesState(initialNodes);
    const [edges] = useEdgesState(initialEdges);

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={{ server: ServerNode }}
            proOptions={{ hideAttribution: true }}
        >
            <Controls position="bottom-left" />
        </ReactFlow>
    );
}

export async function main(ns: NS) {
    auto(ns);
    ns.disableLog("ALL");
    ns.clearLog();

    await apply({
        node: "rawStylesheet",
        id: "server-graph-styles",
        style: SERVER_NODE_STYLE,
    });

    ns.tail();

    ns.printRaw(
        <div style={{ height: `${HEIGHT}px`, width: `100%` }}>
            <ReactFlowProvider>
                <NetworkTree ns={ns} />
            </ReactFlowProvider>
        </div>,
    );

    while (true) {
        await ns.asleep(10000);
    }
}
