import { NS, Server } from "@ns";
import { SERVER_NODE_STYLE, ServerNode } from "./ServerNode";
import { apply } from "/system/dependencies";
import { getServerGraph, TreeNode } from "/lib/servers/graph";
import { Edge, Node, type Position } from "reactflow";
import { auto } from "/system/proc/auto";
import { splitFilter } from "/lib/lib";
import { connect } from "/lib/servers/connect";
import { FileList } from "/components/FileList";
import { ProcessList } from "/components/ProcessList";

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
        Panel,
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
        },
    };

    function pushGrid(x: number, y: number, data: GridData) {
        if (grid.has(x, y))
            console.warn(
                `Overriding old grid data at ${x}, ${y}`,
                grid.grid[x][y],
            );
        const row = (grid.grid[x] ??= {});
        row[y] = data;

        grid.minX = Math.min(grid.minX, x);
        grid.minY = Math.min(grid.minY, y);
        grid.maxX = Math.max(grid.maxX, x);
        grid.maxY = Math.max(grid.maxY, y);
    }

    pushGrid(0, 0, {
        server: "home",
        handles: [
            ["source", PositionEnum.Right],
            ["source", PositionEnum.Left],
        ],
    });

    const [purchasedServers, children] = splitFilter(
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
                const handles: [HandleType, Position][] = [
                    ["target", PositionEnum.Left],
                ];
                if (node.children.size > 0) {
                    handles.push(["source", PositionEnum.Right]);
                    next.push([
                        { x, y, name: node.name },
                        [...node.children.values()],
                    ]);
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
        const lower = {
            value: y + Math.floor(nodes.length / 2),
            direction: -1,
        };
        const upper = { value: y - Math.floor(nodes.length / 2), direction: 1 };

        function contiguousFree(from: number, direction: number) {
            if (
                !canGrow &&
                (from + (nodes.length - 1) * direction > grid.maxY ||
                    from + (nodes.length - 1) * direction < grid.minY)
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
            const [a, b] = [lower, upper].sort(
                (a, b) => Math.abs(a.value) - Math.abs(b.value),
            );
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

    const PURCHASED_HANDLES: [HandleType, Position][] = [
        ["target", PositionEnum.Right],
    ];
    let x = -1;

    while (purchasedServers.length > 0) {
        for (let y = grid.minY; y <= grid.maxY; y++) {
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

    for (const { x, y, data } of grid) {
        pushNode(data.server, x * SPACE_X, y * SPACE_Y, data.handles);
    }

    return { nodes: initialNodes, edges: initialEdges };
}

// FIXME: Dagre layouting doesn't seem to work.
// TODO: implement splitting of purchased and other servers similar to normal `getLayoutedElements`.
function getLayoutedElementsDagre(ns: NS): { nodes: Node[]; edges: Edge[] } {
    const tree = getServerGraph(ns).toTree("home");

    function getElements(
        node: TreeNode,
        nodes: Node[] = [],
        edges: Edge[] = [],
    ) {
        nodes.push(
            ...[...node.children.values()].map((child) => {
                const handles = [["target", PositionEnum.Left]];
                if (child.children.size > 0)
                    handles.push(["source", PositionEnum.Right]);

                return {
                    id: child.name,
                    position: { x: 0, y: 0 },
                    type: "server",
                    data: {
                        server: ns.getServer(child.name),
                        ns,
                        handles,
                    },
                };
            }),
        );

        edges.push(
            ...[...node.children.values()].map((child) => {
                return {
                    id: `${node.name}-${child.name}`,
                    source: node.name,
                    target: child.name,
                    type: "smoothstep",
                };
            }),
        );

        for (const child of node.children.values()) {
            const { nodes: childNodes, edges: childEdges } = getElements(child);

            nodes.push(...childNodes);
            edges.push(...childEdges);
        }

        return { nodes, edges };
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
            ],
        },
    });

    dagreGraph.setGraph({ rankdir: "LR" });

    for (const node of nodes) {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    }

    for (const edge of edges) {
        dagreGraph.setEdge(edge.source, edge.target);
    }

    dagre.layout(dagreGraph);

    const positionedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            ...node,
            position: {
                x: nodeWithPosition.x,
                y: nodeWithPosition.y,
            },
        };
    });

    return { nodes: positionedNodes, edges };
}

function NetworkTree({ ns }: { ns: NS }): React.ReactElement {
    const { nodes: initialNodes, edges: initialEdges } =
        getLayoutedElements(ns);

    const [nodes, , onNodesChange] = useNodesState(initialNodes);
    const [edges, , onEdgesChange] = useEdgesState(initialEdges);
    const [serverMenuState, setServerMenuState] = React.useState<{
        server: string;
    } | null>(null);

    for (const node of nodes) {
        if (node.type === "server") {
            node.data.setInfoData = (server: string) => {
                if (server) setServerMenuState({ server });
                else setServerMenuState(null);
            };
        }
    }

    return (
        <>
            {serverMenuState && (
                <ServerMenu ns={ns} server={serverMenuState.server} />
            )}
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
        </>
    );
}

