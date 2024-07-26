const { React } = globalThis;

const CONTAINER_STYLE: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    margin: "20px",
};

const BAR_STYLE: React.CSSProperties = {
    width: "0%",
    height: "auto",
};

const VALUE_STYLE: React.CSSProperties = {};

export interface ProgressProps {
    progress: number;
    label?: string;
    barColor?: string;
    fontSize?: string;
}

export const ProgressBar = ({
    progress,
    label,
    barColor,
    fontSize,
}: ProgressProps) => {
    return (
        <div style={CONTAINER_STYLE}>
            <div
                style={{
                    ...BAR_STYLE,
                    width: `${progress}%`,
                    backgroundColor: barColor ?? "green",
                }}
            />
            {label ? (
                label
            ) : (
                <div
                    style={{ ...VALUE_STYLE, fontSize: fontSize ?? "0.75rem" }}
                >
                    {progress}
                </div>
            )}
        </div>
    );
};
