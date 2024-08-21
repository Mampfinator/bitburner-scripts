import { HWGWWorkerBatch } from "../workers/batch";
import { ProgressBar } from "/components/ProgressBar";

const {
    React,
    React: { useState, useEffect }
} = globalThis;


export const Batch = ({ batch, id }: { batch: HWGWWorkerBatch, id: string }) => {
    // current progress out of 100
    const [progress, setProgress] = useState(0);

    let totalTime = batch.metadata?.timing.growWeakenTime ?? 0;

    const [currentTime, setCurrentTime] = useState(0);

    batch.on("started", timing => {
        setProgress(0);

        setCurrentTime(0);
        totalTime = timing.growWeakenTime;
    });

    useEffect(() => {
        let last = Date.now();

        const interval = setInterval(() => {
            const now = Date.now();
            setCurrentTime(currentTime + (now - last));
            last = now;

            setProgress(Math.min((currentTime / totalTime) * 100, 100));
        }, 250);

        return () => clearInterval(interval);
    });

    return <div>
        <span>Batch {id}</span>
        <ProgressBar progress={progress / 100}/>
    </div>
}