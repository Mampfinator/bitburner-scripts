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

export const SERVER_NODE_STYLE =  {
    ".server-node": {
        color: "#799973",
        padding: "5px",
        paddingTop: 0,
        paddingBottom: 0,
        border: "1px solid green",
        width: "170px",
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
    ".server-content": {
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        display: "flex",
        "flex-direction": "column",
        "justify-items": "center",
        "align-items": "center",
    },
    ".server-name": {
        top: 0,
        bottom: 0,
        margin: 0,
        "margin-block": 0,
    }
} as Record<string, React.CSSProperties>;

interface BarProps {
    capacity: number;
    usage: { color: string, amount: number }[];
    width?: string;
    height?: string;
    borderColor?: string;
    defaultColor?: string;
}

function MemoryBar({ usage, width, height, borderColor, defaultColor, capacity }: BarProps): React.ReactElement {
    return <div style={{width, height, border: `1px solid ${borderColor ?? "green"}`, background: capacity && defaultColor}}>
        { usage.filter(({amount}) => amount > 0).map(({color, amount}) => <div style={{height, width: `${(amount / capacity) * 100}%`, background: color}}></div> )}
    </div>
}


export function ServerNode({ data: {server, handles} }: ServerNodeProps): React.ReactElement {
    const className = getClassName(server);

    return (
        <div>
            { handles && handles.map(([type, position], i) => <Handle type={type} position={position} id={`${i}`}/>) }
            <div className={"server-node " + className}>
                <div className={"server-content"}>
                    <h3 className={"server-name " + className}>{server.hostname.length <= 14 ? server.hostname : <p style={{padding: 0, margin: 0}} title={server.hostname}>{server.hostname.substring(0, 11)}...</p>}</h3>
                    <MemoryBar capacity={server.maxRam} usage={[{color: "red", amount: server.ramUsed}]} width="95%" height="30px" defaultColor="green"/>
                </div>
            </div>
        </div>
    );
}
