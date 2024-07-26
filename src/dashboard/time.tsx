import { NS } from "@ns";
import {
    compressTime,
    getCompressionFactor,
    uncompressTime,
} from "/system/compress-time";
import { formatTime } from "/lib/lib";

const { React } = globalThis;

/**
 * Control time compression here.
 */
export function TimeCompression({ ns }: { ns: NS }) {
    const [factor, setFactor] = React.useState(getCompressionFactor());
    const [exampleTime, setExampleTime] = React.useState(5 * 60 * 1000);

    const [dummystate, setDummystate] = React.useState(0);

    const { primary: color, primaryBright } = ns.ui.getTheme();

    return (
        <div
            data-dummy={dummystate}
            style={{
                display: "flex",
                flexDirection: "column",
                border: "2px solid rgba(0, 48, 32, 0.85)",
            }}
        >
            <h3 style={{ color: primaryBright }}>Time Compression</h3>
            <span>
                {getCompressionFactor() === 1
                    ? "Time is flowing as normal."
                    : getCompressionFactor() < 0
                      ? "Actions are instantaneous"
                      : `Time is sped up by ${getCompressionFactor()}x`}
            </span>
            <span>
                <button
                    onClick={() => {
                        compressTime(factor);
                        setDummystate(() => Math.random());
                    }}
                >
                    Compress time
                </button>
                by{" "}
                <input
                    style={{
                        border: "1px rgba(0, 48, 32, 0.85) solid",
                        color,
                        background: "none",
                    }}
                    type="number"
                    value={factor}
                    onChange={(e) => {
                        const n = Number(e.currentTarget.value);
                        if (n !== 0) setFactor(n);
                    }}
                    min={-1}
                />
                x (
                <select
                    style={{
                        border: "1px rgba(0, 48, 32, 0.85) solid",
                        color,
                        background: "none",
                    }}
                    name="time"
                    onChange={(e) =>
                        setExampleTime(Number(e.currentTarget.value))
                    }
                >
                    <option value={5 * 60 * 1000}>5m</option>
                    <option value={30 * 60 * 1000}>30m</option>
                    <option value={60 * 60 * 1000}>1h</option>
                    <option value={12 * 60 * 60 * 1000}>12h</option>
                    <option value={24 * 60 * 60 * 1000}>1d</option>
                    <option value={7 * 24 * 60 * 60 * 1000}>7d</option>
                </select>{" "}
                = {formatTime(exampleTime / factor)})
            </span>
            <button
                style={{ alignSelf: "start" }}
                onClick={() => {
                    uncompressTime();
                    setFactor(1);
                }}
            >
                Uncompress time
            </button>
        </div>
    );
}
