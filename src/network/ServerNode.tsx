import { Server } from "@ns";
import { Position } from "reactflow";

const {
    React,
    ReactFlow: { Handle },
} = globalThis;

interface ServerNodeProps {
    data: {
        server: Server;
        handles?: ["target" | "source", Position][]
    }
}

const SPECIAL_SERVERS = new Set([
    "CSEC",
    "avmnite-02h",
    "I.I.I.I",
    "run4theh111z",
    "fulcrumassets",
]);

function getClassName(server: Server): string {
    const classes = [];

    if (server.hostname === "home") classes.push("home");
    else if (server.hostname === "w0rld_d4em0n") classes.push("w0rld_d4em0n");
    else if (SPECIAL_SERVERS.has(server.hostname)) classes.push("special");
    else if (server.purchasedByPlayer) classes.push("purchased");
    else if (server.backdoorInstalled) classes.push("backdoor");
    else classes.push("default");

    return classes.join(" ");
}

export const SERVER_NODE_STYLE: Record<string, React.CSSProperties> =  {
    ".server-node": {
        color: "#799973",
        padding: "5px",
        paddingTop: 0,
        paddingBottom: 0,
        border: "1px solid green",
    },
    ".server-node.default": {
        background: "#2f4858",
    },
    ".server-node.home": {
        background: "#2a2a1c",
    },
    ".server-node.w0rld_d4em0n": {
        background: "#ff3571",
    },
    ".server-node.special": {
        background: "#004b75",
    },
    ".server-node.purchased": {
        background: "#005f74",
    },
    ".server-node.backdoor": {
        background: "#005f74",
    },

}


export function ServerNode({ data: {server, handles} }: ServerNodeProps): React.ReactElement {
    const className = getClassName(server);

    return (
        <>
            { handles && handles.map(([type, position], i) => <Handle type={type} position={position} id={`${i}`}/>) }
            <div className={"server-node " + className}>
                <h3 className={"server-name " + className}>{server.hostname}</h3>
            </div>
        </>
    );
}
