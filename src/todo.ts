import {ICalTodoAlarm, type ICalTodoAlarmData} from './alarm.ts';
import {
    compareWallTime,
    type DateFrame,
    formatDate,
    formatDateTime,
    formatUtc,
    type ICalTodoDateValue,
    resolveWallTime,
} from './date.ts';
import {
    checkRepeating,
    checkRuleString,
    type ICalTodoRepeatingOptions,
    type RecurrenceFrame,
    ruleValue,
} from './recurrence.ts';
import {escapeText, foldLines, parameterValue} from './text.ts';
import {type ICalTodoXData, normalizeX, xLines} from './x.ts';

export const ICalTodoStatus = {
    NEEDSACTION: 'NEEDS-ACTION',
    COMPLETED: 'COMPLETED',
    INPROCESS: 'IN-PROCESS',
    CANCELLED: 'CANCELLED',
} as const;
export type ICalTodoStatus = (typeof ICalTodoStatus)[keyof typeof ICalTodoStatus];

export type ICalTodoCategory = string | {name: string};

export interface ICalTodoData {
    /** UID. A random UUID if not set. */
    id?: string | number;
    /** DTSTAMP. Defaults to the time the to-do was created. */
    stamp?: ICalTodoDateValue;
    summary?: string | null;
    description?: string | null;
    /** DTSTART. Required for repeating to-dos. */
    start?: ICalTodoDateValue | null;
    due?: ICalTodoDateValue | null;
    /** Write start, due, recurrence id and excluded dates as DATE values. */
    allDay?: boolean;
    /** Time zone of start, due, recurrence id and excluded dates (TZID). */
    timezone?: string | null;
    /** Write dates as local time without time zone. */
    floating?: boolean;
    /** 0 (undefined) and 1 (highest) to 9 (lowest). */
    priority?: number | null;
    status?: ICalTodoStatus | null;
    completed?: ICalTodoDateValue | null;
    /** 0 to 100. */
    percentComplete?: number | null;
    sequence?: number | null;
    created?: ICalTodoDateValue | null;
    lastModified?: ICalTodoDateValue | null;
    categories?: ICalTodoCategory[];
    url?: string | null;
    /** Marks this to-do as an override of one occurrence of a repeating to-do with the same id. */
    recurrenceId?: ICalTodoDateValue | null;
    /** Repeating rule, as options or as RRULE text. */
    repeating?: ICalTodoRepeatingOptions | string | null;
    alarms?: (ICalTodoAlarm | ICalTodoAlarmData)[];
    x?: ICalTodoXData;
}

