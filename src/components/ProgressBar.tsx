const { React } = globalThis;

const CONTAINER_STYLE: React.CSSProperties = {
    display: "flex",
    flexDirection: "row",
    margin: "20px",
};

const BAR_STYLE: React.CSSProperties = {
    height: "25px",
    padding: 0,
    margin: 0,
};

export interface ProgressProps {
    progress: number;
    barHeight?: string;
    barColor?: string;
}

export const ProgressBar = ({ progress, barHeight, barColor }: ProgressProps) => {
    return (
        <div style={{...CONTAINER_STYLE, border: `1px solid ${barColor ?? "green"}`}} data-progress={progress}>
            <div
                style={{
                    ...BAR_STYLE,
                    width: `${progress * 100}%`,
                    background: barColor ?? "green",
                    height: barHeight ?? "25px",
                }}
            />
        </div>
    );
};
