/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");
    ns.clearLog();

    const gang = ns.gang;

    const tasks = new Map(
        gang.getTaskNames().map((task) => [task, gang.getTaskStats(task)]),
    );

    const hackingTasks = [
        "Ransomware",
        "Phishing",
        "Identity Theft",
        "DDoS Attacks",
        "Plant Virus",
        "Fraud & Counterfeiting",
        "Money Laundering",
    ]
        .map((name) => gang.getTaskStats(name))
        .reverse();

    let ran = false;

    const knownMembers = new Set(gang.getMemberNames());

    while (true) {
        if (ran) await ns.asleep(30_000);
        ran = true;

        if (gang.canRecruitMember()) {
            const res = await fetch(
                "https://api.namefake.com/united-states/random",
            ).then((res) => res.json());
            console.log(res);

            const { name } = res;
            if (!gang.recruitMember(name)) {
                ns.toast(
                    `Failed to recruit gang member with name ${name}.`,
                    "error",
                );
            } else {
                knownMembers.add(name);
                globalThis.eventEmitter?.emit("gang:member-recruited", name);
                ns.toast(`Recruited new gang member ${name}.`, "info");
                gang.setMemberTask(name, "Hacking Training");
            }
        }

        const members = gang
            .getMemberNames()
            .map((name) => gang.getMemberInformation(name))
            .sort((a, b) => a.hack - b.hack);

        for (const member of members) {
            const after = gang.getAscensionResult(member.name);
            if (!after) continue;

            if (
                Object.entries(after)
                    .filter(([key]) => key !== "respect")
                    .reduce((sum, [_, cur]) => sum + (cur - 1), 0) > 1.25
            ) {
                const asc = gang.ascendMember(member.name);
                if (!asc) continue;

                ns.toast(`Ascended ${member.name}.`);
            }

            for (const [equipment, cost] of gang
                .getEquipmentNames()
                .map((name) => [name, gang.getEquipmentCost(name)])) {
                const money = ns.getServerMoneyAvailable("home");
                if (cost / money <= 0.1) {
                    gang.purchaseEquipment(member.name, equipment);
                }
            }
        }

        const myGang = gang.getGangInformation();
        const others = gang.getOtherGangInformation();

        const [maxPowerGang] = Object.entries(others)
            .filter(
                ([name, info]) => name !== myGang.faction && info.territory > 0,
            )
            .reduce((highest, [name, info]) =>
                highest[1] > info.power ? highest : [name, info.power],
            );

        console.log(gang.getOtherGangInformation(), maxPowerGang);

        // if no other gang has territory, we don't need to increase our power.
        if (maxPowerGang && gang.getMemberNames().length === 12) {
            for (const member of members) {
                gang.setMemberTask(member.name, "Territory Warfare");
            }

            gang.setTerritoryWarfare(
                gang.getChanceToWinClash(maxPowerGang) > 0.75,
            );

            continue;
        }

        // We can only really continue if we have formulas.exe
        if (!ns.fileExists("Formulas.exe", "home")) {
            continue;
        }

        for (const member of members.splice(
            0,
            Math.floor(members.length * 0.2),
        )) {
            gang.setMemberTask(member.name, "Train Hacking");
        }

        members.reverse();

        let wantedBudget = 0;

        for (const member of members) {
            gang.setMemberTask(member.name, "Ethical Hacking");
            if (ns.fileExists("Formulas.exe", "home")) {
                wantedBudget += ns.formulas.gang.wantedLevelGain(
                    gang.getGangInformation(),
                    member,
                    gang.getTaskStats("Ethical Hacking"),
                );
            }
        }

        for (const member of members) {
            let gain = 0;
            let task;

            for (const potentialTask of hackingTasks) {
                const current = ns.formulas.gang.wantedLevelGain(
                    gang.getGangInformation(),
                    member,
                    gang.getTaskStats("Ethical Hacking"),
                );
                const potential = ns.formulas.gang.wantedLevelGain(
                    gang.getGangInformation(),
                    member,
                    potentialTask,
                );

                const wantedGain = -current + potential;
                console.log(current, potential, wantedGain);

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

                gang.setMemberTask(member.name, task.name);
                wantedBudget += gain;
            }
        }
    }
}
