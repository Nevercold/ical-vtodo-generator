import {formatDate, formatDateTime, type ICalTodoDateValue, resolveWallTime, wallTimeToUtc, zoneName} from './date.ts';

export const ICalTodoRepeatingFreq = {
    DAILY: 'DAILY',
    WEEKLY: 'WEEKLY',
    MONTHLY: 'MONTHLY',
    YEARLY: 'YEARLY',
} as const;
export type ICalTodoRepeatingFreq = (typeof ICalTodoRepeatingFreq)[keyof typeof ICalTodoRepeatingFreq];

export const ICalTodoWeekday = {
    SU: 'SU',
    MO: 'MO',
    TU: 'TU',
    WE: 'WE',
    TH: 'TH',
    FR: 'FR',
    SA: 'SA',
} as const;
export type ICalTodoWeekday = (typeof ICalTodoWeekday)[keyof typeof ICalTodoWeekday];

/** A weekday, optionally with an ordinal for monthly and yearly rules, like `1MO` or `-1FR`. */
export type ICalTodoByDay = ICalTodoWeekday | `${number}${ICalTodoWeekday}`;

export interface ICalTodoRepeatingOptions {
    freq: ICalTodoRepeatingFreq;
    interval?: number;
    /** Number of occurrences. Cannot be combined with `until`. */
    count?: number;
    /** Last possible occurrence (inclusive). Cannot be combined with `count`. */
    until?: ICalTodoDateValue;
    byDay?: ICalTodoByDay[];
    /** Occurrences to leave out (EXDATE). */
    exclude?: ICalTodoDateValue[];
}

/** The way DTSTART of the to-do is written, which the rule has to follow. */
export interface RecurrenceFrame {
    allDay: boolean;
    timezone: string | null;
    floating: boolean;
}

const BY_DAY = /^([+-]?)(\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/;

function positiveInteger(value: number, name: string): number {
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`${name} must be a positive integer`);
    }
    return value;
}

export function checkRepeating(options: ICalTodoRepeatingOptions): ICalTodoRepeatingOptions {
    if (!Object.values(ICalTodoRepeatingFreq).includes(options.freq)) {
        throw new Error(`Unsupported repeating frequency "${String(options.freq)}"`);
    }
    if (options.interval !== undefined) positiveInteger(options.interval, 'interval');
    if (options.count !== undefined) positiveInteger(options.count, 'count');
    if (options.count !== undefined && options.until !== undefined) {
        throw new Error('A repeating rule can have either count or until, not both');
    }

    for (const day of options.byDay ?? []) {
        const match = BY_DAY.exec(day);
        if (!match) {
            throw new Error(`Invalid weekday "${day}"`);
        }
        if (match[2] !== undefined) {
            const ordinal = Number(match[2]);
            if (ordinal < 1 || ordinal > 53) {
                throw new Error(`Invalid weekday "${day}"`);
            }
            if (options.freq !== 'MONTHLY' && options.freq !== 'YEARLY') {
                throw new Error(`Weekdays with an ordinal like "${day}" need a monthly or yearly rule`);
            }
        }
    }

    return {
        ...options,
        byDay: options.byDay ? [...options.byDay] : undefined,
        exclude: options.exclude ? [...options.exclude] : undefined,
    };
}

/** Checks an RRULE given as text, with or without the `RRULE:` prefix. */
export function checkRuleString(rule: string): string {
    const value = rule.replace(/^RRULE:/i, '').trim();
    if (!/^[A-Z-]+=[A-Z0-9,+-]+(;[A-Z-]+=[A-Z0-9,+-]+)*$/i.test(value) || !/(^|;)FREQ=/i.test(value)) {
        throw new Error(`Invalid RRULE "${rule}"`);
    }
    return value;
}

/**
 * UNTIL has to match DTSTART: a DATE for all-day to-dos, a local time for
 * floating ones and UTC otherwise (RFC 5545, 3.3.10).
 */
function formatUntil(until: ICalTodoDateValue, frame: RecurrenceFrame): string {
    const wall = resolveWallTime(until, frame);
    if (frame.allDay) {
        return formatDate(wall);
    }
    if (frame.floating) {
        return formatDateTime(wall, false);
    }
    return formatDateTime(frame.timezone ? wallTimeToUtc(wall, zoneName(frame.timezone)) : wall, true);
}

export function ruleValue(options: ICalTodoRepeatingOptions, frame: RecurrenceFrame): string {
    const parts = ['FREQ=' + options.freq];
    if (options.interval !== undefined && options.interval !== 1) parts.push('INTERVAL=' + options.interval);
    if (options.count !== undefined) parts.push('COUNT=' + options.count);
    if (options.until !== undefined) parts.push('UNTIL=' + formatUntil(options.until, frame));
    if (options.byDay?.length) parts.push('BYDAY=' + options.byDay.join(','));
    return parts.join(';');
}
