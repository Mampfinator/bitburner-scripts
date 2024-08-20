import { BatchManager } from "../scheduler";
import { Batch } from "./Batch";

const { React, React: { useState, useEffect } } = globalThis;

export function BatchManagerView({manager}: {manager: BatchManager}) {
    const [children, setChildren] = useState<React.ReactNode[]>(() => {
        return [...manager.batches.entries()].map(([id, batch]) => {
            return <Batch batch={batch} id={id}/>
        });
    });

    useEffect(() => {
        const cleanups = [
            manager.withCleanup("scheduled", (batch, id) => {
                setChildren([...children, <Batch batch={batch} id={id}/>]);
            }),
        ];

        return () => {
            cleanups.forEach(fn => fn());
        }
    });

    return <div>
        <div>Target: {manager.target.hostname}</div>
        <br/>
        <div style={{display: "flex", flexDirection: "column"}}>
            {children}
        </div>
    </div>
}