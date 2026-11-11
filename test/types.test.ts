import {
    ICalAlarmRelatesTo,
    ICalAttendeeStatus,
    type ICalDateTimeValue,
    ICalEventRepeatingFreq,
    ICalWeekday,
} from 'ical-generator';
import {describe, expect, it} from 'vitest';
import {type ICalTodoDateValue, type ICalTodoStatus, todo} from '../src/index.ts';

// These are compile time checks: values from ical-generator can be passed as they are.
describe('compatibility with ical-generator types', () => {
    it('accepts its date values and enums', () => {
        const value: ICalDateTimeValue = new Date('2026-11-20T08:00:00Z');
        const date: ICalTodoDateValue = value;
        const status: ICalTodoStatus = ICalAttendeeStatus.NEEDSACTION;

        const result = todo({
            start: date,
            due: value,
            status,
            repeating: {freq: ICalEventRepeatingFreq.WEEKLY, byDay: [ICalWeekday.MO, ICalWeekday.FR]},
            alarms: [{trigger: 600, relatesTo: ICalAlarmRelatesTo.end}],
        });
        expect(result.toString()).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,FR');
    });
});
