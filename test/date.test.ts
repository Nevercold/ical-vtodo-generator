import {describe, expect, it} from 'vitest';
import {
    type DateFrame,
    formatDate,
    formatDateTime,
    formatUtc,
    type ICalTodoFormattableDate,
    type ICalTodoLuxonDate,
    resolveWallTime,
    UTC_FRAME,
    wallTimeToUtc,
} from '../src/date.ts';

const berlin: DateFrame = {timezone: 'Europe/Berlin', floating: false};
const newYork: DateFrame = {timezone: 'America/New_York', floating: false};
const floating: DateFrame = {timezone: null, floating: true};

describe('Date and ISO strings', () => {
    it('writes UTC without a time zone', () => {
        expect(formatUtc(new Date('2026-11-20T09:30:15Z'))).toBe('20261120T093015Z');
        expect(formatUtc('2026-11-20T10:30:15+01:00')).toBe('20261120T093015Z');
    });

    it('converts to the wall time of a time zone, in winter and summer', () => {
        expect(formatDateTime(resolveWallTime(new Date('2026-01-15T09:00:00Z'), berlin), false)).toBe('20260115T100000');
        expect(formatDateTime(resolveWallTime(new Date('2026-07-15T09:00:00Z'), berlin), false)).toBe('20260715T110000');
    });

    it('does not depend on the time zone of the process', () => {
        expect(formatDateTime(resolveWallTime(new Date('2026-11-20T03:00:00Z'), newYork), false)).toBe('20261119T220000');
    });

    it('accepts globally unique TZIDs with a leading slash', () => {
        const frame: DateFrame = {timezone: '/Europe/Berlin', floating: false};
        expect(formatDateTime(resolveWallTime(new Date('2026-01-15T09:00:00Z'), frame), false)).toBe('20260115T100000');
    });

    it('takes the calendar date in the time zone for all-day values', () => {
        // 23:30 UTC is already the next day in Berlin
        expect(formatDate(resolveWallTime(new Date('2026-11-19T23:30:00Z'), berlin))).toBe('20261120');
        expect(formatDate(resolveWallTime(new Date('2026-11-19T23:30:00Z'), UTC_FRAME))).toBe('20261119');
    });

    it('takes plain date strings as calendar dates in every zone', () => {
        expect(formatDate(resolveWallTime('2026-11-20', newYork))).toBe('20261120');
        expect(formatDate(resolveWallTime('2026-11-20', UTC_FRAME))).toBe('20261120');
    });

    it('writes floating Date values with their UTC fields', () => {
        expect(formatDateTime(resolveWallTime(new Date('2026-11-20T09:00:00Z'), floating), false)).toBe('20261120T090000');
    });

    it('rejects invalid dates and unknown zones', () => {
        expect(() => formatUtc('not a date')).toThrow('Invalid date');
        expect(() => formatUtc(new Date(Number.NaN))).toThrow('Invalid date');
        expect(() => resolveWallTime(new Date(), {timezone: 'Mars/Olympus', floating: false})).toThrow('Unknown time zone');
    });
});

describe('wallTimeToUtc', () => {
    it('converts winter and summer time', () => {
        const winter = {year: 2026, month: 1, day: 15, hour: 10, minute: 0, second: 0};
        const summer = {year: 2026, month: 7, day: 15, hour: 10, minute: 0, second: 0};
        expect(formatDateTime(wallTimeToUtc(winter, 'Europe/Berlin'), true)).toBe('20260115T090000Z');
        expect(formatDateTime(wallTimeToUtc(summer, 'Europe/Berlin'), true)).toBe('20260715T080000Z');
    });

    it('handles the day after a DST change', () => {
        const wall = {year: 2026, month: 3, day: 29, hour: 12, minute: 0, second: 0};
        expect(formatDateTime(wallTimeToUtc(wall, 'Europe/Berlin'), true)).toBe('20260329T100000Z');
    });
});

const temporal = (globalThis as {Temporal?: typeof Temporal}).Temporal;

describe.skipIf(!temporal)('Temporal', () => {
    it('converts ZonedDateTime to the frame zone or UTC', () => {
        const value = Temporal.ZonedDateTime.from('2026-11-20T10:00:00[Europe/Berlin]');
        expect(formatDateTime(resolveWallTime(value, berlin), false)).toBe('20261120T100000');
        expect(formatDateTime(resolveWallTime(value, newYork), false)).toBe('20261120T040000');
        expect(formatUtc(value)).toBe('20261120T090000Z');
    });

    it('converts Instant', () => {
        expect(formatUtc(Temporal.Instant.from('2026-11-20T09:00:00Z'))).toBe('20261120T090000Z');
    });

    it('takes PlainDate and PlainDateTime as wall time of the frame', () => {
        expect(formatDate(resolveWallTime(Temporal.PlainDate.from('2026-11-20'), newYork))).toBe('20261120');
        const value = Temporal.PlainDateTime.from('2026-11-20T10:00:00');
        expect(formatDateTime(resolveWallTime(value, berlin), false)).toBe('20261120T100000');
    });
});

describe('dayjs and moment like objects', () => {
    // Minimal stand-in that knows its UTC instant and can be shifted to an offset.
    class FakeDayjs implements ICalTodoFormattableDate {
        constructor(private readonly epochMs: number, private readonly offsetMinutes = 0) {}

        format(format: string): string {
            expect(format).toBe('YYYYMMDDHHmmss');
            return new Date(this.epochMs + this.offsetMinutes * 60_000).toISOString().replace(/\D/g, '').slice(0, 14);
        }

        tz(zone: string): FakeDayjs {
            expect(zone).toBe('Europe/Berlin');
            return new FakeDayjs(this.epochMs, 60);
        }

        utc(): FakeDayjs {
            return new FakeDayjs(this.epochMs);
        }
    }

    const value = new FakeDayjs(Date.parse('2026-11-20T09:00:00Z'), 120);

    it('uses tz() for a time zone and utc() otherwise', () => {
        expect(formatDateTime(resolveWallTime(value, berlin), false)).toBe('20261120T100000');
        expect(formatUtc(value)).toBe('20261120T090000Z');
    });

    it('keeps the object as it is when floating', () => {
        expect(formatDateTime(resolveWallTime(value, floating), false)).toBe('20261120T110000');
    });

    it('needs utc() for UTC values', () => {
        expect(() => formatUtc({format: () => '20261120090000'})).toThrow('utc()');
    });
});

describe('luxon like objects', () => {
    it('uses setZone() and toFormat()', () => {
        const zones: string[] = [];
        const value: ICalTodoLuxonDate = {
            setZone(zone) {
                zones.push(zone);
                return value;
            },
            toFormat: () => '20261120100000',
        };
        expect(formatDateTime(resolveWallTime(value, berlin), false)).toBe('20261120T100000');
        expect(formatUtc(value)).toBe('20261120T100000Z');
        expect(zones).toEqual(['Europe/Berlin', 'utc']);
    });
});
