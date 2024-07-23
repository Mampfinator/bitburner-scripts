//! This is kinda the core of 
import { NS } from "@ns";
import { compressTime, getCompressionFactor, uncompressTime } from "./compress-time";
import { MessageBus } from "/lib/messages";
import { formatTime } from "/lib/lib";

const { React } = globalThis;

export interface SystemDashboardProps {
    ns: NS;
    messageBus: MessageBus<SystemDashboardMessage>;
}

export type SystemDashboardMessage = {};

export function SystemDashboard(props: SystemDashboardProps) {
    const { messageBus, ns } = props;

    const handler =(message: SystemDashboardMessage) => {

    }

    React.useEffect(() => {
        messageBus.subscribe(handler);

        return () => {
            messageBus.unsubscribe(handler);
        }
    });

    return <div style={{display: "flex", flexDirection: "column", border: "1px 1px 1px 1px rgba(0, 48, 32, 0.85) solid"}}>
        <MemoryInspector ns={ns}/>
        <TimeCompression ns={ns}/>
    </div>
}

/**
 * Control time compression here.
 */
function TimeCompression({ns} : {ns: NS}) {
    const [factor, setFactor] = React.useState(getCompressionFactor());
    const [exampleTime, setExampleTime] = React.useState(5 * 60 * 1000);

    const [dummystate, setDummystate] = React.useState(0);

    const {primary: color, primaryBright} = ns.ui.getTheme();

    return <div style={{display: "flex", flexDirection: "column", border: "1px 1px 1px 1px rgba(0, 48, 32, 0.85) solid"}}>
        <h3 style={{color: primaryBright}}>Time Compression</h3>
        <span>{
            getCompressionFactor() === 1 ? "Time is flowing as normal." : 
            getCompressionFactor() < 0 ? "Actions are instantaneous" :
            `Time is sped up by ${getCompressionFactor()}x`
        }</span>
        <span>
            <button onClick={() => {compressTime(factor); setDummystate(() => Math.random());}}>Compress time</button>
             by <input style={{border: "1px rgba(0, 48, 32, 0.85) solid", color, background: "none"}} type="number" value={factor} onChange={(e) => { const n = Number(e.currentTarget.value); if (n !== 0) setFactor(n)}} min={-1}/>x
            (
            <select style={{border: "1px rgba(0, 48, 32, 0.85) solid", color, background: "none"}} name="time" onChange={(e) => setExampleTime(Number(e.currentTarget.value))}>
                <option value={5 * 60 * 1000}>5m</option>
                <option value={30 * 60 * 1000}>30m</option>
                <option value={60 * 60 * 1000}>1h</option>
                <option value={12 * 60 * 60 * 1000}>12h</option>
                <option value={24 * 60 * 60 * 1000}>1d</option>
                <option value={7 * 24 * 60 * 60 * 1000}>7d</option>
            </select> = {formatTime((exampleTime) / factor)})
        </span>
        <button style={{alignSelf: "start"}} onClick={() => { uncompressTime(); setFactor(1); }}>Uncompress time</button>
    </div>
}

function MemoryInspector({ns}: {ns: NS}) {
    const [open, setOpen] = React.useState(false);

    return <div>
        <button onClick={() => setOpen(!open)}>Inspect Memory</button>
        <dialog open={open}>
            Hello, world!
        </dialog>
    </div>
}

export async function main(ns: NS) {
    ns.disableLog("ALL");
    ns.clearLog();

    const messageBus = new MessageBus();

    ns.printRaw(<SystemDashboard ns={ns} messageBus={messageBus}/>)

    while (true) {
        await ns.asleep(50000);
    }
}