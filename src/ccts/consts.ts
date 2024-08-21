import { unformatNumber } from "/lib/lib";

export enum ContractRewardType {
    Money,
    Reputation,
}

export interface MoneyReward {
    type: ContractRewardType.Money;
    amount: number;
}

export enum ReputationRewardTargetType {
    Company,
    Faction,
}

export interface ReputationReward {
    type: ContractRewardType.Reputation;
    targetType: ReputationRewardTargetType;
    amountPerTarget: number;
    targets: string[];
}

export type ContractReward = ReputationReward | MoneyReward;

const MONEY_REGEX = /(?<=\$).+\b/;

/**
 * Parse a reward string returned from `ns.codingcontract.attempt`.
 */
export function parseRewardString(reward: string): ContractReward | null {
    reward = reward.trim();
    if (reward.length === 0) return null;

    if (MONEY_REGEX.test(reward)) {
        const moneyString = reward.match(MONEY_REGEX)![0];
        const amount = unformatNumber(moneyString);

        if (!amount) return null;

        return {
            type: ContractRewardType.Money,
            amount,
        };
    } else if (reward.includes("reputation")) {
        const amountStr = reward.split(" ")[1];
        const amount = unformatNumber(amountStr);

        if (!amount) return null;

        if (reward.includes("each of the")) {
            const factions = reward.split(":")[1].split(", ");
            return {
                type: ContractRewardType.Reputation,
                targetType: ReputationRewardTargetType.Faction,
                targets: factions,
                amountPerTarget: amount,
            };
        } else {
            let targetType: ReputationRewardTargetType;
            if (reward.includes("company")) {
                targetType = ReputationRewardTargetType.Company;
            } else {
                targetType = ReputationRewardTargetType.Faction;
            }

            const [target] = reward.match(/(?<=for ).*?(?=\.)/)!;

            return {
                type: ContractRewardType.Reputation,
                targetType,
                amountPerTarget: amount,
                targets: [target!],
            };
        }
    } else {
        return null;
    }
}
