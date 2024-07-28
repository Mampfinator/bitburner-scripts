import { NS } from "@ns";
import { getMemoryMap, MemInfo } from "/system/memory";

const { React } = globalThis;

export const MemoryInspector = ({ ns }: { ns: NS }) => {
    React.useEffect(() => {
        const interval = setInterval(() => {
            recalculateMem();
        }, 1000);

        return () => {
            clearInterval(interval);
        };
    });

    const [memInfo, setMemInfo] = React.useState<Map<string, { memInfo: MemInfo; actual: number }>>(() =>
        calculateMem(),
    );

    function calculateMem() {
        const map = new Map<string, { memInfo: MemInfo; actual: number }>();

        for (const [hostname, memInfo] of getMemoryMap()) {
            const actual = ns.getServerUsedRam(hostname);

            map.set(hostname, { memInfo, actual });
        }

        return map;
    }

    function recalculateMem() {
        setMemInfo(calculateMem());
    }

    return (
        <div>
            <details>
                <summary>Memory</summary>
                <div>
                    {[...memInfo]
                        .filter(([_, { memInfo, actual }]) => actual > 0 && memInfo.available < memInfo.capacity)
                        .map(([server, { memInfo, actual }]) => (
                            <ServerMemInfo server={server} memInfo={memInfo} actual={actual} />
                        ))}
                </div>
            </details>
        </div>
    );
};

export interface ServerMemInfoProps {
    server: string;
    memInfo: MemInfo;
    actual: number;
}

const ServerMemInfo = (props: ServerMemInfoProps) => {
    const {
        actual,
        server,
        memInfo: { capacity, available },
    } = props;
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                border: "1px solid darkgreen",
            }}
        >
            <UsageBar label={server} max={capacity} valueA={capacity - available} valueB={actual} />
        </div>
    );
};

interface UsageBarProps {
    label: string;
    max: number;
    /**
     * Rendered above valueB.
     */
    valueA: number;
    /**
     * Rendered below valueA.
     */
    valueB: number;
}

const CONTAINER_STYLE: React.CSSProperties = {
    display: "flex",
    height: "calc(0.75rem + 5px)",
    flexDirection: "row",
    alignItems: "center",
    justifyItems: "left",
};

const BAR_STYLE: React.CSSProperties = {
    width: "0%",
    height: "100%",
};

const UsageBar = ({ label, max, valueA, valueB }: UsageBarProps) => {
    if (max < valueA || max < valueB) {
        throw new Error(`Invalid max/valueA/valueB: ${max} supposed to be greater than ${valueA} and ${valueB}`);
    }

    const widthA = valueA / max;
    const widthB = Math.max(valueB / max - widthA, 0);

    return (
        <div>
            <span style={{ position: "absolute" }}>{label}</span>
            <div style={CONTAINER_STYLE}>
                <div
                    style={{
                        ...BAR_STYLE,
                        width: `${widthA * 100}%`,
                        backgroundColor: "blue",
                    }}
                />
                {widthB > 0 && (
                    <div
                        style={{
                            ...BAR_STYLE,
                            width: `${widthB * 100}%`,
                            backgroundColor: "red",
                        }}
                    />
                )}
            </div>
        </div>
    );
};
