/** dayjs, moment and moment-timezone objects, or anything with the same methods. */
export interface ICalTodoFormattableDate {
    format(format: string): string;
    tz?(zone: string): ICalTodoFormattableDate;
    utc?(): ICalTodoFormattableDate;
}

/** Luxon `DateTime` objects. */
export interface ICalTodoLuxonDate {
    setZone(zone: string): ICalTodoLuxonDate;
    toFormat(format: string): string;
}

/** `Temporal.Instant` */
export interface ICalTodoTemporalInstant {
    readonly epochMilliseconds: number;
}

/** `Temporal.PlainDate` */
export interface ICalTodoTemporalPlainDate {
    readonly year: number;
    readonly month: number;
    readonly day: number;
}

/** `Temporal.PlainDateTime` */
export interface ICalTodoTemporalPlainDateTime extends ICalTodoTemporalPlainDate {
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
}

/** `Temporal.ZonedDateTime` */
export interface ICalTodoTemporalZonedDateTime extends ICalTodoTemporalPlainDateTime {
    readonly timeZoneId: string;
    withTimeZone(timeZone: string): ICalTodoTemporalZonedDateTime;
}

/**
 * Every date value accepted by this library. Strings are parsed with
 * `new Date()`, except plain dates like `2026-11-20`, which are taken as
 * calendar dates without a time zone.
 */
export type ICalTodoDateValue =
    | Date
    | string
    | ICalTodoFormattableDate
    | ICalTodoLuxonDate
    | ICalTodoTemporalInstant
    | ICalTodoTemporalZonedDateTime
    | ICalTodoTemporalPlainDateTime
    | ICalTodoTemporalPlainDate;

export interface WallTime {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
}

/**
 * The frame a value is written in: a time zone (wall time with TZID),
 * floating (wall time without TZID) or neither (UTC).
 */
export interface DateFrame {
    timezone: string | null;
    floating: boolean;
}

export const UTC_FRAME: DateFrame = {timezone: null, floating: false};

const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
    let formatter = formatters.get(timezone);
    if (!formatter) {
        try {
            formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                hourCycle: 'h23',
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric',
            });
        } catch {
            throw new Error(`Unknown time zone "${timezone}"`);
        }
        formatters.set(timezone, formatter);
    }
    return formatter;
}

/** Strips the leading slash of globally unique TZIDs like `/Europe/Berlin`. */
export function zoneName(timezone: string): string {
    return timezone.startsWith('/') ? timezone.slice(1) : timezone;
}

function wallTimeAt(epochMs: number, timezone: string | null): WallTime {
    if (!timezone) {
        const d = new Date(epochMs);
        return {
            year: d.getUTCFullYear(),
            month: d.getUTCMonth() + 1,
            day: d.getUTCDate(),
            hour: d.getUTCHours(),
            minute: d.getUTCMinutes(),
            second: d.getUTCSeconds(),
        };
    }

    const parts: Record<string, number> = {};
    for (const part of formatterFor(zoneName(timezone)).formatToParts(new Date(epochMs))) {
        if (part.type !== 'literal') {
            parts[part.type] = Number(part.value);
        }
    }
    return {
        year: parts['year'] ?? 0,
        month: parts['month'] ?? 0,
        day: parts['day'] ?? 0,
        hour: parts['hour'] ?? 0,
        minute: parts['minute'] ?? 0,
        second: parts['second'] ?? 0,
    };
}

function wallTimeToEpoch(wall: WallTime): number {
    return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
}

/** Converts a wall time in the given zone to UTC. */
export function wallTimeToUtc(wall: WallTime, timezone: string): WallTime {
    const guess = wallTimeToEpoch(wall);
    const offset = wallTimeToEpoch(wallTimeAt(guess, timezone)) - guess;
    let epochMs = guess - offset;

    // The offset at the result may differ when a DST change lies in between.
    const corrected = wallTimeToEpoch(wallTimeAt(epochMs, timezone)) - epochMs;
    if (corrected !== offset) {
        epochMs = guess - corrected;
    }

    return wallTimeAt(epochMs, null);
}

function parseCompact(value: string, source: string): WallTime {
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value);
    if (!match) {
        throw new Error(`Unable to read date "${source}"`);
    }
    const [, year, month, day, hour, minute, second] = match.map(Number);
    return {
        year: year ?? 0,
        month: month ?? 0,
        day: day ?? 0,
        hour: hour ?? 0,
        minute: minute ?? 0,
        second: second ?? 0,
    };
}

