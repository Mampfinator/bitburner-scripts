const { React } = globalThis;
const e = React.createElement;

/**
 * @param {any} props
 */
function Dashboard(props) {
    return e("div", { style: { color: "red" } }, "WIP");
}

/** @param {NS} ns */
export async function main(ns) {
    ns.setTitle("Gang Dashboard");
    ns.disableLog("ALL");
    ns.clearLog();

    const members = new Set(ns.gang.getMemberNames());

    const recruitListener = globalThis.eventEmitter.on(
        "gang:member-recruited",
        (member) => {
            members.add(member);
        },
    );

    const deathListener = globalThis.eventEmitter.on(
        "gang:member-died",
        (member) => {
            members.delete(member);
        },
    );

    ns.atExit(() => {
        globalThis.eventEmitter.remove(
            "gang:member-reacruited",
            recruitListener,
        );
        globalThis.eventEmitter.remove("gang:member-died", deathListener);
    });

    /**
     * @type {any}
     */
    const dashboard = e(Dashboard);

    ns.printRaw(dashboard);
}
