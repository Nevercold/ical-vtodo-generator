// RFC 5545, 3.1: lines SHOULD NOT be longer than 75 octets, excluding the line break.
const MAX_LINE_OCTETS = 75;

// Control characters are not allowed in TEXT values (RFC 5545, 3.3.11), except HTAB.
// Line breaks are handled separately because they have an escape sequence.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function escapeText(value: string): string {
    return value
        .replace(CONTROL_CHARS, '')
        .replace(/[\\;,]/g, (match) => '\\' + match)
        .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Builds a property parameter value. Values containing `:`, `;` or `,`
 * are quoted, DQUOTE and control characters cannot be represented.
 */
export function parameterValue(value: string): string {
    if (/["\u0000-\u0008\u000A-\u001F\u007F]/.test(value)) {
        throw new Error(`Invalid parameter value ${JSON.stringify(value)}`);
    }
    return /[:;,]/.test(value) ? `"${value}"` : value;
}

function utf8Length(codePoint: number): number {
    if (codePoint < 0x80) return 1;
    if (codePoint < 0x800) return 2;
    if (codePoint < 0x10000) return 3;
    return 4;
}

/**
 * Folds a single content line so that no physical line exceeds 75 octets.
 * Continuation lines start with a space, which counts towards the limit.
 * Lines are only split between code points, never inside a UTF-8 sequence.
 */
export function foldLine(line: string): string {
    let result = '';
    let octets = 0;

    for (const char of line) {
        const size = utf8Length(char.codePointAt(0) ?? 0);
        if (octets + size > MAX_LINE_OCTETS) {
            result += '\r\n ';
            octets = 1;
        }
        result += char;
        octets += size;
    }

    return result;
}

export function foldLines(lines: readonly string[]): string {
    return lines.map((line) => foldLine(line) + '\r\n').join('');
}

/**
 * Splits iCalendar data into logical content lines. Accepts CRLF as well as
 * bare LF line breaks, as produced by some generators.
 */
export function unfoldLines(data: string): string[] {
    return data
        .replace(/\r?\n[ \t]/g, '')
        .split(/\r?\n/)
        .filter((line) => line.length > 0);
}
