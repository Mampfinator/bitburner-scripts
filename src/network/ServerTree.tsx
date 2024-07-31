import { NS } from "@ns";
import { ServerMenu } from "./ServerMenu";
import { ServerNode } from "./ServerNode";
import { getServerGraph, TreeNode } from "/lib/servers/graph";
import { findExtremes, splitFilter } from "/lib/lib";
import type { Edge, Node, Position } from "reactflow";

const {
    React,
    ReactFlow: {
        ReactFlowProvider,
        ReactFlow,
        Controls,
        useNodesState,
        useEdgesState,
        Position: PositionEnum,
        getNodesBounds,
    },
    //dagre,
} = globalThis;

export const SPACE_X = 230;
export const SPACE_Y = 115;

class NodeGrid<T extends Omit<Node, "position"> = Omit<Node, "position">> {
    private grid: Record<string, Record<string, T>> = {};

    public maxX = 0;
    public maxY = 0;
    public minX = 0;
    public minY = 0;

    constructor(private defaultValue: Partial<T> = {}) {}

    set(x: number, y: number, value: T) {
        if (this.has(x, y)) console.warn("Overwriting node", x, y, value);
        const row = (this.grid[x] ??= {});
        row[y] = { ...this.defaultValue, ...value };

        this.minX = Math.min(this.minX, x);
        this.minY = Math.min(this.minY, y);
        this.maxX = Math.max(this.maxX, x);
        this.maxY = Math.max(this.maxY, y);
    }

    *[Symbol.iterator]() {
        for (let x = this.minX; x <= this.maxX; x++) {
            for (let y = this.minY; y <= this.maxY; y++) {
                const value = this.grid[x]?.[y];
                if (value) yield { x, y, value };
            }
        }
    }

    has(x: number, y: number) {
        return this.grid[x]?.[y] !== undefined;
    }

    toNodesArray(): Node[] {
        return [...this].map(({ x, y, value }) => {
            return {
                ...value,
                position: { x: x * SPACE_X, y: y * SPACE_Y },
            };
        });
    }
}

