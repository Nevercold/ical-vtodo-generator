import {escapeText} from './text.ts';

/** Custom X-properties, in any of the forms ical-generator accepts. */
export type ICalTodoXData =
    | [string, string][]
    | Record<string, string>
    | {key: string; value: string}[];

const X_NAME = /^X-[A-Za-z0-9-]+$/;

export function normalizeX(data: ICalTodoXData): [string, string][] {
    const entries: [string, string][] = Array.isArray(data)
        ? data.map((entry) => (Array.isArray(entry) ? entry : [entry.key, entry.value]))
        : Object.entries(data);

    for (const [key] of entries) {
        if (!X_NAME.test(key)) {
            throw new Error(`Invalid X-property name "${key}", it must start with "X-"`);
        }
    }
    return entries;
}

export function xLines(entries: readonly [string, string][]): string[] {
    return entries.map(([key, value]) => `${key.toUpperCase()}:${escapeText(value)}`);
}
