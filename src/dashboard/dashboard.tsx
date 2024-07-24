//! This is kinda the core of 
import { NS } from "@ns";
import { MessageBus } from "/lib/messages";
import { TimeCompression } from "./time";
import { MemoryInspector } from "./memory";

const { React } = globalThis;

export interface SystemDashboardProps {
    ns: NS;
    messageBus: MessageBus<SystemDashboardMessage>;
}

export type SystemDashboardMessage = {};

export function SystemDashboard(props: SystemDashboardProps) {
    const { messageBus, ns } = props;

    const handler = (message: SystemDashboardMessage) => {

    }

    React.useEffect(() => {
        messageBus.subscribe(handler);

        return () => {
            messageBus.unsubscribe(handler);
        }
    });

    return <div style={{display: "flex", flexDirection: "column", border: "2px solid rgba(0, 48, 32, 0.85)"}}>
        <MemoryInspector ns={ns}/>
        <TimeCompression ns={ns}/>
    </div>
}