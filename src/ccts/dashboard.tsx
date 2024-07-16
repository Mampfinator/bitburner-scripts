import { NS } from "@ns";
import { ContractReward, ContractRewardType } from "./auto-solve";
import { MessageBus } from "/lib/messages";

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
    ns: NS;
}

export function CCTSDashboard(props: CCTSDashboardProps) {
    const { messageBus, ns } = props;

    const [rep, setRep] = React.useState(new Map<string, number>());
    const [money, setMoney] = React.useState(0);

    const [failed, setFailed] = React.useState(new Map<string, [string, string][]>());
    const [unsolvable, setUnsolvable] = React.useState(new Set<string>());

    React.useEffect(() => {
        const handler = (message: DashboardMessage) => {
            if (message.type === CCTSMessageType.Success) {
                if (message.reward.type === ContractRewardType.Money) {
                    setMoney(money + message.reward.amount);
                } else {
                    for (const target of message.reward.targets) {
                        const oldRep = rep.get(target) ?? 0;
                        rep.set(target, oldRep + message.reward.amountPerTarget);
                    }

                    setRep(rep);
                }
            } else if (message.type === CCTSMessageType.Failed) {
                let arr: [string, string][];

                if (failed.has(message.contractType)) {
                    arr = failed.get(message.contractType)!;
                } else {
                    const array: [string, string][] = [];
                    failed.set(message.contractType, array);
                    arr = array;
                }

                arr.push([message.hostname, message.filename])

                while (arr.length > 20) {
                    arr.shift();
                }

                setFailed(failed);
            } else {
                const oldSize = unsolvable.size;
                unsolvable.add(`${message.hostname}:${message.filename} (${message.contractType})`);
                if (oldSize < unsolvable.size) {
                    setUnsolvable(unsolvable);
                }
            }
        }

        messageBus.subscribe(handler);

        return () => {
            messageBus.unsubscribe(handler);
        }
    }, [messageBus]); 

    return <div style={{display: "flex", flexDirection: "column"}}>
        <div>
            Total money earned: ${ns.formatNumber(money)}
            Total rep earned: ${ns.formatNumber([...rep.values()].reduce((acc, curr) => acc + curr, 0))}
        </div>
        <hr/>
        <div style={{display: "flex", flexDirection: "column"}}>
            {[...unsolvable].map(text => <span>{text}</span>)}
        </div>
    </div>
}