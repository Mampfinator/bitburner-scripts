import { NS } from "@ns";
import { register } from "/system/memory";
import { MessageBus } from "/lib/messages";

const { React } = globalThis;

export type ServerBuyMessage = 
    { name: "toggleAuto" } |
    { name: "setMinRam", exp: number } |
    { name: "setMinMoney", money: number };

interface DashboardProps {
    ns: NS;
    initialAuto?: boolean;
    messageBus: MessageBus<ServerBuyMessage>;
}

export function ServerBuyDashboard(props: DashboardProps) {
    const { ns, messageBus } = props;

    return <div>
        <AutoBuyConfiguration 
            ns={ns}
            messageBus={messageBus}
        />
        <hr style={{width: "100%"}}/>
        <ManualBuyMenu ns={ns}/>
    </div>
}

interface AutobuyProps {
    ns: NS;
    initialAuto?: boolean;
    messageBus: MessageBus<ServerBuyMessage>;
}

function AutoBuyConfiguration(props: AutobuyProps) {
    const { ns, initialAuto, messageBus } = props;

    const [auto, setAuto] = React.useState(initialAuto ?? false);
    const [minRam, setMinRam] = React.useState(0);
    const [minMoney, setMinMoney] = React.useState(0);

    return <div style={{
        display: "flex",
        flexDirection: "column",
        padding: "0.25rem",
        margin: "5px",
        fontSize: "16pt",
    }}>
        <button 
            style={{
                backgroundColor: auto ? "green" : "red",
                padding: "0.25rem",
            }} 
            onClick={() => {
                setAuto(!auto);
                messageBus.send({name: "toggleAuto"})
            }}
        >Automatically buy new servers: {auto ? "Enabled" : "Disabled"}</button>
        <label htmlFor="min-ram">Minimum RAM for new servers: {ns.formatRam(2 ** minRam)}</label>
        <input 
            type="range" 
            id="min-ram" 
            min={0} 
            max={20} 
            value={minRam} 
            onInput={(event) => {
                const exp = Number(event.currentTarget.value);
                setMinRam(exp);
                messageBus.send({name: "setMinRam", exp})
            }}
        />
        <label htmlFor="min-money">Keep at least ${ns.formatNumber(minMoney)}</label>
        <input 
            type="number" 
            min={0} 
            onInput={(event) => {
                const money = Number(event.currentTarget.value);
                setMinMoney(money);
                messageBus.send({name: "setMinMoney", money});
            }}
            value={minMoney}
        />
    </div>
}

interface ManualBuyProps {
    ns: NS;
}

/**
 * Manual buy menu, because the tech store one sucks even more.
 */
function ManualBuyMenu(props: ManualBuyProps) {
    const { ns } = props;

    const [ramExp, setRamExponent] = React.useState(0);
    const [name, setName] = React.useState<undefined | string>(undefined);

    function buy() {
        const serverName = ns.purchaseServer(
            name ?? `home${ns.getPurchasedServers().length}`,
            2 ** ramExp,
        );
        if (!serverName || serverName === "") {
            ns.toast(
                `Failed to buy server. This might mean that you don't have enough money.`,
                "error",
                5000,
            );
        } else {
            ns.toast(
                `Bough server ${name} with ${ns.formatRam(2 ** ramExp)}.`,
                "success",
                5000,
            );

            register({hostname: name!, maxRam: 2 ** ramExp, hasAdminRights: true});
        }
    }

    return <form 
        onSubmit={e => {
            e.preventDefault();
            buy();
            return false;
        }}
        style={{
            display: "flex",
            flexDirection: "column",
            padding: "0.25rem",
            margin: "5px",
            fontSize: "16pt",
        }}
    >
        <label htmlFor="server-ram">RAM: {typeof ramExp == "number" ? ns.formatRam(2 ** ramExp) : "? GB"} | Price: ${ns.formatNumber(ns.getPurchasedServerCost(2 ** ramExp))}</label>
        <input id="server-ram" type="range" min={0} max={20} step={1} value={ramExp} onInput={event => setRamExponent(Number(event.currentTarget.value))}/>
        <input id="server-name" type="text" placeholder="Server Name (defaults to home)" value={name} onInput={e => setName(e.currentTarget.value)}/>
        <input type="submit" value="Manually Buy"/>
    </form>
}
