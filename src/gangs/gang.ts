import { GangTaskStats, NS } from "@ns";
import { auto } from "/system/proc/auto";

/**
 * Current mode the gang operates in.
 */
enum GangMode {
    Respect = "Respect",
    Territory = "Territory",
    Money = "Money",
}

const MAX_GANG_SIZE = 12;

function findMax<T>(
    arr: T[],
    fn: (element: T, index: number) => number,
): T | undefined {
    let highest = -1;
    let highestIndex = -1;

    arr.forEach((element, index) => {
        const value = fn(element, index);
        if (highest < value) {
            highest = value;
            highestIndex = index;
        }
    });

    return arr[highestIndex];
}

export async function main(ns: NS) {
    auto(ns);

    if (!globalThis.eventEmitter) {
        throw new Error(
            `This script requires globalThis.eventEmitter to work. Run events.js on "home" to set it up.`,
        );
    }

    ns.disableLog("ALL");
    ns.clearLog();

    const gang = ns.gang.getGangInformation();

    const tasks = ns.gang
        .getTaskNames()
        .map((name) => ns.gang.getTaskStats(name))
        .filter((task) => task.isHacking === gang.isHacking);

    /**
     * Task for reducing wanted level. Should normally be `Vigilante Justice` or `Ethical Hacking`.
     */
    const wantedTask = findMax(tasks, (task) => -task.baseWanted);
    if (!wantedTask) {
        ns.tprint("ERROR: failed to find a suitable wanted task. Aborting.");
        return;
    }

    // For notifications about dead members
    const knownMembers = new Set(ns.gang.getMemberNames());

    let lastMode: GangMode | undefined = undefined;

    while (true) {
        await ns.sleep(20);

        const members = ns.gang.getMemberNames();

        // check for deceased members
        const known = new Set([...knownMembers]);
        for (const member of members) known.delete(member);

        if (known.size > 0) {
            for (const member of known) {
                globalThis.eventEmitter.emit("gang:member-deceased", member);
                knownMembers.delete(member);
            }
        }

        if (ns.gang.canRecruitMember()) {
            const member = await recruitMember(ns);
            if (member) {
                knownMembers.add(member);
            }
        }

        /**
         * @type { keyof GangMode }
         */
        let mode;
        if (members.length < MAX_GANG_SIZE) {
            // We don't have all gang members. Focus on gaining respect so we can recruit more.
            mode = GangMode.Respect;
        } else {
            const highestOther = getHighestPowerOtherGang(ns);
            if (!highestOther) {
                // there's nothing else for us to do. Just make money.
                mode = GangMode.Money;
            } else {
                // There's still other gangs that have territory; take it from them.
                mode = GangMode.Territory;

                // We only enable territory warfare if we have a >= 75% chance to win against the highest power gang
                ns.gang.setTerritoryWarfare(
                    ns.gang.getChanceToWinClash(highestOther) >= 0.75,
                );
            }
        }

        if (mode !== lastMode) {
            globalThis.eventEmitter.emit("gang:switched-mode", lastMode, mode);
            lastMode = mode;
        }

        if (mode === GangMode.Territory) {
            for (const member of members) {
                ns.gang.setMemberTask(member, "Territory Warfare");
            }
        } else {
            const memberInfo = members.map((member) =>
                ns.gang.getMemberInformation(member),
            );

            let potentialTasks: GangTaskStats[];
            if (mode === GangMode.Money) {
                potentialTasks = tasks
                    .filter((task) => task.baseMoney > 0)
                    .sort((a, b) => b.baseMoney - a.baseMoney);
            } else {
                // mode === GangMode.Respect
                potentialTasks = tasks
                    .filter((task) => task.baseRespect > 0)
                    .sort((a, b) => b.baseRespect - a.baseRespect);
            }

            // enable "smart mode".
            if (ns.fileExists("Formulas.exe", "home")) {
                let wantedBudget = 0;

                for (const member of memberInfo) {
                    ns.gang.setMemberTask(member.name, wantedTask.name);
                    wantedBudget += ns.formulas.gang.wantedLevelGain(
                        ns.gang.getGangInformation(),
                        member,
                        wantedTask,
                    );
                }

                for (const member of memberInfo) {
                    let gain = 0;
                    /**
                     * @type { GangTaskStats | undefined }
                     */
                    let task;

                    for (const potentialTask of potentialTasks) {
                        const current = ns.formulas.gang.wantedLevelGain(
                            ns.gang.getGangInformation(),
                            member,
                            wantedTask,
                        );
                        const potential = ns.formulas.gang.wantedLevelGain(
                            ns.gang.getGangInformation(),
                            member,
                            potentialTask,
                        );

                        const wantedGain = -current + potential;

                        // wantedGain > 0: if a task cannot be completed by a member (they're not experienced enough, gain becomes 0).
                        if (wantedBudget + wantedGain <= 0) {
                            task = potentialTask;
                            gain = wantedGain;
                            break;
                        }
                    }

                    if (task) {
                        console.log(
                            `Set ${member.name} to ${task.name}, for new wanted gain of ${wantedBudget} + ${gain} = ${wantedBudget + gain}`,
                        );

                        ns.gang.setMemberTask(member.name, task.name);
                        wantedBudget += gain;
                    }
                }
            }
        }
    }
}

async function recruitMember(ns: NS): Promise<string | null> {
    const res = await fetch("https://api.namefake.com/united-states/random")
        .then((res) => res.json())
        .catch(console.error);

    if (!res) {
        ns.toast(
            `Error when fetching a random name from namefake.com. Check console for details.`,
            "error",
        );
        return null;
    }

    const { name } = res;

    if (!ns.gang.recruitMember(name)) {
        ns.toast(`Failed to recruit gang member with name ${name}.`, "error");
        return null;
    } else {
        globalThis.eventEmitter.emit("gang:member-recruited", name);
        ns.toast(`Recruited new gang member ${name}.`, "info");
        return name;
    }
}

/**
 * Finds the other gang with the most power that still has territory.
 * @returns the other gang, or null if no other gangs have any territory.
 */
function getHighestPowerOtherGang(ns: NS) {
    const myGang = ns.gang.getGangInformation();
    const others = ns.gang.getOtherGangInformation();

    const [maxPowerGang] = Object.entries(others)
        .filter(([name, info]) => name !== myGang.faction && info.territory > 0)
        .reduce((highest, [name, info]) =>
            highest[1].power > info.power ? highest : [name, info],
        );

    return maxPowerGang ?? null;
}