const SERVER_MENU_STYLE = {
    ".server-menu": {
        background: "black",
        width: "fit-content",
        "min-width": "300px",
        height: "fit-content",
        "max-height": "600px",
        "overflow-y": "scroll",
        margin: "10px",
        border: "1px solid green",
        display: "flex",
        "flex-direction": "column",
    },
    ".server-menu>button": {
        background: "#333",
        color: "#0f0",
        border: "1px solid #0f0",
        transition: "background 0.2s",
        "padding-bottom": "10px",
        "padding-top": "10px",
        "font-size": "16px",
    },
    ".server-menu>button:hover": {
        background: "#000",
    },
    ".server-manu>button:active": {
        background: "#090",
    },
    ".process-list": {
        display: "flex",
        "flex-direction": "column",
    },
};

type File = { name: string; type: "file" };
type Folder = {
    name: string;
    type: "folder";
    children: Map<string, Folder | File>;
};

function parseFileList(files: string[]): Folder {
    const paths = files.map((file) => file.split("/"));

    const root = {
        name: "root",
        type: "folder" as const,
        children: new Map<string, Folder | File>(),
    };

    for (const path of paths) {
        let currentFolder = root;
        const file = path.pop();
        if (!file) continue;

        for (const folder of path) {
            if (!currentFolder.children.has(folder)) {
                currentFolder.children.set(folder, {
                    name: folder,
                    type: "folder",
                    children: new Map(),
                });
            }
            currentFolder = currentFolder.children.get(folder) as Folder;
        }

        currentFolder.children.set(file, { name: file, type: "file" });
    }

    return root;
}

function ServerMenu({ ns, server }: { ns: NS; server: string }) {
    // .cct
    const [includeCcts, setCcts] = React.useState(true);
    // .json, .js
    const [includeScripts, setScripts] = React.useState(false);
    // .lit, .txt, .msg
    const [includeTxts, setTxts] = React.useState(true);
    // .exe
    const [includePrograms, setPrograms] = React.useState(true);

    const files = React.useMemo(() => {
        return ns.ls(server).filter((file) => {
            if (!includeCcts && file.endsWith(".cct")) return false;
            if (
                !includeScripts &&
                (file.endsWith(".json") || file.endsWith(".js"))
            )
                return false;
            if (
                !includeTxts &&
                (file.endsWith(".lit") ||
                    file.endsWith(".txt") ||
                    file.endsWith(".msg"))
            )
                return false;
            if (!includePrograms && file.endsWith(".exe")) return false;
            return true;
        });
    }, [server, includeCcts, includeScripts, includeTxts, includePrograms]);

    const root = parseFileList(files);

    const processes = React.useMemo(() => {
        return ns.ps(server);
    }, [server]);

    return (
        <Panel position="bottom-right">
            <div className="server-menu">
                <h3 style={{ padding: 0, margin: 0 }}>{server}</h3>
                <button onClick={() => connect(ns, server)}>Connect</button>
                <details>
                    <summary>Files</summary>
                    <label htmlFor="ccts">CCTs</label>
                    <input
                        type="checkbox"
                        id="ccts"
                        checked={includeCcts}
                        onChange={() => setCcts(!includeCcts)}
                    />
                    <label htmlFor="scripts">Scripts</label>
                    <input
                        type="checkbox"
                        id="scripts"
                        checked={includeScripts}
                        onChange={() => setScripts(!includeScripts)}
                    />
                    <label htmlFor="txts">Texts</label>
                    <input
                        type="checkbox"
                        id="txts"
                        checked={includeTxts}
                        onChange={() => setTxts(!includeTxts)}
                    />
                    <label htmlFor="programs">Programs</label>
                    <input
                        type="checkbox"
                        id="programs"
                        checked={includePrograms}
                        onChange={() => setPrograms(!includePrograms)}
                    />
                    <div
                        style={
                            {
                                display: "flex",
                                "flex-direction": "column",
                            } as any
                        }
                    >
                        <FileList root={root} />
                    </div>
                </details>
                <details>
                    <summary>Processes</summary>
                    <div
                        style={
                            {
                                display: "flex",
                                "flex-direction": "column",
                            } as any
                        }
                    >
                        <ProcessList
                            processes={processes}
                            server={server}
                            ns={ns}
                        />
                    </div>
                </details>
            </div>
        </Panel>
    );
}

export async function main(ns: NS) {
    auto(ns, { tag: "system" });
    ns.disableLog("ALL");
    ns.clearLog();

    await apply({
        node: "rawStylesheet",
        id: "server-graph-styles",
        style: SERVER_NODE_STYLE,
    });

    await apply({
        node: "rawStylesheet",
        id: "server-graph-server-menu-styles",
        style: SERVER_MENU_STYLE as any,
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
