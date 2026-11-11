import {formatUtc, type ICalTodoDateValue} from './date.ts';
import {escapeText} from './text.ts';
import {type ICalTodoXData, normalizeX, xLines} from './x.ts';

export const ICalTodoAlarmType = {
    display: 'display',
    audio: 'audio',
} as const;
export type ICalTodoAlarmType = (typeof ICalTodoAlarmType)[keyof typeof ICalTodoAlarmType];

/**
 * What a relative trigger refers to. `END` is the DUE of the to-do,
 * `START` its DTSTART (RFC 5545, 3.2.14).
 */
export const ICalTodoAlarmRelatesTo = {
    start: 'START',
    end: 'END',
} as const;
export type ICalTodoAlarmRelatesTo = (typeof ICalTodoAlarmRelatesTo)[keyof typeof ICalTodoAlarmRelatesTo];

export interface ICalTodoAlarmRepeat {
    /** Additional repetitions after the first alarm. */
    times: number;
    /** Seconds between repetitions. */
    interval: number;
}

export interface ICalTodoAlarmData {
    /** Defaults to `display`. */
    type?: ICalTodoAlarmType;
    /** Seconds before the reference point, or an absolute date. Same as `triggerBefore`. */
    trigger?: number | ICalTodoDateValue;
    /** Seconds before the reference point, or an absolute date. */
    triggerBefore?: number | ICalTodoDateValue;
    /** Seconds after the reference point, or an absolute date. */
    triggerAfter?: number | ICalTodoDateValue;
    /** Reference point of a relative trigger. Defaults to `END` (DUE). */
    relatesTo?: ICalTodoAlarmRelatesTo;
    /** Text of a display alarm. Defaults to the summary of the to-do. */
    description?: string | null;
    repeat?: ICalTodoAlarmRepeat | null;
    x?: ICalTodoXData;
}

/** What an alarm needs to know about the to-do it belongs to. */
export interface ICalTodoAlarmContext {
    hasStart: boolean;
    hasDue: boolean;
    summary: string | null;
}

function checkSeconds(value: number, name: string): number {
    if (!Number.isInteger(value)) {
        throw new Error(`${name} must be a whole number of seconds`);
    }
    return value;
}

export function toDuration(seconds: number): string {
    let rest = Math.abs(seconds);
    let result = (seconds < 0 ? '-' : '') + 'P';

    if (rest >= 86400) {
        result += Math.floor(rest / 86400) + 'D';
        rest %= 86400;
    }
    if (rest === 0 && result.endsWith('D')) {
        return result;
    }

    result += 'T';
    if (rest >= 3600) {
        result += Math.floor(rest / 3600) + 'H';
        rest %= 3600;
    }
    if (rest >= 60) {
        result += Math.floor(rest / 60) + 'M';
        rest %= 60;
    }
    if (rest > 0 || result.endsWith('T')) {
        result += rest + 'S';
    }
    return result;
}

export class ICalTodoAlarm {
    private _type: ICalTodoAlarmType = ICalTodoAlarmType.display;
    // Relative triggers are stored as seconds after the reference point.
    private _trigger: number | ICalTodoDateValue = -600;
    private _relatesTo: ICalTodoAlarmRelatesTo = ICalTodoAlarmRelatesTo.end;
    private _description: string | null = null;
    private _repeat: ICalTodoAlarmRepeat | null = null;
    private _x: [string, string][] = [];

    constructor(data: ICalTodoAlarmData = {}) {
        if (data.type !== undefined) this.type(data.type);
        if (data.trigger !== undefined) this.trigger(data.trigger);
        if (data.triggerBefore !== undefined) this.triggerBefore(data.triggerBefore);
        if (data.triggerAfter !== undefined) this.triggerAfter(data.triggerAfter);
        if (data.relatesTo !== undefined) this.relatesTo(data.relatesTo);
        if (data.description !== undefined) this.description(data.description);
        if (data.repeat !== undefined) this.repeat(data.repeat);
        if (data.x !== undefined) this.x(data.x);
    }

    type(): ICalTodoAlarmType;
    type(type: ICalTodoAlarmType): this;
    type(type?: ICalTodoAlarmType): ICalTodoAlarmType | this {
        if (type === undefined) return this._type;
        if (!Object.values(ICalTodoAlarmType).includes(type)) {
            throw new Error(`Unsupported alarm type "${String(type)}"`);
        }
        this._type = type;
        return this;
    }

