import ICAL from 'ical.js';
import {expect} from 'vitest';
import type {ICalTodo} from '../src/index.ts';

/** Wraps components in a minimal calendar, parses it with ical.js and returns the VTODOs. */
export function parseTodos(...todos: ICalTodo[]): ICAL.Component[] {
    const data = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//test//EN\r\n' +
        todos.map((todo) => todo.toString()).join('') +
        'END:VCALENDAR\r\n';
    expectValidLines(data);
    return new ICAL.Component(ICAL.parse(data)).getAllSubcomponents('vtodo');
}

/** CRLF line breaks only, no line over 75 octets. */
export function expectValidLines(data: string): void {
    expect(data.endsWith('\r\n')).toBe(true);
    expect(data.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    for (const line of data.slice(0, -2).split('\r\n')) {
        expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
}

/** Unfolded content lines of a component. */
export function lines(todo: ICalTodo): string[] {
    return todo.toLines();
}

/** VTIMEZONE for Europe/Berlin as produced by common generators. */
export function berlinTimezone(timezone: string): string | null {
    if (timezone !== 'Europe/Berlin') {
        return null;
    }
    return [
        'BEGIN:VTIMEZONE',
        'TZID:Europe/Berlin',
        'BEGIN:DAYLIGHT',
        'TZOFFSETFROM:+0100',
        'TZOFFSETTO:+0200',
        'TZNAME:CEST',
        'DTSTART:19700329T020000',
        'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
        'END:DAYLIGHT',
        'BEGIN:STANDARD',
        'TZOFFSETFROM:+0200',
        'TZOFFSETTO:+0100',
        'TZNAME:CET',
        'DTSTART:19701025T030000',
        'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
        'END:STANDARD',
        'END:VTIMEZONE',
    ].join('\r\n');
}

export function newYorkTimezone(timezone: string): string | null {
    if (timezone !== 'America/New_York') {
        return null;
    }
    return [
        'BEGIN:VTIMEZONE',
        'TZID:America/New_York',
        'BEGIN:DAYLIGHT',
        'TZOFFSETFROM:-0500',
        'TZOFFSETTO:-0400',
        'TZNAME:EDT',
        'DTSTART:19700308T020000',
        'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
        'END:DAYLIGHT',
        'BEGIN:STANDARD',
        'TZOFFSETFROM:-0400',
        'TZOFFSETTO:-0500',
        'TZNAME:EST',
        'DTSTART:19701101T020000',
        'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
        'END:STANDARD',
        'END:VTIMEZONE',
    ].join('\r\n');
}
