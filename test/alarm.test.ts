import {describe, expect, it} from 'vitest';
import {ICalTodoAlarm, ICalTodoAlarmRelatesTo, ICalTodoAlarmType, todo} from '../src/index.ts';
import {toDuration} from '../src/alarm.ts';
import {lines, parseTodos} from './helpers.ts';

const base = {id: 'a', stamp: new Date('2026-11-11T12:00:00Z'), summary: 'Pay rent'};

function alarmLines(value: ReturnType<typeof todo>): string[] {
    const result = lines(value);
    return result.slice(result.indexOf('BEGIN:VALARM'), result.lastIndexOf('END:VALARM') + 1);
}

describe('toDuration', () => {
    it.each([
        [0, 'PT0S'],
        [-900, '-PT15M'],
        [900, 'PT15M'],
        [-3600, '-PT1H'],
        [-5430, '-PT1H30M30S'],
        [-86400, '-P1D'],
        [-90000, '-P1DT1H'],
        [-2 * 86400 - 60, '-P2DT1M'],
    ])('%i seconds is %s', (seconds, duration) => {
        expect(toDuration(seconds)).toBe(duration);
    });
});

describe('alarms', () => {
    it('triggers relative to the due date by default', () => {
        const value = todo({...base, due: new Date('2026-11-20T16:00:00Z')});
        value.createAlarm({trigger: 15 * 60});
        expect(alarmLines(value)).toEqual([
            'BEGIN:VALARM',
            'ACTION:DISPLAY',
            'TRIGGER;RELATED=END:-PT15M',
            'DESCRIPTION:Pay rent',
            'END:VALARM',
        ]);
    });

    it('triggers relative to the start', () => {
        const value = todo({...base, start: new Date('2026-11-20T08:00:00Z')});
        value.createAlarm({triggerAfter: 3600, relatesTo: ICalTodoAlarmRelatesTo.start, description: 'Started?'});
        expect(alarmLines(value)).toContain('TRIGGER:PT1H');
        expect(alarmLines(value)).toContain('DESCRIPTION:Started?');
    });

    it('triggers at an absolute time in UTC', () => {
        const value = todo({...base, timezone: 'Europe/Berlin'});
        value.createAlarm({trigger: new Date('2026-11-20T08:00:00Z')});
        expect(alarmLines(value)).toContain('TRIGGER;VALUE=DATE-TIME:20261120T080000Z');
    });

    it('writes repetitions and audio alarms', () => {
        const value = todo({...base, due: new Date('2026-11-20T16:00:00Z')});
        value.createAlarm({type: ICalTodoAlarmType.audio, trigger: 0, repeat: {times: 2, interval: 300}});
        expect(alarmLines(value)).toEqual([
            'BEGIN:VALARM',
            'ACTION:AUDIO',
            'TRIGGER;RELATED=END:PT0S',
            'REPEAT:2',
            'DURATION:PT5M',
            'END:VALARM',
        ]);
    });

    it('can be parsed by ical.js', () => {
        const value = todo({...base, due: new Date('2026-11-20T16:00:00Z'), alarms: [{trigger: 900}, {trigger: new Date('2026-11-19T08:00:00Z')}]});
        const [component] = parseTodos(value);
        const alarms = component?.getAllSubcomponents('valarm') ?? [];
        expect(alarms).toHaveLength(2);

        const relative = alarms[0]?.getFirstProperty('trigger');
        expect(relative?.getParameter('related')).toBe('END');
        expect(relative?.getFirstValue()?.toString()).toBe('-PT15M');
        expect(String(alarms[1]?.getFirstPropertyValue('trigger'))).toBe('2026-11-19T08:00:00Z');
    });

    it('needs a due date for alarms relative to the end', () => {
        const value = todo(base);
        value.createAlarm({trigger: 900});
        expect(() => value.toString()).toThrow('due date');
    });

    it('needs a start date for alarms relative to the start', () => {
        const value = todo({...base, due: new Date('2026-11-20T16:00:00Z')});
        value.createAlarm({trigger: 900, relatesTo: 'START'});
        expect(() => value.toString()).toThrow('start date');
    });

    it('has fluent setters and getters', () => {
        const alarm = new ICalTodoAlarm().triggerBefore(1800).relatesTo('END').description('Soon');
        expect(alarm.trigger()).toBe(1800);
        expect(alarm.relatesTo()).toBe('END');
        alarm.triggerAfter(60);
        expect(alarm.trigger()).toBe(-60);
        expect(alarm.description()).toBe('Soon');
    });

    it('accepts existing alarm objects', () => {
        const alarm = new ICalTodoAlarm({trigger: 60});
        const value = todo({...base, due: new Date('2026-11-20T16:00:00Z'), alarms: [alarm]});
        expect(value.alarms()).toEqual([alarm]);
    });

    it('validates its values', () => {
        expect(() => new ICalTodoAlarm({trigger: 1.5})).toThrow('whole number');
        expect(() => new ICalTodoAlarm({repeat: {times: 0, interval: 60}})).toThrow('repeat.times');
        expect(() => new ICalTodoAlarm({repeat: {times: 1, interval: 0}})).toThrow('repeat.interval');
        expect(() => new ICalTodoAlarm({type: 'email' as ICalTodoAlarmType})).toThrow('alarm type');
    });
});