    /**
     * The trigger: seconds before the reference point, or an absolute date.
     * Without an argument, returns the same.
     */
    trigger(): number | ICalTodoDateValue;
    trigger(trigger: number | ICalTodoDateValue): this;
    trigger(trigger?: number | ICalTodoDateValue): number | ICalTodoDateValue | this {
        if (trigger === undefined) {
            return typeof this._trigger === 'number' ? -this._trigger || 0 : this._trigger;
        }
        return this.triggerBefore(trigger);
    }

    triggerBefore(trigger: number | ICalTodoDateValue): this {
        this._trigger = typeof trigger === 'number' ? -checkSeconds(trigger, 'triggerBefore') : trigger;
        return this;
    }

    triggerAfter(trigger: number | ICalTodoDateValue): this {
        this._trigger = typeof trigger === 'number' ? checkSeconds(trigger, 'triggerAfter') : trigger;
        return this;
    }

    relatesTo(): ICalTodoAlarmRelatesTo;
    relatesTo(relatesTo: ICalTodoAlarmRelatesTo): this;
    relatesTo(relatesTo?: ICalTodoAlarmRelatesTo): ICalTodoAlarmRelatesTo | this {
        if (relatesTo === undefined) return this._relatesTo;
        if (!Object.values(ICalTodoAlarmRelatesTo).includes(relatesTo)) {
            throw new Error(`Unsupported value for relatesTo "${String(relatesTo)}"`);
        }
        this._relatesTo = relatesTo;
        return this;
    }

    description(): string | null;
    description(description: string | null): this;
    description(description?: string | null): string | null | this {
        if (description === undefined) return this._description;
        this._description = description;
        return this;
    }

    repeat(): ICalTodoAlarmRepeat | null;
    repeat(repeat: ICalTodoAlarmRepeat | null): this;
    repeat(repeat?: ICalTodoAlarmRepeat | null): ICalTodoAlarmRepeat | null | this {
        if (repeat === undefined) return this._repeat;
        if (repeat) {
            if (!Number.isInteger(repeat.times) || repeat.times < 1) {
                throw new Error('repeat.times must be a positive integer');
            }
            if (!Number.isInteger(repeat.interval) || repeat.interval < 1) {
                throw new Error('repeat.interval must be a positive number of seconds');
            }
        }
        this._repeat = repeat ? {...repeat} : null;
        return this;
    }

    x(): [string, string][];
    x(data: ICalTodoXData): this;
    x(key: string, value: string): this;
    x(data?: ICalTodoXData | string, value?: string): [string, string][] | this {
        if (data === undefined) return this._x.map(([k, v]) => [k, v]);
        this._x.push(...normalizeX(typeof data === 'string' ? [[data, value ?? '']] : data));
        return this;
    }

    /** Content lines of the VALARM, without folding. */
    toLines(todo: ICalTodoAlarmContext): string[] {
        const lines = ['BEGIN:VALARM', 'ACTION:' + this._type.toUpperCase()];

        if (typeof this._trigger === 'number') {
            if (this._relatesTo === 'END' && !todo.hasDue) {
                throw new Error('An alarm relative to the end of a to-do needs a due date');
            }
            if (this._relatesTo === 'START' && !todo.hasStart) {
                throw new Error('An alarm relative to the start of a to-do needs a start date');
            }
            lines.push('TRIGGER' + (this._relatesTo === 'END' ? ';RELATED=END' : '') + ':' + toDuration(this._trigger));
        } else {
            lines.push('TRIGGER;VALUE=DATE-TIME:' + formatUtc(this._trigger));
        }

        if (this._repeat) {
            lines.push('REPEAT:' + this._repeat.times, 'DURATION:' + toDuration(this._repeat.interval));
        }

        if (this._type === 'display') {
            lines.push('DESCRIPTION:' + escapeText(this._description ?? todo.summary ?? 'Reminder'));
        } else if (this._description !== null) {
            lines.push('DESCRIPTION:' + escapeText(this._description));
        }

        lines.push(...xLines(this._x), 'END:VALARM');
        return lines;
    }
}
