//! Remove and resync every single script.
//! Because this removes some core files, we have to also save and reload the game.
import { NS } from "@ns";

// We can't guarantee when cleanup happens, so we don't want to import any scripts that may have been deleted.
function getServerNames(ns: NS, startFrom: string = "home") {
    const hostnames = new Set([startFrom]);
    const queue = [startFrom];

    while (queue.length > 0) {
        const current = queue.shift();

        for (const hostname of ns.scan(current).filter((name) => !hostnames.has(name))) {
            hostnames.add(hostname);
            queue.push(hostname);
        }
    }

    return [...hostnames];
}

const sleep = (ms: number) =>
    new Promise((resolve) => {
        (globalThis.originalSetTimeout ?? globalThis.setTimeout)(resolve, ms);
    });

async function connectToRemoteApi(): Promise<boolean> {
    const doc = eval("document") as Document;

    const settingsButton: HTMLDivElement | null = doc.querySelector(
        "div[role='button']:has(svg[aria-label='Options'])",
    );

    console.log(settingsButton);
    if (!settingsButton) return false;

    settingsButton.click();

    await sleep(500);

    const settingsPage = doc.querySelector(
        "div.MuiContainer-root.MuiContainer-maxWidthLg.MuiContainer-disableGutters.css-5sgl1v",
    );
    console.log(settingsPage);
    if (!settingsPage) return false;

    const settingsTabs = settingsPage.querySelectorAll(
        "div.MuiButtonBase-root.MuiListItemButton-root.MuiListItemButton-gutters.MuiListItemButton-root.MuiListItemButton-gutters.css-1593q0[role='button']",
    );
    console.log(settingsTabs);
    if (!settingsTabs) return false;

    const remoteApi = settingsTabs.item(settingsTabs.length - 1)! as HTMLDivElement;
    console.log(remoteApi);
    remoteApi.click();
    await sleep(500);

    const remoteApiMenu: HTMLDivElement | null = settingsPage.querySelector(
        "div.MuiPaper-root.MuiPaper-elevation.MuiPaper-rounded.MuiPaper-elevation1.css-d7p367",
    );
    if (!remoteApiMenu) return false;

    const connectButton: HTMLButtonElement | null = remoteApiMenu.querySelector(
        "button.MuiButtonBase-root.MuiButton-root.MuiButton-text.css-gew9km[type='button']",
    );
    if (!connectButton) return false;

    connectButton.click();
    // No idea what the timeout for connections is, but we have to wait for the connection to be established.
    await sleep(5000);

    const isConnected = remoteApiMenu.querySelector("svg[data-testid='WifiIcon']") !== null;

    return isConnected;
}

declare global {
    var appSaveFns: {
        triggerSave: () => Promise<void>;
    };
}

export async function main(ns: NS) {
    ns.disableLog("ALL");

    const servers = getServerNames(ns);

    for (const server of servers) {
        ns.tprint(`Killing all processes on ${server}`);
        for (const process of ns.ps(server)) {
            if (process.pid === ns.pid) continue;
            ns.kill(process.pid);
        }

        ns.tprint(`Deleting all files on ${server}`);
        for (const file of ns.ls(server, ".js")) {
            if (file.endsWith(".json") && !file.endsWith("dependencies.json")) continue;
            ns.rm(file, server);
        }
    }

    const success = await connectToRemoteApi();
    if (!success) {
        ns.alert(
            "All files were deleted, but connection to the remote API for reacquiring files failed. Please connect manually, save and reload the game.",
        );
    }

    // wait for files to be transferred
    await sleep(2500);

    await globalThis.appSaveFns.triggerSave();

    // I don't trust triggerSave. A second should be enough to save.
    await sleep(1000);
    globalThis.location.reload();
}
