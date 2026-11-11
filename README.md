# ical-vtodo-generator

To-dos (`VTODO`, [RFC 5545, 3.6.2](https://www.rfc-editor.org/rfc/rfc5545#section-3.6.2)) for calendars built with
[ical-generator](https://github.com/sebbo2002/ical-generator), which only supports events.

- API in the style of ical-generator: `todo({...})` and fluent getters/setters
- Repeating to-dos (RRULE, EXDATE) and overrides of single occurrences (RECURRENCE-ID)
- Alarms relative to the due date or start, or at a fixed time
- Time zones with TZID, all-day and floating dates
- TEXT escaping, line folding at 75 octets without splitting UTF-8 characters, CRLF
- No runtime dependencies, written in TypeScript

```sh
npm install ical-vtodo-generator
```

## Usage

```ts
import ical from 'ical-generator';
import {insertTodos, todo} from 'ical-vtodo-generator';

const calendar = ical({name: 'My calendar'});
calendar.createEvent({start: new Date(), summary: 'Meeting'});

const todos = [
    todo({
        id: 'report-2026-11',
        summary: 'Write monthly report',
        due: new Date('2026-11-30T16:00:00Z'),
        timezone: 'Europe/Berlin',
        priority: 1,
        alarms: [{trigger: 15 * 60}], // 15 minutes before DUE
    }),
];

const ics = insertTodos(calendar, todos);
```

`insertTodos()` returns the complete calendar with the to-dos after the last component of the calendar.
It takes an `ICalCalendar` or any iCalendar text containing a single `VCALENDAR`.

### Why a separate function?

ical-generator has no extension point for other component types: `ICalCalendar.toString()` writes
the events, the custom properties and `END:VCALENDAR` in one go and folds the result. Subclassing the
calendar would depend on its private fields, so this library works on the output instead. It unfolds the
calendar, inserts the to-dos and folds it again. This works with every version of ical-generator and with
calendars from other sources.

## Time zones

Dates are written in UTC unless the to-do has a `timezone`, in which case `DTSTART`, `DUE`,
`RECURRENCE-ID` and `EXDATE` are written as local time with `TZID`:

```ts
todo({due: new Date('2026-11-20T16:00:00Z'), timezone: 'Europe/Berlin'});
// DUE;TZID=Europe/Berlin:20261120T170000
```

A `Date` is converted to the given time zone, so the result does not depend on the time zone of the server.
ical-generator behaves differently here: for events it writes the local time of the Node.js process together
with the `TZID`. Do not shift dates to the target zone before passing them to `todo()`.

Clients need a `VTIMEZONE` for every `TZID`. If you use a timezone generator with ical-generator, pass the
same function to `insertTodos()`. VTIMEZONEs that the calendar already contains for its events are not
added again:

```ts
import {tzlib_get_ical_block} from 'timezones-ical-library';

const generator = (tz: string) => tzlib_get_ical_block(tz)[0];
const calendar = ical({timezone: {name: null, generator}});

insertTodos(calendar, todos, {timezoneGenerator: generator});
```

All-day to-dos use `DATE` values. With a `timezone`, the calendar date in that zone is used:

```ts
todo({allDay: true, due: '2026-11-20'});
// DUE;VALUE=DATE:20261120
```

`floating: true` writes local time without `TZID` and without `Z`.

Dates can be `Date` objects, ISO strings, dayjs, moment, Luxon and Temporal objects, so the same values
as in ical-generator. Strings like `2026-11-20` are taken as calendar dates.

## Repeating to-dos

```ts
todo({
    id: 'weekly-report',
    summary: 'Weekly report',
    start: new Date('2026-11-16T08:00:00Z'), // required for repeating to-dos
    due: new Date('2026-11-16T16:00:00Z'),
    timezone: 'Europe/Berlin',
    repeating: {
        freq: 'WEEKLY', // DAILY, WEEKLY, MONTHLY or YEARLY
        interval: 1,
        byDay: ['MO'], // or with an ordinal for monthly rules: ['-1FR']
        until: new Date('2026-12-31T23:00:00Z'), // or count: 10
        exclude: [new Date('2026-11-30T08:00:00Z')], // EXDATE
    },
});
```

The rule can also be given as text: `repeating: 'FREQ=MONTHLY;BYMONTHDAY=1,15'`.

`UNTIL` follows `DTSTART` as RFC 5545 requires: UTC for to-dos with a time zone, `DATE` for all-day to-dos.

### Completing a single occurrence

A changed occurrence is a separate to-do with the same `id` and a `recurrenceId` that matches the original
start of the occurrence:

```ts
import {ICalTodoStatus, insertTodos, todo} from 'ical-vtodo-generator';

const series = todo({id: 'weekly-report', start, due, timezone, repeating: {freq: 'WEEKLY'}});
const done = todo({
    id: 'weekly-report',
    recurrenceId: new Date('2026-11-23T08:00:00Z'),
    start: new Date('2026-11-23T08:00:00Z'),
    due: new Date('2026-11-23T16:00:00Z'),
    timezone,
    status: ICalTodoStatus.COMPLETED,
    completed: new Date(),
    percentComplete: 100,
});

insertTodos(calendar, [series, done]);
```

## Alarms

```ts
const item = todo({start, due});

item.createAlarm({trigger: 15 * 60});                     // TRIGGER;RELATED=END:-PT15M
item.createAlarm({triggerBefore: 3600, relatesTo: 'START'}); // TRIGGER:-PT1H
item.createAlarm({triggerAfter: 600});                    // TRIGGER;RELATED=END:PT10M
item.createAlarm({trigger: new Date('2026-11-20T07:00:00Z')}); // TRIGGER;VALUE=DATE-TIME:20261120T070000Z
item.createAlarm({type: 'audio', trigger: 0, repeat: {times: 2, interval: 300}});
```

Relative alarms refer to `DUE` by default. Display alarms use the summary of the to-do as description
unless `description` is set.

## API

### `todo(data?)` / `new ICalTodo(data?)`

| Option            | Property           | Notes                                                          |
|-------------------|--------------------|----------------------------------------------------------------|
| `id`              | `UID`              | Random UUID if not set                                         |
| `stamp`           | `DTSTAMP`          | Time of creation if not set                                    |
| `summary`         | `SUMMARY`          |                                                                |
| `description`     | `DESCRIPTION`      |                                                                |
| `start`           | `DTSTART`          | Required for repeating to-dos                                  |
| `due`             | `DUE`              | Must not be before `start`                                     |
| `allDay`          |                    | Dates as `DATE`                                                |
| `timezone`        |                    | `TZID` of the dates                                            |
| `floating`        |                    | Local time without `TZID`                                      |
| `priority`        | `PRIORITY`         | 0 (undefined), 1 (highest) to 9 (lowest)                       |
| `status`          | `STATUS`           | `ICalTodoStatus`: `NEEDS-ACTION`, `COMPLETED`, `IN-PROCESS`, `CANCELLED` |
| `completed`       | `COMPLETED`        | Always UTC                                                     |
| `percentComplete` | `PERCENT-COMPLETE` | 0 to 100                                                       |
| `sequence`        | `SEQUENCE`         |                                                                |
| `created`         | `CREATED`          | Always UTC                                                     |
| `lastModified`    | `LAST-MODIFIED`    | Always UTC                                                     |
| `categories`      | `CATEGORIES`       | Strings or `{name}` objects                                    |
| `url`             | `URL`              |                                                                |
| `recurrenceId`    | `RECURRENCE-ID`    |                                                                |
| `repeating`       | `RRULE`, `EXDATE`  | Options or RRULE text                                          |
| `alarms`          | `VALARM`           | See `createAlarm()`                                            |
| `x`               | `X-*`              | `{'X-KEY': 'value'}`, `[['X-KEY', 'value']]` or `[{key, value}]` |

Every option has a method with the same name that returns the value without an argument and sets it
(returning the to-do) with one: `item.summary('Call back').priority(1)`.

`toString()` returns the folded `VTODO` component.

Invalid values throw an `Error` when they are set. Checks that involve several properties (due date
before start, repeating without start, relative alarm without the date it refers to) throw in `toString()`
and `insertTodos()`.

### `insertTodos(calendar, todos, options?)`

| Option              | Notes                                                     |
|---------------------|-----------------------------------------------------------|
| `timezoneGenerator` | `(tz: string) => string \| null`, returns the `VTIMEZONE` |

## Client support

To-dos in **subscribed** calendars (ICS feeds) are not shown by every client:

| Client                  | VTODO in subscribed calendars |
|-------------------------|-------------------------------|
| Thunderbird             | Yes                           |
| Google Calendar         | No, ignored                   |
| Outlook                 | No, ignored                   |
| Apple Calendar          | No, ignored                   |

If these clients matter, also offer the to-dos as all-day events.

## License

MIT
