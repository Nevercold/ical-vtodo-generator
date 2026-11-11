import ical, {ICalAlarmRelatesTo, ICalEventRepeatingFreq, ICalWeekday} from 'ical-generator';
import ICAL from 'ical.js';
import {describe, expect, it} from 'vitest';
import {insertTodos, ICalTodoStatus, todo} from '../src/index.ts';
import {berlinTimezone, expectValidLines, newYorkTimezone} from './helpers.ts';

const stamp = new Date('2026-11-11T12:00:00Z');

function generator(timezone: string): string | null {
    return berlinTimezone(timezone) ?? newYorkTimezone(timezone);
}

function count(data: string, line: string): number {
    return data.split('\r\n').filter((value) => value === line).length;
}

function calendarWithEvent() {
    const calendar = ical({name: 'Team', prodId: {company: 'Example', product: 'Calendar'}, timezone: {name: null, generator}});
    calendar.createEvent({
        id: 'event-1',
        stamp,
        start: new Date('2026-11-20T09:00:00Z'),
        end: new Date('2026-11-20T10:00:00Z'),
        timezone: 'Europe/Berlin',
        summary: 'Weekly meeting',
    });
    return calendar;
}

describe('insertTodos', () => {
    it('adds to-dos to an ical-generator calendar', () => {
        const data = insertTodos(calendarWithEvent(), [
            todo({id: 'todo-1', stamp, summary: 'Prepare agenda', timezone: 'Europe/Berlin', due: new Date('2026-11-20T08:00:00Z')}),
        ], {timezoneGenerator: generator});

        expectValidLines(data);
        const calendar = new ICAL.Component(ICAL.parse(data));
        expect(calendar.getAllSubcomponents('vevent')).toHaveLength(1);
        expect(calendar.getAllSubcomponents('vtodo')).toHaveLength(1);
        expect(calendar.getFirstSubcomponent('vtodo')?.getFirstPropertyValue('summary')).toBe('Prepare agenda');
        expect(data.endsWith('END:VTODO\r\nEND:VCALENDAR\r\n')).toBe(true);
    });

    it('does not add a VTIMEZONE that the calendar already has', () => {
        const data = insertTodos(calendarWithEvent(), [
            todo({id: 'todo-1', stamp, timezone: 'Europe/Berlin', due: new Date('2026-11-20T08:00:00Z')}),
            todo({id: 'todo-2', stamp, timezone: 'Europe/Berlin', due: new Date('2026-11-21T08:00:00Z')}),
        ], {timezoneGenerator: generator});

        expect(count(data, 'TZID:Europe/Berlin')).toBe(1);
    });

    it('adds a VTIMEZONE only used by to-dos once, before the other components', () => {
        const data = insertTodos(calendarWithEvent(), [
            todo({id: 'todo-1', stamp, timezone: 'America/New_York', due: new Date('2026-11-20T08:00:00Z')}),
            todo({id: 'todo-2', stamp, timezone: 'America/New_York', due: new Date('2026-11-21T08:00:00Z')}),
        ], {timezoneGenerator: generator});

        expect(count(data, 'TZID:America/New_York')).toBe(1);
        expect(data.indexOf('TZID:America/New_York')).toBeLessThan(data.indexOf('BEGIN:VEVENT'));

        // ical.js resolves the TZID with the VTIMEZONE of the calendar
        const calendar = new ICAL.Component(ICAL.parse(data));
        for (const timezone of calendar.getAllSubcomponents('vtimezone')) {
            ICAL.TimezoneService.register(timezone);
        }
        const due = calendar.getFirstSubcomponent('vtodo')?.getFirstPropertyValue('due');
        expect(due instanceof ICAL.Time ? due.toUnixTime() : null).toBe(Date.parse('2026-11-20T08:00:00Z') / 1000);
        ICAL.TimezoneService.reset();
    });

    it('works without timezone generator', () => {
        const calendar = ical({prodId: {company: 'Example', product: 'Calendar'}});
        const data = insertTodos(calendar, [todo({id: 'a', stamp, timezone: 'Europe/Berlin', due: new Date('2026-11-20T08:00:00Z')})]);
        expect(data).not.toContain('BEGIN:VTIMEZONE');
        expect(data).toContain('DUE;TZID=Europe/Berlin:20261120T090000');
    });

    it('skips the VTIMEZONE for all-day, floating and globally unique zones', () => {
        const calls: string[] = [];
        insertTodos(calendarWithEvent(), [
            todo({id: 'a', stamp, allDay: true, timezone: 'America/New_York', due: '2026-11-20'}),
            todo({id: 'b', stamp, floating: true, timezone: 'America/New_York', due: '2026-11-20T08:00:00'}),
            todo({id: 'c', stamp, timezone: '/America/New_York', due: new Date('2026-11-20T08:00:00Z')}),
        ], {
            timezoneGenerator: (timezone) => {
                calls.push(timezone);
                return null;
            },
        });
        expect(calls).toEqual([]);
    });

    it('adds time zones and to-dos to an empty calendar with trailing properties', () => {
        const calendar = ical({prodId: {company: 'Example', product: 'Calendar'}, ttl: 3600, x: {'X-CUSTOM': '1'}});
        const data = insertTodos(calendar, [
            todo({id: 'a', stamp, timezone: 'Europe/Berlin', due: new Date('2026-11-20T08:00:00Z')}),
        ], {timezoneGenerator: generator});

        expectValidLines(data);
        expect(data.indexOf('BEGIN:VTIMEZONE')).toBeLessThan(data.indexOf('BEGIN:VTODO'));
        expect(new ICAL.Component(ICAL.parse(data)).getAllSubcomponents('vtodo')).toHaveLength(1);
    });

    it('keeps events with recurrences, alarms and their own folding intact', () => {
        const calendar = calendarWithEvent();
        const event = calendar.createEvent({
            id: 'event-2',
            stamp,
            start: new Date('2026-11-16T09:00:00Z'),
            end: new Date('2026-11-16T10:00:00Z'),
            summary: 'Ein sehr langer Titel mit Ümläuten, der über die Grenze von 75 Oktetten hinausgeht 🎉',
            repeating: {freq: ICalEventRepeatingFreq.WEEKLY, byDay: [ICalWeekday.MO], count: 4},
        });
        event.createAlarm({triggerBefore: 600, relatesTo: ICalAlarmRelatesTo.start});

        const data = insertTodos(calendar, [todo({id: 'a', stamp})]);
        const parsed = new ICAL.Component(ICAL.parse(data));
        const events = parsed.getAllSubcomponents('vevent');
        expect(events[1]?.getFirstPropertyValue('summary')).toBe(event.summary());
        expect(events[1]?.getFirstPropertyValue('rrule')?.toString()).toBe('FREQ=WEEKLY;COUNT=4;BYDAY=MO');
    });

    it('accepts iCalendar text with LF line breaks', () => {
        const data = insertTodos('BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//x//y//EN\nEND:VCALENDAR\n', [todo({id: 'a', stamp})]);
        expect(data).toBe([
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//x//y//EN',
            'BEGIN:VTODO',
            'UID:a',
            'DTSTAMP:20261111T120000Z',
            'END:VTODO',
            'END:VCALENDAR',
            '',
        ].join('\r\n'));
    });

    it('rejects data that is not a single calendar', () => {
        expect(() => insertTodos('BEGIN:VEVENT\r\nEND:VEVENT\r\n', [])).toThrow('VCALENDAR');
        expect(() => insertTodos('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\nBEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', [])).toThrow('VCALENDAR');
    });

    it('writes a feed with a repeating to-do and a completed occurrence', () => {
        const calendar = calendarWithEvent();
        const data = insertTodos(calendar, [
            todo({
                id: 'weekly-report',
                stamp,
                summary: 'Wochenbericht',
                timezone: 'Europe/Berlin',
                start: new Date('2026-11-16T08:00:00Z'),
                due: new Date('2026-11-16T16:00:00Z'),
                repeating: {freq: 'WEEKLY', byDay: ['MO'], until: new Date('2026-12-31T23:00:00Z')},
                alarms: [{trigger: 15 * 60}],
            }),
            todo({
                id: 'weekly-report',
                stamp,
                summary: 'Wochenbericht',
                timezone: 'Europe/Berlin',
                start: new Date('2026-11-23T08:00:00Z'),
                due: new Date('2026-11-23T16:00:00Z'),
                recurrenceId: new Date('2026-11-23T08:00:00Z'),
                status: ICalTodoStatus.COMPLETED,
                completed: new Date('2026-11-23T14:05:00Z'),
            }),
        ], {timezoneGenerator: generator});

        expectValidLines(data);
        const todos = new ICAL.Component(ICAL.parse(data)).getAllSubcomponents('vtodo');
        expect(todos).toHaveLength(2);
        expect(todos[1]?.getFirstProperty('recurrence-id')?.getParameter('tzid')).toBe('Europe/Berlin');
        expect(count(data, 'TZID:Europe/Berlin')).toBe(1);
    });
});