function getLayoutedElements(ns: NS, purchasedServerContainers: boolean = false): { nodes: Node[]; edges: Edge[] } {
    const serverGraph = getServerGraph(ns, {
        startFrom: "home",
        backdoorIsHomeLink: false,
    });

    const tree = serverGraph.toTree("home");

    const initialEdges: Edge[] = [];

    type HandleType = "source" | "target";

    const grid = new NodeGrid({ type: "server", data: { ns } });

    grid.set(0, 0, {
        id: "home",
        data: {
            server: servers.get("home")!,
            handles: [
                ["source", PositionEnum.Right],
                ["source", PositionEnum.Left],
            ],
            ns,
        },
    });

    const [allPurchased, children] = splitFilter(
        [...tree.children.values()],
        (element) => ns.getServer(element.name).purchasedByPlayer,
    );

    const next: [{ name: string; x: number; y: number }, TreeNode[]][] = [
        [{ name: "home", x: 0, y: 0 }, [...children.values()]],
    ];
    while (next.length > 0) {
        const current = next.shift()!;
        const [{ name: parent, x: parentX, y: parentY }, nodes] = current;

        const x = parentX + 1;
        let y = parentY;

        function push(direction: number) {
            for (const node of nodes) {
                const handles: [HandleType, Position][] = [["target", PositionEnum.Left]];
                if (node.children.size > 0) {
                    handles.push(["source", PositionEnum.Right]);
                    next.push([{ x, y, name: node.name }, [...node.children.values()]]);
                }

                grid.set(x, y, {
                    id: node.name,
                    data: {
                        server: servers.get(node.name)!,
                        handles,
                        ns,
                    },
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
        const lower = {
            value: y + Math.floor(nodes.length / 2),
            direction: -1,
        };
        const upper = { value: y - Math.floor(nodes.length / 2), direction: 1 };

        function contiguousFree(from: number, direction: number) {
            if (
                !canGrow &&
                (from + (nodes.length - 1) * direction > grid.maxY || from + (nodes.length - 1) * direction < grid.minY)
            )
                return false;
            for (let i = 0; i < nodes.length; i++) {
                if (grid.has(x, from + i * direction)) return false;
            }
            return true;
        }

        while (true) {
            if (
                !canGrow &&
                (lower.value <= grid.minY || lower.value >= grid.maxY) &&
                (upper.value <= grid.minY || upper.value >= grid.maxY)
            ) {
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
                lower.value--;
            }

            if (upper.value < grid.maxY || canGrow) {
                upper.value++;
            }
        }
    }

    const PURCHASED_HANDLES: [HandleType, Position][] = [["target", PositionEnum.Right]];

    const [hacknet, purchased] = splitFilter(
        allPurchased.map((element) => globalThis.servers.get(element.name)!),
        (server) => server.isHacknetServer,
    );

    const rows = Math.abs(grid.maxY - grid.minY) + 1;
    const purchasedRows = Math.ceil((purchased.length / allPurchased.length) * rows);
    const purchasedRowLength = Math.round(purchased.length / purchasedRows);

    let x = -1;
    let y = grid.minY;

    const purchasedGrid = new NodeGrid({ type: "server" });
    for (let i = 0; i < purchasedRows; i++) {
        x = -1;
        const row = purchased.slice(i * purchasedRowLength, (i + 1) * purchasedRowLength);
        for (let j = 0; j < row.length; j++) {
            purchasedGrid.set(x, y, {
                id: row[j].hostname,
                data: {
                    server: row[j],
                    handles: purchasedServerContainers ? undefined : PURCHASED_HANDLES,
                    ns,
                },
            });

            if (!purchasedServerContainers)
                initialEdges.push({
                    id: `home-${row[j].hostname}`,
                    source: "home",
                    target: row[j].hostname,
                    sourceHandle: "1",
                });

            x -= 1;
        }
        y += 1;
    }

    const purchasedNodes = purchasedGrid.toNodesArray();
    if (purchasedServerContainers && purchasedNodes.length > 0) {
        const bounds = getNodesBounds(purchasedNodes);

        const growX = SPACE_X * 0.5;
        const growY = SPACE_Y * 0.5;

        purchasedNodes.unshift({
            id: "purchased-container",
            type: "output",
            position: { x: bounds.x - growX / 4 + 14, y: bounds.y - growY / 4 },
            style: {
                zIndex: -1,
                background: "rgba(0, 48, 32, 0.85)",
                width: bounds.width + 2 * growX,
                height: bounds.height + 2 * growY,
            },
            targetPosition: PositionEnum.Right,
            data: {},
        });

        initialEdges.push({
            id: "purchased-container-home",
            source: "home",
            target: "purchased-container",
            sourceHandle: "1",
        });
    }

    const hacknetRows = rows - purchasedRows;
    const hacknetRowLength = Math.round(hacknet.length / hacknetRows);

    const hacknetGrid = new NodeGrid({ type: "server" });

    for (let i = 0; i < hacknetRows; i++) {
        x = -1;
        const row = hacknet.slice(i * hacknetRowLength, (i + 1) * hacknetRowLength);
        for (let j = 0; j < row.length; j++) {
            hacknetGrid.set(x, y, {
                id: row[j].hostname,
                data: {
                    server: row[j],
                    handles: purchasedServerContainers ? undefined : PURCHASED_HANDLES,
                    ns,
                },
            });

            if (!purchasedServerContainers)
                initialEdges.push({
                    id: `home-${row[j].hostname}`,
                    source: "home",
                    target: row[j].hostname,
                    sourceHandle: "1",
                });

            x -= 1;
        }
        y += 1;
    }

    const hacknetNodes = hacknetGrid.toNodesArray();
    if (purchasedServerContainers && hacknetNodes.length > 0) {
        const bounds = getNodesBounds(hacknetNodes);

        const growX = SPACE_X * 0.5;
        const growY = SPACE_Y * 0.5;

        hacknetNodes.unshift({
            id: "hacknet-container",
            type: "output",
            position: { x: bounds.x - growX / 4 + 14, y: bounds.y - growY / 4 },
            style: {
                zIndex: -1,
                background: "rgba(0, 48, 32, 0.85)",
                width: bounds.width + 2 * growX,
                height: bounds.height + 2 * growY,
            },
            targetPosition: PositionEnum.Right,
            data: {},
        });

        initialEdges.push({
            id: "hacknet-container-home",
            source: "home",
            target: "hacknet-container",
            sourceHandle: "1",
        });
    }

    return { nodes: [...grid.toNodesArray(), ...purchasedNodes, ...hacknetNodes], edges: initialEdges };
}

export function ServerTree({
    ns,
    purchasedServerContainers = false,
}: {
    ns: NS;
    purchasedServerContainers?: boolean;
}): React.ReactElement {
    const { nodes: initialNodes, edges: initialEdges } = React.useMemo(
        () => getLayoutedElements(ns, purchasedServerContainers),
        [],
    );

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [serverMenuState, setServerMenuState] = React.useState<{
        server: string;
    } | null>(null);

    React.useEffect(() => {
        const cleanupFns = [
            globalThis.eventEmitter.withCleanup(
                "server:added",
                () => {
                    const { nodes, edges } = getLayoutedElements(ns, purchasedServerContainers);
                    setNodes(nodes);
                    setEdges(edges);
                },
                ns,
            ),
            globalThis.eventEmitter.withCleanup(
                "server:deleted",
                () => {
                    const { nodes, edges } = getLayoutedElements(ns, purchasedServerContainers);
                    setNodes(nodes);
                    setEdges(edges);
                },
                ns,
            ),
        ];

        return () => {
            for (const fn of cleanupFns) fn();
        };
    });

    for (const node of nodes) {
        if (node.type === "server") {
            node.data.setInfoData = (server: string) => {
                if (server) setServerMenuState({ server });
                else setServerMenuState(null);
            };
        }
    }

    const height = React.useMemo(() => {
        const {
            min: {
                position: { y: minY },
            },
            max: {
                position: { y: maxY },
            },
        } = findExtremes(nodes, (node) => node.position.y)!;

        const height = Math.abs(maxY - minY);

        return height;
    }, [nodes]);

    return (
        <div style={{ height: `${height}px`, width: `100%` }}>
            <ReactFlowProvider>
                {serverMenuState && <ServerMenu ns={ns} server={serverMenuState.server} />}
                <ReactFlow
                    nodes={nodes}
                    onNodesChange={onNodesChange}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    edges={edges}
                    onEdgesChange={onEdgesChange}
                    nodeTypes={{ server: ServerNode }}
                    proOptions={{ hideAttribution: true }}
                >
                    <Controls position="bottom-left" />
                </ReactFlow>
            </ReactFlowProvider>
        </div>
    );
}
