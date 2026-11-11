import {foldLines, unfoldLines} from './text.ts';
import type {ICalTodo} from './todo.ts';

export interface ICalTodoInsertOptions {
    /**
     * Returns the VTIMEZONE component for a time zone, or `null`. Pass the
     * same function as `timezone.generator` of ical-generator, so that time
     * zones only used by to-dos get a VTIMEZONE as well.
     */
    timezoneGenerator?: (timezone: string) => string | null;
}

interface CalendarLayout {
    /** TZIDs of the VTIMEZONE components already in the calendar. */
    timezones: Set<string>;
    /** Where new VTIMEZONE components go: before the first other component. */
    timezoneIndex: number;
    /** Where new VTODO components go: after the last component. */
    componentIndex: number;
}

function analyze(lines: string[]): CalendarLayout {
    const first = lines[0]?.toUpperCase();
    const last = lines[lines.length - 1]?.toUpperCase();
    const calendars = lines.filter((line) => line.toUpperCase() === 'BEGIN:VCALENDAR').length;
    if (first !== 'BEGIN:VCALENDAR' || last !== 'END:VCALENDAR' || calendars !== 1) {
        throw new Error('Expected exactly one VCALENDAR');
    }

    const timezones = new Set<string>();
    const end = lines.length - 1;
    let timezoneIndex = -1;
    let componentIndex = -1;
    let depth = 0;
    let inTimezone = false;

    lines.forEach((line, index) => {
        const upper = line.toUpperCase();
        if (upper.startsWith('BEGIN:')) {
            depth++;
            if (depth === 2) {
                inTimezone = upper === 'BEGIN:VTIMEZONE';
                if (!inTimezone && timezoneIndex === -1) {
                    timezoneIndex = index;
                }
            }
        } else if (upper.startsWith('END:')) {
            if (depth === 2) {
                componentIndex = index + 1;
                inTimezone = false;
            }
            depth--;
        } else if (inTimezone && depth === 2 && upper.startsWith('TZID')) {
            timezones.add(line.slice(line.indexOf(':') + 1));
        }
    });

    if (componentIndex === -1) {
        componentIndex = end;
    }
    // Without other components, time zones go right before the new to-dos.
    return {timezones, timezoneIndex: timezoneIndex === -1 ? componentIndex : timezoneIndex, componentIndex};
}

/**
 * Adds to-dos to a calendar and returns the complete iCalendar data.
 *
 * `calendar` is an `ICalCalendar` of ical-generator or any iCalendar text
 * with a single VCALENDAR. VTIMEZONE components that are already in the
 * calendar are not added again.
 */
export function insertTodos(
    calendar: string | {toString(): string},
    todos: Iterable<ICalTodo>,
    options: ICalTodoInsertOptions = {},
): string {
    const lines = unfoldLines(typeof calendar === 'string' ? calendar : calendar.toString());
    const layout = analyze(lines);

    const timezoneLines: string[] = [];
    const todoLines: string[] = [];

    for (const todo of todos) {
        todoLines.push(...todo.toLines());

        const timezone = todo.usedTimezone();
        // Globally unique TZIDs (leading slash) do not need a VTIMEZONE.
        if (!timezone || timezone.startsWith('/') || layout.timezones.has(timezone) || !options.timezoneGenerator) {
            continue;
        }
        layout.timezones.add(timezone);

        const component = options.timezoneGenerator(timezone);
        if (component) {
            timezoneLines.push(...unfoldLines(component));
        }
    }

    // Insert the later position first so the earlier index stays valid.
    lines.splice(layout.componentIndex, 0, ...todoLines);
    lines.splice(layout.timezoneIndex, 0, ...timezoneLines);
    return foldLines(lines);
}
