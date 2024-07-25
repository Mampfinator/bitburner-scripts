enum Color {
    Black = 0,
    Red = 1,
    Green = 2,
    Yellow = 3,
    Blue = 4,
    Magenta = 5,
    Cyan = 6,
}

enum Mode {
    Foreground = 30,
    Background = 40,
}

enum Effect {
    None = 0,
    Bold = 1,
    Strikethrough = 2,
    Italic = 3,
}

class ExtensibleFunction<T extends (...args: any) => any> extends Function {
    // @ts-expect-error: We're doing Fuckery:tm: over here
    constructor(f: T) {
        return Object.setPrototypeOf(f, new.target.prototype);
    }
}

type ColorFns =
    | "black"
    | "red"
    | "green"
    | "yellow"
    | "blue"
    | "magenta"
    | "cyan";
type ModeFns = "foreground" | "background";
type EffectFns = "bold" | "strikeThrough" | "normal";

export class TermCol<TDontCall extends string = ""> extends ExtensibleFunction<
    (text: string) => string
> {
    private foregroundColor?: Color;
    private backgroundColor?: Color;
    private mode = Mode.Foreground;
    private readonly otherEffects: Effect[] = [];

    constructor() {
        super((text: string) => {
            const effects: string[] = [...this.otherEffects.map(String)];

            if (this.foregroundColor) {
                effects.push(`${Mode.Foreground + this.foregroundColor}`);
            }

            if (this.backgroundColor) {
                effects.push(`${Mode.Background + this.backgroundColor}`);
            }

            return `\x1b[${effects.join(";")}m${text}\x1b[0m`;
        });
    }

    // for *some reason* this function specifically requires explicit type annotation.
    // Do not remove unless verified to work otherwise.
    get foreground(): Omit<
        TermCol<TDontCall | ModeFns>,
        TDontCall | "foreground"
    > {
        this.mode = Mode.Foreground;
        return this as Omit<
            TermCol<TDontCall | ModeFns>,
            TDontCall | "foreground"
        >;
    }

    get background() {
        this.mode = Mode.Background;
        return this as Omit<
            TermCol<TDontCall | ModeFns>,
            Exclude<TDontCall | "background", ColorFns>
        >;
    }

    private applyColor(color: Color) {
        if (this.mode == Mode.Background) {
            this.backgroundColor = color;
        } else {
            this.foregroundColor = color;
        }

        return this as Omit<
            TermCol<TDontCall | ColorFns>,
            TDontCall | ColorFns
        >;
    }

    get black() {
        return this.applyColor(Color.Black);
    }

    get red() {
        return this.applyColor(Color.Red);
    }

    get green() {
        return this.applyColor(Color.Green);
    }

    get yellow() {
        return this.applyColor(Color.Yellow);
    }

    get blue() {
        return this.applyColor(Color.Blue);
    }

    get magenta() {
        return this.applyColor(Color.Magenta);
    }

    get cyan() {
        return this.applyColor(Color.Cyan);
    }

    get normal() {
        while (this.otherEffects.length > 0) this.otherEffects.shift();
        return this as unknown as Omit<
            TermCol<Exclude<TDontCall, EffectFns>>,
            Exclude<TDontCall, EffectFns>
        >;
    }

    get bold() {
        this.otherEffects.push(Effect.Bold);
        return this as Omit<TermCol<TDontCall | "bold">, TDontCall | "bold">;
    }

    get strikeThrough() {
        this.otherEffects.push(Effect.Strikethrough);
        return this as Omit<
            TermCol<TDontCall | "strikeThrough">,
            TDontCall | "strikeThrough"
        >;
    }

    get italic() {
        this.otherEffects.push(Effect.Italic);
        return this as Omit<
            TermCol<TDontCall | "italic">,
            TDontCall | "italic"
        >;
    }
}

export interface TermCol {
    /**
     * Apply the actual styles
     */
    (text: string): string;
}

/**
 * @returns a bad chalk copy
 */
export function col() {
    return new TermCol();
}
