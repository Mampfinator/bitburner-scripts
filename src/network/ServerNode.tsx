import { Server } from "@ns";

const {
    React,
    ReactFlow: { Handle, Position },
} = globalThis;

interface ServerNodeProps {
    data: Server
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

    if (server.hostname === "w0rld_d4em0n") classes.push("w0rld_d4em0n");
    else if (SPECIAL_SERVERS.has(server.hostname)) classes.push("special");
    else if (server.purchasedByPlayer) classes.push("purchased");
    else if (server.backdoorInstalled) classes.push("backdoor");
    else classes.push("default");

    return classes.join(" ");
}

export function ServerNode({ data: server }: ServerNodeProps): React.ReactElement {
    const className = getClassName(server);

    return (
        <>
            <Handle type="target" position={Position.Left} />
            <div className={"server-node " + className}>
                <h1 className={"server-name " + className}>{server.hostname}</h1>
            </div>
            <Handle type="source" position={Position.Right} />
        </>
    );
}
