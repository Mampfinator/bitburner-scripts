import { NS } from "@ns";
import { File, Folder, FileList } from "/components/FileList";
import { ProcessList } from "/components/ProcessList";
import { connect } from "/lib/servers/connect";

const {
    React,
    ReactFlow: { Panel },
} = globalThis;

export const SERVER_MENU_STYLE = {
    ".server-menu": {
        background: "black",
        width: "fit-content",
        "min-width": "300px",
        height: "fit-content",
        "max-height": "600px",
        "overflow-y": "scroll",
        margin: "10px",
        border: "1px solid green",
        display: "flex",
        "flex-direction": "column",
    },
    ".server-menu>button": {
        background: "#333",
        color: "#0f0",
        border: "1px solid #0f0",
        transition: "background 0.2s",
        "padding-bottom": "10px",
        "padding-top": "10px",
        "font-size": "16px",
    },
    ".server-menu>button:hover": {
        background: "#000",
    },
    ".server-manu>button:active": {
        background: "#090",
    },
    ".process-list": {
        display: "flex",
        "flex-direction": "column",
    },
};

function parseFileList(files: string[]): Folder {
    const paths = files.map((file) => file.split("/"));

    const root = {
        name: "root",
        type: "folder" as const,
        children: new Map<string, Folder | File>(),
    };

    for (const path of paths) {
        let currentFolder = root;
        const file = path.pop();
        if (!file) continue;

        for (const folder of path) {
            if (!currentFolder.children.has(folder)) {
                currentFolder.children.set(folder, {
                    name: folder,
                    type: "folder",
                    children: new Map(),
                });
            }
            currentFolder = currentFolder.children.get(folder) as Folder;
        }

        currentFolder.children.set(file, { name: file, type: "file" });
    }

    return root;
}

/**
 * Context menu for a server.
 */
export function ServerMenu({ ns, server }: { ns: NS; server: string }) {
    // .cct
    const [includeCcts, setCcts] = React.useState(true);
    // .json, .js
    const [includeScripts, setScripts] = React.useState(false);
    // .lit, .txt, .msg
    const [includeTxts, setTxts] = React.useState(true);
    // .exe
    const [includePrograms, setPrograms] = React.useState(true);

    const files = React.useMemo(() => {
        return ns.ls(server).filter((file) => {
            if (!includeCcts && file.endsWith(".cct")) return false;
            if (!includeScripts && (file.endsWith(".json") || file.endsWith(".js"))) return false;
            if (!includeTxts && (file.endsWith(".lit") || file.endsWith(".txt") || file.endsWith(".msg"))) return false;
            if (!includePrograms && file.endsWith(".exe")) return false;
            return true;
        });
    }, [server, includeCcts, includeScripts, includeTxts, includePrograms]);

    const root = parseFileList(files);

    const processes = React.useMemo(() => {
        return ns.ps(server);
    }, [server]);

    return (
        <Panel position="bottom-right">
            <div className="server-menu">
                <h3 style={{ padding: 0, margin: 0 }}>{server}</h3>
                <button onClick={() => connect(ns, server)}>Connect</button>
                <details>
                    <summary>Files</summary>
                    <label htmlFor="ccts">CCTs</label>
                    <input type="checkbox" id="ccts" checked={includeCcts} onChange={() => setCcts(!includeCcts)} />
                    <label htmlFor="scripts">Scripts</label>
                    <input
                        type="checkbox"
                        id="scripts"
                        checked={includeScripts}
                        onChange={() => setScripts(!includeScripts)}
                    />
                    <label htmlFor="txts">Texts</label>
                    <input type="checkbox" id="txts" checked={includeTxts} onChange={() => setTxts(!includeTxts)} />
                    <label htmlFor="programs">Programs</label>
                    <input
                        type="checkbox"
                        id="programs"
                        checked={includePrograms}
                        onChange={() => setPrograms(!includePrograms)}
                    />
                    <div
                        style={
                            {
                                display: "flex",
                                "flex-direction": "column",
                            } as any
                        }
                    >
                        <FileList root={root} />
                    </div>
                </details>
                <details>
                    <summary>Processes</summary>
                    <div
                        style={
                            {
                                display: "flex",
                                "flex-direction": "column",
                            } as any
                        }
                    >
                        <ProcessList processes={processes} server={server} ns={ns} />
                    </div>
                </details>
            </div>
        </Panel>
    );
}
