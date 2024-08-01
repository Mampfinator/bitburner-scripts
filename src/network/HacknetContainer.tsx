import { NS } from "@ns";

const {
    React,
    ReactFlow: { Handle, Position },
} = globalThis;

export interface HacknetContainerData {
    ns: NS;
    width: number;
    height: number;
}

function getHashes(ns: NS) {
    return ns.hacknet.numHashes();
}

function getHashCapacity(ns: NS) {
    return ns.hacknet.hashCapacity();
}

function ifIsNaN(value: number, defaultValue: number) {
    return isNaN(value) ? defaultValue : value;
}

function getHashRate(ns: NS): { actual: number; theoretical: number } {
    let actual = 0;
    let theoretical = 0;

    for (let i = 0; i < ns.hacknet.numNodes(); i++) {
        const stats = ns.hacknet.getNodeStats(i);
        const production = stats.production;
        theoretical += production;

        let actualProduction;
        if (stats.ramUsed! === stats.ram) actualProduction = 0;
        else if (stats.ramUsed === 0) actualProduction = production;
        else actualProduction = production / (stats.ram - stats.ramUsed!);
        actual += actualProduction;
    }

    return { actual, theoretical };
}

export function HacknetContainer({ data: { ns, width, height } }: { data: HacknetContainerData }) {
    const [hashes, setHashes] = React.useState(getHashes(ns));
    const [hashCapacity, setHashCapacity] = React.useState(getHashCapacity(ns));
    const [hashRate, setHashRate] = React.useState(getHashRate(ns));

    React.useEffect(() => {
        const interval = setInterval(() => {
            setHashes(getHashes(ns));
            setHashCapacity(getHashCapacity(ns));
            setHashRate(getHashRate(ns));
        }, 1000);

        return () => {
            clearInterval(interval);
        };
    });

    return (
        <>
            <Handle position={Position.Right} type="target" />
            <div
                style={{
                    width: `${width}px`,
                    height: `${height}px`,
                    display: "flex",
                    flexDirection: "row-reverse",
                    borderRadius: "5px",
                }}
            >
                <div
                    className="info-bar"
                    style={{
                        width: "200px",
                        display: "flex",
                        flexDirection: "column",
                        paddingLeft: "20px",
                        alignContent: "center",
                        flexGrow: 0,
                        borderLeft: "1px solid green",
                        textAlign: "left",
                    }}
                >
                    <h2>Hacknet</h2>
                    <span>Hashes</span>
                    <span>
                        {ns.formatNumber(hashes, 2)}/{ns.formatNumber(hashCapacity, 2)}
                    </span>
                    <br />
                    <span>Hash Rate</span>
                    <span>
                        {ns.formatNumber(hashRate.actual, 1)}/s ({ns.formatNumber(hashRate.theoretical, 1)}/s)
                    </span>
                </div>
            </div>
        </>
    );
}