function integerIn(value: number, min: number, max: number, name: string): number {
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}, got ${value}`);
    }
    return value;
}

export class ICalTodo {
    private _id: string;
    private _stamp: ICalTodoDateValue;
    private _summary: string | null = null;
    private _description: string | null = null;
    private _start: ICalTodoDateValue | null = null;
    private _due: ICalTodoDateValue | null = null;
    private _allDay = false;
    private _timezone: string | null = null;
    private _floating = false;
    private _priority: number | null = null;
    private _status: ICalTodoStatus | null = null;
    private _completed: ICalTodoDateValue | null = null;
    private _percentComplete: number | null = null;
    private _sequence: number | null = null;
    private _created: ICalTodoDateValue | null = null;
    private _lastModified: ICalTodoDateValue | null = null;
    private _categories: string[] = [];
    private _url: string | null = null;
    private _recurrenceId: ICalTodoDateValue | null = null;
    private _repeating: ICalTodoRepeatingOptions | string | null = null;
    private _alarms: ICalTodoAlarm[] = [];
    private _x: [string, string][] = [];

    constructor(data: ICalTodoData = {}) {
        this._id = crypto.randomUUID();
        this._stamp = new Date();

        if (data.id !== undefined) this.id(data.id);
        if (data.stamp !== undefined) this.stamp(data.stamp);
        if (data.summary !== undefined) this.summary(data.summary);
        if (data.description !== undefined) this.description(data.description);
        if (data.start !== undefined) this.start(data.start);
        if (data.due !== undefined) this.due(data.due);
        if (data.allDay !== undefined) this.allDay(data.allDay);
        if (data.timezone !== undefined) this.timezone(data.timezone);
        if (data.floating !== undefined) this.floating(data.floating);
        if (data.priority !== undefined) this.priority(data.priority);
        if (data.status !== undefined) this.status(data.status);
        if (data.completed !== undefined) this.completed(data.completed);
        if (data.percentComplete !== undefined) this.percentComplete(data.percentComplete);
        if (data.sequence !== undefined) this.sequence(data.sequence);
        if (data.created !== undefined) this.created(data.created);
        if (data.lastModified !== undefined) this.lastModified(data.lastModified);
        if (data.categories !== undefined) this.categories(data.categories);
        if (data.url !== undefined) this.url(data.url);
        if (data.recurrenceId !== undefined) this.recurrenceId(data.recurrenceId);
        if (data.repeating !== undefined) this.repeating(data.repeating);
        if (data.alarms !== undefined) this.alarms(data.alarms);
        if (data.x !== undefined) this.x(data.x);
    }

    id(): string;
    id(id: string | number): this;
    id(id?: string | number): string | this {
        if (id === undefined) return this._id;
        const value = String(id);
        if (!value) {
            throw new Error('id must not be empty');
        }
        this._id = value;
        return this;
    }

    stamp(): ICalTodoDateValue;
    stamp(stamp: ICalTodoDateValue): this;
    stamp(stamp?: ICalTodoDateValue): ICalTodoDateValue | this {
        if (stamp === undefined) return this._stamp;
        formatUtc(stamp);
        this._stamp = stamp;
        return this;
    }

    summary(): string | null;
    summary(summary: string | null): this;
    summary(summary?: string | null): string | null | this {
        if (summary === undefined) return this._summary;
        this._summary = summary;
        return this;
    }

    description(): string | null;
    description(description: string | null): this;
    description(description?: string | null): string | null | this {
        if (description === undefined) return this._description;
        this._description = description;
        return this;
    }

    start(): ICalTodoDateValue | null;
    start(start: ICalTodoDateValue | null): this;
    start(start?: ICalTodoDateValue | null): ICalTodoDateValue | null | this {
        if (start === undefined) return this._start;
        if (start !== null) formatUtc(start);
        this._start = start;
        return this;
    }

    due(): ICalTodoDateValue | null;
    due(due: ICalTodoDateValue | null): this;
    due(due?: ICalTodoDateValue | null): ICalTodoDateValue | null | this {
        if (due === undefined) return this._due;
        if (due !== null) formatUtc(due);
        this._due = due;
        return this;
    }

    allDay(): boolean;
    allDay(allDay: boolean): this;
    allDay(allDay?: boolean): boolean | this {
        if (allDay === undefined) return this._allDay;
        this._allDay = allDay;
        return this;
    }

    timezone(): string | null;
    timezone(timezone: string | null): this;
    timezone(timezone?: string | null): string | null | this {
        if (timezone === undefined) return this._timezone;
        if (timezone) {
            parameterValue(timezone);
            // Throws for unknown zones.
            resolveWallTime(new Date(0), {timezone, floating: false});
        }
        this._timezone = timezone || null;
        return this;
    }

    floating(): boolean;
    floating(floating: boolean): this;
    floating(floating?: boolean): boolean | this {
        if (floating === undefined) return this._floating;
        this._floating = floating;
        return this;
    }

    priority(): number | null;
    priority(priority: number | null): this;
    priority(priority?: number | null): number | null | this {
        if (priority === undefined) return this._priority;
        this._priority = priority === null ? null : integerIn(priority, 0, 9, 'priority');
        return this;
    }

    status(): ICalTodoStatus | null;
    status(status: ICalTodoStatus | null): this;
    status(status?: ICalTodoStatus | null): ICalTodoStatus | null | this {
        if (status === undefined) return this._status;
        if (status !== null && !Object.values(ICalTodoStatus).includes(status)) {
            throw new Error(`Unsupported status "${String(status)}"`);
        }
        this._status = status;
        return this;
    }

    completed(): ICalTodoDateValue | null;
    completed(completed: ICalTodoDateValue | null): this;
    completed(completed?: ICalTodoDateValue | null): ICalTodoDateValue | null | this {
        if (completed === undefined) return this._completed;
        if (completed !== null) formatUtc(completed);
        this._completed = completed;
        return this;
    }

    percentComplete(): number | null;
    percentComplete(percentComplete: number | null): this;
    percentComplete(percentComplete?: number | null): number | null | this {
        if (percentComplete === undefined) return this._percentComplete;
        this._percentComplete = percentComplete === null ? null : integerIn(percentComplete, 0, 100, 'percentComplete');
        return this;
    }

    sequence(): number | null;
    sequence(sequence: number | null): this;
    sequence(sequence?: number | null): number | null | this {
        if (sequence === undefined) return this._sequence;
        this._sequence = sequence === null ? null : integerIn(sequence, 0, Number.MAX_SAFE_INTEGER, 'sequence');
        return this;
    }

    created(): ICalTodoDateValue | null;
    created(created: ICalTodoDateValue | null): this;
    created(created?: ICalTodoDateValue | null): ICalTodoDateValue | null | this {
        if (created === undefined) return this._created;
        if (created !== null) formatUtc(created);
        this._created = created;
        return this;
    }

    lastModified(): ICalTodoDateValue | null;
    lastModified(lastModified: ICalTodoDateValue | null): this;
    lastModified(lastModified?: ICalTodoDateValue | null): ICalTodoDateValue | null | this {
        if (lastModified === undefined) return this._lastModified;
        if (lastModified !== null) formatUtc(lastModified);
        this._lastModified = lastModified;
        return this;
    }

    categories(): string[];
    categories(categories: ICalTodoCategory[]): this;
    categories(categories?: ICalTodoCategory[]): string[] | this {
        if (categories === undefined) return [...this._categories];
        this._categories = categories.map((category) => (typeof category === 'string' ? category : category.name));
        return this;
    }

    url(): string | null;
    url(url: string | null): this;
    url(url?: string | null): string | null | this {
        if (url === undefined) return this._url;
        if (url !== null && /[\u0000- \u007F]/.test(url)) {
            throw new Error(`Invalid url ${JSON.stringify(url)}`);
        }
        this._url = url || null;
        return this;
    }

    recurrenceId(): ICalTodoDateValue | null;
    recurrenceId(recurrenceId: ICalTodoDateValue | null): this;
    recurrenceId(recurrenceId?: ICalTodoDateValue | null): ICalTodoDateValue | null | this {
        if (recurrenceId === undefined) return this._recurrenceId;
        if (recurrenceId !== null) formatUtc(recurrenceId);
        this._recurrenceId = recurrenceId;
        return this;
    }

    repeating(): ICalTodoRepeatingOptions | string | null;
    repeating(repeating: ICalTodoRepeatingOptions | string | null): this;
    repeating(repeating?: ICalTodoRepeatingOptions | string | null): ICalTodoRepeatingOptions | string | null | this {
        if (repeating === undefined) return this._repeating;
        if (repeating === null) {
            this._repeating = null;
        } else if (typeof repeating === 'string') {
            this._repeating = checkRuleString(repeating);
        } else {
            this._repeating = checkRepeating(repeating);
        }
        return this;
    }

    createAlarm(data: ICalTodoAlarm | ICalTodoAlarmData = {}): ICalTodoAlarm {
        const alarm = data instanceof ICalTodoAlarm ? data : new ICalTodoAlarm(data);
        this._alarms.push(alarm);
        return alarm;
    }

    alarms(): ICalTodoAlarm[];
    alarms(alarms: (ICalTodoAlarm | ICalTodoAlarmData)[]): this;
    alarms(alarms?: (ICalTodoAlarm | ICalTodoAlarmData)[]): ICalTodoAlarm[] | this {
        if (alarms === undefined) return [...this._alarms];
        alarms.forEach((alarm) => this.createAlarm(alarm));
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

    private frame(): RecurrenceFrame & DateFrame {
        return {
            allDay: this._allDay,
            timezone: this._floating ? null : this._timezone,
            floating: this._floating,
        };
    }

    /** Time zone that needs a VTIMEZONE in the calendar, if any. */
    usedTimezone(): string | null {
        return this._allDay || this._floating ? null : this._timezone;
    }

    // DTSTART, DUE, RECURRENCE-ID and EXDATE share the same value type and zone.
    private dateLine(name: string, values: ICalTodoDateValue[]): string {
        const frame = this.frame();
        let params = '';
        if (frame.allDay) {
            params = ';VALUE=DATE';
        } else if (frame.timezone) {
            params = ';TZID=' + parameterValue(frame.timezone);
        }

        const formatted = values.map((value) => {
            const wall = resolveWallTime(value, frame);
            return frame.allDay ? formatDate(wall) : formatDateTime(wall, !frame.timezone && !frame.floating);
        });
        return name + params + ':' + formatted.join(',');
    }

    private validate(): void {
        if (this._start !== null && this._due !== null) {
            const frame = this.frame();
            if (compareWallTime(resolveWallTime(this._due, frame), resolveWallTime(this._start, frame)) < 0) {
                throw new Error(`The due date of to-do "${this._id}" is before its start`);
            }
        }
        if (this._repeating !== null && this._start === null) {
            // RFC 5545, 3.8.2.4: DTSTART is required in recurring components.
            throw new Error(`Repeating to-do "${this._id}" needs a start date`);
        }
    }

    /** Content lines of the VTODO, without folding. */
    toLines(): string[] {
        this.validate();

        const lines = ['BEGIN:VTODO', 'UID:' + escapeText(this._id)];
        if (this._sequence !== null) lines.push('SEQUENCE:' + this._sequence);
        lines.push('DTSTAMP:' + formatUtc(this._stamp));

        if (this._start !== null) lines.push(this.dateLine('DTSTART', [this._start]));
        if (this._due !== null) lines.push(this.dateLine('DUE', [this._due]));
        if (this._recurrenceId !== null) lines.push(this.dateLine('RECURRENCE-ID', [this._recurrenceId]));

        if (this._repeating !== null) {
            const repeating = this._repeating;
            lines.push('RRULE:' + (typeof repeating === 'string' ? repeating : ruleValue(repeating, this.frame())));
            if (typeof repeating !== 'string' && repeating.exclude?.length) {
                lines.push(this.dateLine('EXDATE', repeating.exclude));
            }
        }

        if (this._summary !== null) lines.push('SUMMARY:' + escapeText(this._summary));
        if (this._description !== null) lines.push('DESCRIPTION:' + escapeText(this._description));
        if (this._url !== null) lines.push('URL:' + this._url);
        if (this._priority !== null) lines.push('PRIORITY:' + this._priority);
        if (this._status !== null) lines.push('STATUS:' + this._status);
        if (this._percentComplete !== null) lines.push('PERCENT-COMPLETE:' + this._percentComplete);
        if (this._completed !== null) lines.push('COMPLETED:' + formatUtc(this._completed));
        if (this._categories.length) lines.push('CATEGORIES:' + this._categories.map(escapeText).join(','));
        if (this._created !== null) lines.push('CREATED:' + formatUtc(this._created));
        if (this._lastModified !== null) lines.push('LAST-MODIFIED:' + formatUtc(this._lastModified));
        lines.push(...xLines(this._x));

        const context = {hasStart: this._start !== null, hasDue: this._due !== null, summary: this._summary};
        for (const alarm of this._alarms) {
            lines.push(...alarm.toLines(context));
        }

        lines.push('END:VTODO');
        return lines;
    }

    /** The folded VTODO component, every line terminated with CRLF. */
    toString(): string {
        return foldLines(this.toLines());
    }
}

/** Creates a new to-do, like `ical()` creates a calendar. */
export function todo(data: ICalTodoData = {}): ICalTodo {
    return new ICalTodo(data);
}
