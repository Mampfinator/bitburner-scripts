import { NS } from "@ns";
import { SERVER_NODE_STYLE, ServerNode } from "./ServerNode";
import { apply } from "/system/dependencies";
import { getServerGraph, TreeNode } from "/lib/servers/graph";
import { Edge, Node, Position } from "reactflow";
import { auto } from "/system/proc/auto";

const WIDTH = 1500;
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
} = globalThis;

function NetworkTree({ ns }: { ns: NS }): React.ReactElement {
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

    pushNode("home", WIDTH / 2, SPACE_Y * 3, [
        ["source", PositionEnum.Left],
        ["source", PositionEnum.Right],
    ]);

    // purchased servers are all connected to home, and should be laid out to the *left* of it,
    // growing downwards
    let y = 0;
    let x = WIDTH / 2 - SPACE_X;

    const maxHeight = [...tree.children.keys()].filter(
        (server) => !server.startsWith("home"),
    ).length;

    let currentMaxX = 0;

    for (const server of [...tree.children.values()]
        .map((node) => node.name)
        .filter((server) => server.startsWith("home"))
        .sort(
            (a, b) =>
                Number(a.replace("home", "")) - Number(b.replace("home", "")),
        )) {
        tree.children.delete(server);
        if (Number(server.replace("home", "")) > 24) continue;

        pushNode(server, x, y * SPACE_Y, [["target", PositionEnum.Right]]);
        initialEdges.push({
            source: "home",
            target: server,
            id: `home-${server}`,
            sourceHandle: "0",
        });

        /*const width = server.length * 10;
        if (currentMaxX < width) currentMaxX = width;*/

        y += 1;
        if (y >= maxHeight) {
            y = 0;
            x -= SPACE_X + currentMaxX;
            currentMaxX = 0;
        }
    }

    const rows: { source: string; target: TreeNode }[][] = [];
    function addRow(node: TreeNode, cameFrom: string, row: number = 0) {
        const currentRow = (rows[row] ??= []);

        currentRow.push({ source: cameFrom, target: node });
        for (const child of node.children.values()) {
            addRow(child, node.name, row + 1);
        }
    }

    for (const node of tree.children.values()) {
        addRow(node, "home");
    }

    x = WIDTH / 2 + SPACE_X;
    //y = 0;
    const startY = 0;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        let handles: [HandleType, Position][];
        if (i === 0) {
            handles = [
                ["target", PositionEnum.Left],
                ["source", PositionEnum.Right],
            ];
        } else if (i === rows.length - 1) {
            handles = [["target", PositionEnum.Left]];
        } else {
            handles = [
                ["source", PositionEnum.Right],
                ["target", PositionEnum.Left],
            ];
        }

        y = startY;
        let rowMaxWidth = 0;
        for (const node of row) {
            pushNode(
                node.target.name,
                x,
                y,
                handles.filter(
                    (handle) =>
                        node.target.children.size > 0 || handle[0] === "target",
                ),
            );
            initialEdges.push({
                source: node.source,
                target: node.target.name,
                id: `${node.source}-${node.target.name}`,
                sourceHandle: i === 0 ? "1" : undefined,
            });

            const width = node.target.name.length * 10;
            if (width > rowMaxWidth) rowMaxWidth = width;
            y += SPACE_Y;
        }
        x += SPACE_X /*+ rowMaxWidth*/;
    }

    const [nodes, , onNodesChange] = useNodesState(initialNodes);
    const [edges, , onEdgesChange] = useEdgesState(initialEdges);

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
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
