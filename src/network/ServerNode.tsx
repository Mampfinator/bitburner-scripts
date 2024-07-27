import { NS, Server } from "@ns";
import { Position } from "reactflow";
import { ReservationDetails } from "/system/memory";

const {
    React,
    ReactFlow: { Handle },
} = globalThis;

interface ServerNodeProps {
    data: {
        server: Server;
        handles?: ["target" | "source", Position][];
        ns: NS;
    };
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

export const SERVER_NODE_STYLE = {
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
    },
} as Record<string, React.CSSProperties>;

interface BarProps {
    capacity: number;
    usage: { color: string; amount: number; title: string }[];
    width?: string;
    height?: string;
    borderColor?: string;
    defaultColor?: string;
    ns: NS;
}

function capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function MemoryBar({
    usage,
    width,
    height,
    borderColor,
    defaultColor,
    capacity,
    ns,
}: BarProps): React.ReactElement {
    return (
        <div
            style={
                {
                    width,
                    height,
                    border: `1px solid ${borderColor ?? "green"}`,
                    background: capacity && defaultColor,
                    display: "flex",
                    "flex-direction": "row",
                } as any
            }
        >
            {usage
                .filter(({ amount }) => amount > 0)
                .map(({ color, amount, title }) => (
                    <p
                        title={`${capitalizeFirst(title)}: ${ns.formatRam(amount)}`}
                        style={{
                            height,
                            width: `${(amount / capacity) * 100}%`,
                            padding: 0,
                            margin: 0,
                            background: color,
                        }}
                    ></p>
                ))}
        </div>
    );
}

const GROUP_ORDER = ["unknown", "hack", "grow", "weaken", "share"];

const COLORS = {
    unknown: "red",
    hack: "cyan",
    grow: "yellow",
    weaken: "magenta",
    share: "purple",
};

function randomColor(): string {
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function sum<T>(arr: T[], accessor: (item: T) => number): number {
    return arr.reduce((sum, item) => sum + accessor(item), 0);
}

export function ServerNode({
    data: { server, handles, ns },
}: ServerNodeProps): React.ReactElement {
    const className = getClassName(server);

    const reservations = globalThis.system.memory.list(server.hostname) ?? [];

    const groups = Object.groupBy(
        reservations,
        (reservation) => reservation.tag ?? "unknown",
    );

    const initialUsage = [];
    for (const group of [
        ...GROUP_ORDER,
        ...Object.keys(groups).filter((key) => !GROUP_ORDER.includes(key)),
    ]) {
        if (!groups[group]) continue;
        const amount = sum(groups[group]!, (reservation) => reservation.amount);
        const color = COLORS[group as keyof typeof COLORS] ?? randomColor();

        initialUsage.push({ title: group, amount, color });
    }

    const [usage, setUsage] = React.useState(initialUsage);

    React.useEffect(() => {
        const cleanupFns = [
            globalThis.eventEmitter.withCleanup(
                "process:assigned",
                (_, reservation: ReservationDetails | null | undefined) => {
                    if (
                        !reservation ||
                        reservation.hostname !== server.hostname
                    )
                        return;

                    let scriptUsage = usage.find(
                        ({ title }) => title === (reservation.tag ?? "unknown"),
                    );
                    if (!scriptUsage) {
                        scriptUsage = {
                            title: reservation.tag ?? "unknown",
                            amount: 0,
                            color: randomColor(),
                        };
                        usage.push(scriptUsage);
                    }
                    scriptUsage.amount += reservation.amount;

                    setUsage([...usage]);
                },
            ),
            globalThis.eventEmitter.withCleanup(
                "process:killed",
                (_, reservation: ReservationDetails | null | undefined) => {
                    if (
                        !reservation ||
                        reservation.hostname !== server.hostname
                    )
                        return;

                    const scriptUsage = usage.find(
                        ({ title }) => title === (reservation.tag ?? "unknown"),
                    );
                    if (!scriptUsage) return;
                    scriptUsage.amount -= reservation.amount;

                    setUsage([...usage]);
                },
            ),
        ];

        return () => {
            cleanupFns.forEach((fn) => fn());
        };
    });

    return (
        <div>
            {handles &&
                handles.map(([type, position], i) => (
                    <Handle type={type} position={position} id={`${i}`} />
                ))}
            <div className={"server-node " + className}>
                <div className={"server-content"}>
                    <h3 className={"server-name " + className}>
                        {server.hostname.length <= 14 ? (
                            server.hostname
                        ) : (
                            <p
                                style={{ padding: 0, margin: 0 }}
                                title={server.hostname}
                            >
                                {server.hostname.substring(0, 11)}...
                            </p>
                        )}
                    </h3>
                    <MemoryBar
                        ns={ns}
                        capacity={server.maxRam}
                        usage={usage}
                        width="95%"
                        height="30px"
                        defaultColor="green"
                    />
                </div>
            </div>
        </div>
    );
}
