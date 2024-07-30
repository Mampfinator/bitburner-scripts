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
        setInfoData: (server: string | null) => void;
    };
}

const SPECIAL_SERVERS = new Set(["CSEC", "avmnite-02h", "I.I.I.I", "run4theh111z", "fulcrumassets"]);

interface GetClassNameServer {
    hostname: string;
    purchasedByPlayer: boolean;
    hasAdminRights: boolean;
    backdoorInstalled: boolean;
}

function getClassName(server: GetClassNameServer): string {
    const classes = [];

    if (server.hostname === "home") classes.push("home");
    if (server.hostname === "w0rld_d4em0n") classes.push("w0rld_d4em0n");
    if (SPECIAL_SERVERS.has(server.hostname)) classes.push("special");
    if (server.purchasedByPlayer) classes.push("purchased");
    if (server.backdoorInstalled) classes.push("backdoor");
    if (server.hasAdminRights) classes.push("rooted");

    if (classes.length === 0) classes.push("default");

    return classes.join(" ");
}

export const SERVER_NODE_STYLE = {
    ".server-node": {
        color: "#799973",
        // to match size with backdoor/w0rld_d4em0n
        border: "4px solid transparent",
        padding: "5px",
        paddingTop: 0,
        paddingBottom: 0,
        width: "170px",
        height: "70px",
        background: "#2f4858",
    },
    ".server-node.backdoor": {
        background: "#005f74",
        border: "4px solid green",
    },
    ".server-node.purchased": {
        background: "#005f74",
    },
    ".server-node.special": {
        background: "#004b75",
    },
    ".server-node.w0rld_d4em0n": {
        background: "#ff3571",
        border: "4px solid #e0225a",
    },
    ".server-node.home": {
        background: "#2a2a1c",
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

function MemoryBar({ usage, width, height, defaultColor, capacity, ns }: BarProps): React.ReactElement {
    if (capacity === 0) return <></>;

    return (
        <p
            style={
                {
                    width,
                    height,
                    padding: 0,
                    margin: 0,
                    background: capacity && defaultColor,
                    display: "flex",
                    "flex-direction": "row",
                } as any
            }
            title={
                capacity > 0
                    ? `Used: ${ns.formatRam(sum(usage, ({ amount }) => amount))}/${ns.formatRam(capacity)}`
                    : ""
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
        </p>
    );
}

const GROUP_ORDER = ["unknown", "hack", "grow", "weaken", "share"];

const COLORS: Record<string, string> = {
    unknown: "red",
    hacking: "cyan",
    system: "yellow",
    gang: "orange",
    ccts: "blue",
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

function getColor(tag: string): string {
    if (COLORS[tag]) return COLORS[tag];
    const color = randomColor();
    COLORS[tag] = color;
    return color;
}

function sum<T>(arr: T[], accessor: (item: T) => number): number {
    return arr.reduce((sum, item) => sum + accessor(item), 0);
}

export function ServerNode({ data: { server, handles, ns, setInfoData } }: ServerNodeProps): React.ReactElement {
    const reservations = globalThis.system.memory.list(server.hostname) ?? [];

    const groups = Object.groupBy(reservations, (reservation) => reservation.tag ?? "unknown");

    const initialUsage = [];
    for (const group of [...GROUP_ORDER, ...Object.keys(groups).filter((key) => !GROUP_ORDER.includes(key)).sort()]) {
        if (!groups[group]) continue;
        const amount = sum(groups[group]!, (reservation) => reservation.amount);
        const color = getColor(group);

        initialUsage.push({ title: group, amount, color });
    }

    const [capacity, setCapacity] = React.useState(server.maxRam);
    const [rooted, setRooted] = React.useState(server.hasAdminRights);
    const [backdoored, setBackdoored] = React.useState(server.backdoorInstalled ?? true);
    const [usage, setUsage] = React.useState(initialUsage);

    React.useEffect(() => {
        const cleanupFns = [
            globalThis.eventEmitter.withCleanup(
                "server:ram-updated",
                ({ hostname, newRam }: { hostname: string; newRam: number }) => {
                    if (hostname !== server.hostname) return;
                    setCapacity(newRam);
                },
            ),
            globalThis.eventEmitter.withCleanup("server:rooted", (hostname: string) => {
                if (hostname !== server.hostname) return;
                setRooted(true);
            }),
            globalThis.eventEmitter.withCleanup("server:backdoored", (hostname: string) => {
                if (hostname !== server.hostname) return;
                setBackdoored(true);
            }),
            globalThis.eventEmitter.withCleanup(
                "process:assigned",
                (_, reservation: ReservationDetails | null | undefined) => {
                    if (!reservation || reservation.hostname !== server.hostname) return;

                    let scriptUsage = usage.find(({ title }) => title === (reservation.tag ?? "unknown"));
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
                    if (!reservation || reservation.hostname !== server.hostname) return;

                    const scriptUsage = usage.find(({ title }) => title === (reservation.tag ?? "unknown"));
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
        <div
            onContextMenu={(e) => {
                e.preventDefault();
                setInfoData(server.hostname);
            }}
        >
            {handles && handles.map(([type, position], i) => <Handle type={type} position={position} id={`${i}`} />)}
            <div
                className={
                    "server-node " +
                    getClassName({
                        hostname: server.hostname,
                        hasAdminRights: rooted,
                        backdoorInstalled: backdoored,
                        purchasedByPlayer: server.purchasedByPlayer,
                    })
                }
            >
                <div className={"server-content"}>
                    <h3
                        className={
                            "server-name " +
                            getClassName({
                                hostname: server.hostname,
                                hasAdminRights: rooted,
                                backdoorInstalled: backdoored,
                                purchasedByPlayer: server.purchasedByPlayer,
                            })
                        }
                    >
                        {server.hostname.length <= 14 ? (
                            server.hostname
                        ) : (
                            <p style={{ padding: 0, margin: 0 }} title={server.hostname}>
                                {server.hostname.substring(0, 11)}...
                            </p>
                        )}
                    </h3>
                    <MemoryBar
                        ns={ns}
                        capacity={capacity}
                        usage={usage}
                        width="95%"
                        height="25px"
                        defaultColor="green"
                    />
                </div>
            </div>
        </div>
    );
}
