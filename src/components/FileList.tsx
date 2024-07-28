const { React } = globalThis;

export type File = { name: string; type: "file" };
export type Folder = {
    name: string;
    type: "folder";
    children: Map<string, Folder | File>;
};

interface TreeNodeProps {
    node: Folder | File;
    prefix: string;
    isLast: boolean;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, prefix, isLast }) => {
    const isFolder = node.type === "folder";

    const branch = isLast ? "└── " : "├── ";
    const vertical = isLast ? "    " : "│   ";

    return (
        <div>
            <span>{prefix + branch + node.name}</span>
            {isFolder &&
                Array.from((node as Folder).children.values())
                    .sort((a, b) => (a.type === b.type ? 0 : a.type === "file" ? -1 : 1))
                    .map((child, index, array) => (
                        <TreeNode
                            key={child.name}
                            node={child}
                            prefix={prefix + vertical}
                            isLast={index === array.length - 1}
                        />
                    ))}
        </div>
    );
};

interface FolderStructureProps {
    root: Folder;
}

const FolderStructure: React.FC<FolderStructureProps> = ({ root }) => {
    return (
        <div>
            <span>{root.name}</span>
            {Array.from(root.children.values())
                .sort((a, b) => (a.type === b.type ? 0 : a.type === "file" ? -1 : 1))
                .map((child, index, array) => (
                    <TreeNode key={child.name} node={child} prefix="" isLast={index === array.length - 1} />
                ))}
        </div>
    );
};

export { FolderStructure as FileList };
