import {describe, expect, it} from 'vitest';
import {ICalTodo, ICalTodoStatus, todo} from '../src/index.ts';
import {lines, parseTodos} from './helpers.ts';

const stamp = new Date('2026-11-11T12:00:00Z');

describe('ICalTodo', () => {
    it('writes UID and DTSTAMP', () => {
        const result = lines(todo({id: 'todo-1', stamp}));
        expect(result).toEqual(['BEGIN:VTODO', 'UID:todo-1', 'DTSTAMP:20261111T120000Z', 'END:VTODO']);
    });

    it('creates a UUID and a stamp by default', () => {
        const value = todo();
        expect(value.id()).toMatch(/^[0-9a-f-]{36}$/);
        expect(value.stamp()).toBeInstanceOf(Date);
    });

    it('accepts numeric ids', () => {
        expect(todo({id: 42}).id()).toBe('42');
    });

    it('writes every property', () => {
        const value = todo({
            id: 'todo-1',
            stamp,
            summary: 'Write report',
            description: 'Sections: intro, results; outlook\nsecond line',
            start: new Date('2026-11-12T08:00:00Z'),
            due: new Date('2026-11-20T16:00:00Z'),
            priority: 1,
            status: ICalTodoStatus.INPROCESS,
            percentComplete: 40,
            sequence: 3,
            created: new Date('2026-11-01T10:00:00Z'),
            lastModified: new Date('2026-11-10T10:00:00Z'),
            categories: ['Work', {name: 'Reports, Q4'}],
            url: 'https://example.com/todos/1?view=full',
            x: {'X-SOURCE': 'tests'},
        });

        expect(lines(value)).toEqual([
            'BEGIN:VTODO',
            'UID:todo-1',
            'SEQUENCE:3',
            'DTSTAMP:20261111T120000Z',
            'DTSTART:20261112T080000Z',
            'DUE:20261120T160000Z',
            'SUMMARY:Write report',
            'DESCRIPTION:Sections: intro\\, results\\; outlook\\nsecond line',
            'URL:https://example.com/todos/1?view=full',
            'PRIORITY:1',
            'STATUS:IN-PROCESS',
            'PERCENT-COMPLETE:40',
            'CATEGORIES:Work,Reports\\, Q4',
            'CREATED:20261101T100000Z',
            'LAST-MODIFIED:20261110T100000Z',
            'X-SOURCE:tests',
            'END:VTODO',
        ]);
    });

    it('can be parsed by ical.js', () => {
        const [component] = parseTodos(todo({
            id: 'todo-1',
            stamp,
            summary: 'Groceries; milk, eggs \\ butter',
            description: 'Ümläute und Emoji 🛒\nzweite Zeile'.repeat(5),
            due: new Date('2026-11-20T16:00:00Z'),
            priority: 5,
            categories: ['Home', 'Shopping, weekly'],
        }));

        expect(component?.getFirstPropertyValue('uid')).toBe('todo-1');
        expect(component?.getFirstPropertyValue('summary')).toBe('Groceries; milk, eggs \\ butter');
        expect(component?.getFirstPropertyValue('description')).toBe('Ümläute und Emoji 🛒\nzweite Zeile'.repeat(5));
        expect(component?.getFirstPropertyValue('priority')).toBe(5);
        expect(component?.getFirstProperty('categories')?.getValues()).toEqual(['Home', 'Shopping, weekly']);
        expect(String(component?.getFirstPropertyValue('due'))).toBe('2026-11-20T16:00:00Z');
    });

    it('has fluent setters and getters', () => {
        const value = new ICalTodo()
            .id('todo-2')
            .summary('Call back')
            .priority(9)
            .status(ICalTodoStatus.NEEDSACTION)
            .percentComplete(0);

        expect(value.id()).toBe('todo-2');
        expect(value.summary()).toBe('Call back');
        expect(value.priority()).toBe(9);
        expect(value.status()).toBe('NEEDS-ACTION');
        expect(value.percentComplete()).toBe(0);

        value.summary(null).priority(null);
        expect(lines(value)).not.toContain('SUMMARY:Call back');
        expect(lines(value).some((line) => line.startsWith('PRIORITY'))).toBe(false);
    });

    it('writes a completed to-do', () => {
        const [component] = parseTodos(todo({
            id: 'todo-1',
            stamp,
            status: ICalTodoStatus.COMPLETED,
            completed: new Date('2026-11-15T09:30:00Z'),
            percentComplete: 100,
        }));
        expect(component?.getFirstPropertyValue('status')).toBe('COMPLETED');
        expect(String(component?.getFirstPropertyValue('completed'))).toBe('2026-11-15T09:30:00Z');
        expect(component?.getFirstPropertyValue('percent-complete')).toBe(100);
    });

    it('writes COMPLETED, CREATED and LAST-MODIFIED in UTC even with a time zone', () => {
        const result = lines(todo({
            id: 'todo-1',
            stamp,
            timezone: 'Europe/Berlin',
            completed: new Date('2026-11-15T09:30:00Z'),
            created: new Date('2026-11-01T10:00:00Z'),
        }));
        expect(result).toContain('COMPLETED:20261115T093000Z');
        expect(result).toContain('CREATED:20261101T100000Z');
    });

    it('validates numeric ranges', () => {
        expect(() => todo({priority: 10})).toThrow('priority');
        expect(() => todo({priority: -1})).toThrow('priority');
        expect(() => todo({priority: 1.5})).toThrow('priority');
        expect(() => todo({percentComplete: 101})).toThrow('percentComplete');
        expect(() => todo({sequence: -1})).toThrow('sequence');
        expect(() => todo({priority: 0, percentComplete: 100, sequence: 0})).not.toThrow();
    });

    it('validates status, url, id and X-properties', () => {
        expect(() => todo({status: 'DONE' as ICalTodoStatus})).toThrow('status');
        expect(() => todo({url: 'https://example.com/a b'})).toThrow('url');
        expect(() => todo({id: ''})).toThrow('id');
        expect(() => todo({x: {SOURCE: 'tests'}})).toThrow('X-');
    });

    it('accepts X-properties in all forms', () => {
        const value = todo({id: 'a', stamp, x: [['X-A', '1']]})
            .x([{key: 'X-B', value: '2'}])
            .x('X-C', 'with; special, chars');
        expect(value.x()).toEqual([['X-A', '1'], ['X-B', '2'], ['X-C', 'with; special, chars']]);
        expect(lines(value)).toContain('X-C:with\\; special\\, chars');
    });

    it('rejects a due date before the start', () => {
        const value = todo({start: new Date('2026-11-20T10:00:00Z'), due: new Date('2026-11-19T10:00:00Z')});
        expect(() => value.toString()).toThrow('before its start');
    });

    it('rejects invalid dates when they are set', () => {
        expect(() => todo({due: 'tomorrow'})).toThrow('Invalid date');
    });

    it('folds long lines in toString()', () => {
        const output = todo({id: 'a', stamp, description: 'Lorem ipsum dolor sit amet. '.repeat(10)}).toString();
        expect(output).toMatch(/\r\n /);
        expect(output.endsWith('END:VTODO\r\n')).toBe(true);
    });
});

