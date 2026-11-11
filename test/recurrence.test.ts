import ICAL from 'ical.js';
import {describe, expect, it} from 'vitest';
import {ICalTodoRepeatingFreq, ICalTodoStatus, ICalTodoWeekday, todo} from '../src/index.ts';
import {lines, parseTodos} from './helpers.ts';

const stamp = new Date('2026-11-11T12:00:00Z');

function rule(value: ReturnType<typeof todo>): string | undefined {
    return lines(value).find((line) => line.startsWith('RRULE:'));
}

describe('RRULE', () => {
    it('writes frequency, interval, count and weekdays', () => {
        const value = todo({
            id: 'a',
            stamp,
            start: new Date('2026-11-16T08:00:00Z'),
            repeating: {freq: ICalTodoRepeatingFreq.WEEKLY, interval: 2, count: 10, byDay: [ICalTodoWeekday.MO, ICalTodoWeekday.TH]},
        });
        expect(rule(value)).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=10;BYDAY=MO,TH');
    });

    it.each(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const)('supports %s', (freq) => {
        const value = todo({id: 'a', stamp, start: new Date('2026-11-16T08:00:00Z'), repeating: {freq}});
        expect(rule(value)).toBe(`RRULE:FREQ=${freq}`);
    });

    it('allows ordinal weekdays for monthly rules', () => {
        const value = todo({id: 'a', stamp, start: '2026-11-27', allDay: true, repeating: {freq: 'MONTHLY', byDay: ['-1FR']}});
        expect(rule(value)).toBe('RRULE:FREQ=MONTHLY;BYDAY=-1FR');
    });

    it('writes UNTIL in UTC when the start has a time zone', () => {
        const value = todo({
            id: 'a',
            stamp,
            timezone: 'Europe/Berlin',
            start: new Date('2026-11-16T08:00:00Z'),
            repeating: {freq: 'DAILY', until: new Date('2026-11-30T08:00:00Z')},
        });
        expect(rule(value)).toBe('RRULE:FREQ=DAILY;UNTIL=20261130T080000Z');
    });

    it('converts a plain UNTIL from the time zone to UTC', () => {
        const value = todo({
            id: 'a',
            stamp,
            timezone: 'Europe/Berlin',
            start: new Date('2026-11-16T08:00:00Z'),
            repeating: {freq: 'DAILY', until: '2026-11-30'},
        });
        expect(rule(value)).toBe('RRULE:FREQ=DAILY;UNTIL=20261129T230000Z');
    });

    it('writes UNTIL as DATE for all-day to-dos', () => {
        const value = todo({id: 'a', stamp, allDay: true, start: '2026-11-16', repeating: {freq: 'DAILY', until: '2026-11-30'}});
        expect(rule(value)).toBe('RRULE:FREQ=DAILY;UNTIL=20261130');
    });

    it('accepts a rule as text', () => {
        const value = todo({id: 'a', stamp, start: new Date('2026-11-16T08:00:00Z'), repeating: 'RRULE:FREQ=MONTHLY;BYMONTHDAY=1,15'});
        expect(rule(value)).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=1,15');
    });

    it('validates the rule', () => {
        expect(() => todo({repeating: {freq: 'HOURLY' as ICalTodoRepeatingFreq}})).toThrow('frequency');
        expect(() => todo({repeating: {freq: 'DAILY', count: 0}})).toThrow('count');
        expect(() => todo({repeating: {freq: 'DAILY', interval: 1.5}})).toThrow('interval');
        expect(() => todo({repeating: {freq: 'DAILY', count: 3, until: new Date()}})).toThrow('count or until');
        expect(() => todo({repeating: {freq: 'WEEKLY', byDay: ['1MO']}})).toThrow('monthly or yearly');
        expect(() => todo({repeating: {freq: 'MONTHLY', byDay: ['60MO']}})).toThrow('Invalid weekday');
        expect(() => todo({repeating: 'COUNT=3'})).toThrow('Invalid RRULE');
        expect(() => todo({repeating: 'FREQ=DAILY\r\nSUMMARY:x'})).toThrow('Invalid RRULE');
    });

    it('needs a start date', () => {
        const value = todo({id: 'a', stamp, due: new Date('2026-11-16T08:00:00Z'), repeating: {freq: 'DAILY'}});
        expect(() => value.toString()).toThrow('needs a start date');
    });
});

describe('EXDATE', () => {
    it('uses the value type and zone of DTSTART', () => {
        const zoned = todo({
            id: 'a',
            stamp,
            timezone: 'Europe/Berlin',
            start: new Date('2026-11-16T08:00:00Z'),
            repeating: {freq: 'DAILY', exclude: [new Date('2026-11-18T08:00:00Z'), new Date('2026-11-19T08:00:00Z')]},
        });
        expect(lines(zoned)).toContain('EXDATE;TZID=Europe/Berlin:20261118T090000,20261119T090000');

        const allDay = todo({id: 'a', stamp, allDay: true, start: '2026-11-16', repeating: {freq: 'DAILY', exclude: ['2026-11-18']}});
        expect(lines(allDay)).toContain('EXDATE;VALUE=DATE:20261118');
    });
});

describe('overrides', () => {
    // A daily to-do whose occurrence on the 17th is done and whose occurrence on the 18th is left out.
    const master = todo({
        id: 'daily-standup',
        stamp,
        summary: 'Prepare standup',
        allDay: true,
        start: '2026-11-16',
        due: '2026-11-16',
        repeating: {freq: 'DAILY', count: 5, exclude: ['2026-11-18']},
    });
    const done = todo({
        id: 'daily-standup',
        stamp,
        summary: 'Prepare standup',
        allDay: true,
        start: '2026-11-17',
        due: '2026-11-17',
        recurrenceId: '2026-11-17',
        status: ICalTodoStatus.COMPLETED,
        completed: new Date('2026-11-17T08:12:00Z'),
        percentComplete: 100,
    });

    it('writes RECURRENCE-ID with the value type of DTSTART', () => {
        expect(lines(done)).toContain('RECURRENCE-ID;VALUE=DATE:20261117');

        const zoned = todo({id: 'a', stamp, timezone: 'Europe/Berlin', start: new Date('2026-11-17T08:00:00Z'), recurrenceId: new Date('2026-11-17T08:00:00Z')});
        expect(lines(zoned)).toContain('RECURRENCE-ID;TZID=Europe/Berlin:20261117T090000');
    });

    it('expands with ical.js, with the completed occurrence as override', () => {
        const [masterComponent, doneComponent] = parseTodos(master, done);
        if (!masterComponent || !doneComponent) throw new Error('missing components');

        const item = new ICAL.Event(masterComponent);
        item.relateException(doneComponent);

        const iterator = item.iterator();
        const occurrences: string[] = [];
        for (let next = iterator.next(); next; next = iterator.next()) {
            occurrences.push(next.toString());
        }
        expect(occurrences).toEqual(['2026-11-16', '2026-11-17', '2026-11-19', '2026-11-20']);

        const details = item.getOccurrenceDetails(ICAL.Time.fromDateString('2026-11-17'));
        expect(details.item.component.getFirstPropertyValue('status')).toBe('COMPLETED');

        const open = item.getOccurrenceDetails(ICAL.Time.fromDateString('2026-11-19'));
        expect(open.item.component.getFirstPropertyValue('status')).toBeNull();
    });
});
