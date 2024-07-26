const {
    React,
    ReactFlow: { Handle, Position },
} = globalThis;

interface ServerNodeProps {
    data: {
        name: string;
        purchased: boolean;
        isRooted: boolean;
        isBackdoored: boolean;
    };
}

export function ServerNode({ data }: ServerNodeProps): React.ReactElement {
    return (
        <>
            <Handle type="target" position={Position.Left} />
            <div>
                <h1>{data.name}</h1>
            </div>
            <Handle type="source" position={Position.Right} />
        </>
    );
}