function isLuxon(value: object): value is ICalTodoLuxonDate {
    return 'setZone' in value && typeof value.setZone === 'function' && 'toFormat' in value;
}

function isZoned(value: object): value is ICalTodoTemporalZonedDateTime {
    return 'timeZoneId' in value && 'withTimeZone' in value && typeof value.withTimeZone === 'function';
}

function isInstant(value: object): value is ICalTodoTemporalInstant {
    return 'epochMilliseconds' in value && typeof value.epochMilliseconds === 'number' && !('year' in value);
}

function isPlainDate(value: object): value is ICalTodoTemporalPlainDate {
    return 'year' in value && 'month' in value && 'day' in value && typeof value.year === 'number';
}

function isPlainDateTime(value: object): value is ICalTodoTemporalPlainDateTime {
    return isPlainDate(value) && 'hour' in value && typeof value.hour === 'number';
}

function isFormattable(value: object): value is ICalTodoFormattableDate {
    return 'format' in value && typeof value.format === 'function';
}

function epochOf(value: Date | string): number {
    const epochMs = new Date(value).getTime();
    if (Number.isNaN(epochMs)) {
        throw new Error(`Invalid date ${JSON.stringify(value)}`);
    }
    return epochMs;
}

function plain(value: ICalTodoTemporalPlainDate): WallTime {
    const time = isPlainDateTime(value) ? value : {hour: 0, minute: 0, second: 0};
    return {
        year: value.year,
        month: value.month,
        day: value.day,
        hour: time.hour,
        minute: time.minute,
        second: time.second,
    };
}

/**
 * Returns the wall time of a value in the given frame: in its time zone,
 * in UTC, or (floating) as it is.
 *
 * Instants (`Date`, ISO strings, `Temporal.Instant`) are converted to the
 * zone of the frame. Values without a zone (`Temporal.PlainDate(Time)`,
 * `2026-11-20`) are taken as wall time of the frame.
 */
export function resolveWallTime(value: ICalTodoDateValue, frame: DateFrame): WallTime {
    const timezone = frame.timezone ? zoneName(frame.timezone) : null;

    if (value instanceof Date) {
        return wallTimeAt(epochOf(value), timezone);
    }

    if (typeof value === 'string') {
        const match = PLAIN_DATE.exec(value);
        if (match) {
            return {year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: 0, minute: 0, second: 0};
        }
        return wallTimeAt(epochOf(value), timezone);
    }

    if (isLuxon(value)) {
        const zoned = timezone ? value.setZone(timezone) : frame.floating ? value : value.setZone('utc');
        return parseCompact(zoned.toFormat('yyyyLLddHHmmss'), String(value));
    }

    if (isZoned(value)) {
        const zoned = timezone ? value.withTimeZone(timezone) : frame.floating ? value : value.withTimeZone('UTC');
        return plain(zoned);
    }

    if (isInstant(value)) {
        return wallTimeAt(value.epochMilliseconds, timezone);
    }

    if (isPlainDate(value)) {
        return plain(value);
    }

    if (isFormattable(value)) {
        let zoned: ICalTodoFormattableDate = value;
        if (timezone) {
            zoned = value.tz ? value.tz(timezone) : value;
        } else if (!frame.floating) {
            if (!value.utc) {
                throw new Error('Unable to convert date to UTC: the object has no utc() method');
            }
            zoned = value.utc();
        }
        return parseCompact(zoned.format('YYYYMMDDHHmmss'), String(value));
    }

    throw new Error(`Unsupported date value ${String(value)}`);
}

const pad = (value: number, length = 2): string => String(value).padStart(length, '0');

export function formatDate(wall: WallTime): string {
    return pad(wall.year, 4) + pad(wall.month) + pad(wall.day);
}

export function formatDateTime(wall: WallTime, utc: boolean): string {
    return formatDate(wall) + 'T' + pad(wall.hour) + pad(wall.minute) + pad(wall.second) + (utc ? 'Z' : '');
}

export function compareWallTime(a: WallTime, b: WallTime): number {
    return wallTimeToEpoch(a) - wallTimeToEpoch(b);
}

/** DATE-TIME in UTC, as required for DTSTAMP, CREATED, COMPLETED and others. */
export function formatUtc(value: ICalTodoDateValue): string {
    return formatDateTime(resolveWallTime(value, UTC_FRAME), true);
}