describe('dates', () => {
    it('writes all-day dates as DATE', () => {
        const value = todo({id: 'a', stamp, allDay: true, start: '2026-11-18', due: '2026-11-20'});
        expect(lines(value)).toContain('DTSTART;VALUE=DATE:20261118');
        expect(lines(value)).toContain('DUE;VALUE=DATE:20261120');

        const [component] = parseTodos(value);
        const due = component?.getFirstPropertyValue('due');
        expect(due instanceof Object && 'isDate' in due && due.isDate).toBe(true);
    });

    it('allows start and due on the same day for all-day to-dos', () => {
        expect(() => todo({allDay: true, start: '2026-11-20', due: '2026-11-20'}).toString()).not.toThrow();
    });

    it('takes the calendar date in the time zone for all-day Date values', () => {
        const value = todo({id: 'a', stamp, allDay: true, timezone: 'Europe/Berlin', due: new Date('2026-11-19T23:30:00Z')});
        expect(lines(value)).toContain('DUE;VALUE=DATE:20261120');
        expect(value.usedTimezone()).toBeNull();
    });

    it('writes dates with a time zone as TZID and local time', () => {
        const value = todo({
            id: 'a',
            stamp,
            timezone: 'Europe/Berlin',
            start: new Date('2026-07-01T06:00:00Z'),
            due: new Date('2026-11-20T16:00:00Z'),
        });
        expect(lines(value)).toContain('DTSTART;TZID=Europe/Berlin:20260701T080000');
        expect(lines(value)).toContain('DUE;TZID=Europe/Berlin:20261120T170000');
        expect(value.usedTimezone()).toBe('Europe/Berlin');
    });

    it('writes floating dates without TZID and Z', () => {
        const value = todo({id: 'a', stamp, floating: true, timezone: 'Europe/Berlin', due: '2026-11-20T17:00:00Z'});
        expect(lines(value)).toContain('DUE:20261120T170000');
        expect(value.usedTimezone()).toBeNull();
    });

    it('rejects unknown time zones', () => {
        expect(() => todo({timezone: 'Europe/Atlantis'})).toThrow('Unknown time zone');
    });
});
