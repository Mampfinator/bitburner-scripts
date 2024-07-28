import { MessageBus } from "/lib/messages";
import { ContractReward, ContractRewardType, ReputationReward } from "./consts";

const { React } = globalThis;

export enum CCTSMessageType {
    Failed,
    Success,
    Unsolvable,
}

interface BaseMessage {
    hostname: string;
    filename: string;
    contractType: string;
}

interface FailedMessage extends BaseMessage {
    type: CCTSMessageType.Failed;
    remaining: number;
    data: any;
    solution: any;
}

interface UnsolvableMessage extends BaseMessage {
    type: CCTSMessageType.Unsolvable;
}

interface SuccessMessage extends BaseMessage {
    type: CCTSMessageType.Success;
    reward: ContractReward;
}

export type DashboardMessage = FailedMessage | SuccessMessage | UnsolvableMessage;

interface CCTSDashboardProps {
    messageBus: MessageBus<DashboardMessage>;
    formatNumber: (number: number) => string;
}

export function CCTSDashboard(props: CCTSDashboardProps) {
    const { messageBus, formatNumber } = props;

    const [rep, setRep] = React.useState(new Map<string, number>());
    const [money, setMoney] = React.useState(0);

    const [failed, setFailed] = React.useState(new Map<string, [string, string][]>());
    const [unsolvable, setUnsolvable] = React.useState(new Map<string, Set<string>>());

    React.useEffect(() => {
        const handler = (message: DashboardMessage) => {
            const { type } = message;

            if (type === CCTSMessageType.Success) {
                const { reward } = message;
                const { type: rewardType } = reward;
                if (rewardType === ContractRewardType.Money) {
                    const { amount } = reward;
                    setMoney(money + amount);
                } else if (rewardType === ContractRewardType.Reputation) {
                    for (const target of (message.reward as ReputationReward).targets) {
                        const oldRep = rep.get(target) ?? 0;
                        rep.set(target, oldRep + (message.reward as ReputationReward).amountPerTarget);
                    }

                    setRep(new Map(rep));
                }
            } else if (type === CCTSMessageType.Failed) {
                let arr: [string, string][];

                if (failed.has(message.contractType)) {
                    arr = failed.get(message.contractType)!;
                } else {
                    const array: [string, string][] = [];
                    failed.set(message.contractType, array);
                    arr = array;
                }

                arr.push([message.hostname, message.filename]);

                setFailed(new Map(failed));
            } else if (type === CCTSMessageType.Unsolvable) {
                let changed;

                const set = unsolvable.get(message.contractType) ?? new Set();
                const old = set.size;

                set.add(`${message.hostname}:${message.filename}`);
                changed = old < set.size;
                unsolvable.set(message.contractType, set);

                if (changed) setUnsolvable(new Map(unsolvable));
            }
        };

        messageBus.subscribe(handler);

        return () => {
            messageBus.unsubscribe(handler);
        };
    });

    // TODO: style, specifically borders
    return (
        <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
                <span>
                    Total money earned: <span>${formatNumber(money)}</span>
                </span>
                <details>
                    <summary>
                        <span>
                            Total reputation earned:{" "}
                            <span>{formatNumber([...rep.values()].reduce((acc, curr) => acc + curr, 0))}</span>
                        </span>
                    </summary>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        {[...rep].map((faction, amount) => (
                            <span>
                                {faction}: {formatNumber(amount)}
                            </span>
                        ))}
                    </div>
                </details>
            </div>
            <hr style={{ width: "100%" }} />
            <details>
                <summary>{unsolvable.size} Unsolvable CCT Types</summary>
                <div style={{ display: "flex", flexDirection: "column" }}>
                    {[...unsolvable.entries()].map(([type, entries]) => (
                        <details>
                            <summary>
                                {type}: {entries.size}
                            </summary>
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                }}
                            >
                                {[...entries].map((text) => (
                                    <span>{text}</span>
                                ))}
                            </div>
                        </details>
                    ))}
                </div>
            </details>
        </div>
    );
}
