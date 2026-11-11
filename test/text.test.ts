import {describe, expect, it} from 'vitest';
import {escapeText, foldLine, foldLines, parameterValue, unfoldLines} from '../src/text.ts';

const octets = (value: string): number => Buffer.byteLength(value, 'utf8');

describe('escapeText', () => {
    it('escapes backslash, semicolon and comma', () => {
        expect(escapeText('a\\b;c,d')).toBe('a\\\\b\\;c\\,d');
    });

    it('escapes the backslash before the other characters', () => {
        expect(escapeText('\\;')).toBe('\\\\\\;');
    });

    it('turns every kind of line break into \\n', () => {
        expect(escapeText('a\r\nb\nc\rd')).toBe('a\\nb\\nc\\nd');
    });

    it('keeps colons, quotes and tabs', () => {
        expect(escapeText('Time: "10:00"\tsharp')).toBe('Time: "10:00"\tsharp');
    });

    it('drops control characters', () => {
        expect(escapeText('a\u0000b\u0007c\u007Fd')).toBe('abcd');
    });

    it('keeps non-ASCII characters', () => {
        expect(escapeText('Grüße 🎉')).toBe('Grüße 🎉');
    });
});

describe('parameterValue', () => {
    it('leaves simple values unquoted', () => {
        expect(parameterValue('Europe/Berlin')).toBe('Europe/Berlin');
    });

    it('quotes values with colon, semicolon or comma', () => {
        expect(parameterValue('a:b')).toBe('"a:b"');
        expect(parameterValue('a;b')).toBe('"a;b"');
        expect(parameterValue('a,b')).toBe('"a,b"');
    });

    it('rejects double quotes and line breaks', () => {
        expect(() => parameterValue('a"b')).toThrow();
        expect(() => parameterValue('a\nb')).toThrow();
    });
});

describe('foldLine', () => {
    it('does not touch a line of exactly 75 octets', () => {
        const line = 'X'.repeat(75);
        expect(foldLine(line)).toBe(line);
    });

    it('folds a line of 76 octets', () => {
        expect(foldLine('X'.repeat(76))).toBe('X'.repeat(75) + '\r\n X');
    });

    it('counts the leading space of continuation lines', () => {
        const folded = foldLine('X'.repeat(300));
        for (const line of folded.split('\r\n')) {
            expect(octets(line)).toBeLessThanOrEqual(75);
        }
        expect(folded.split('\r\n')[1]).toBe(' ' + 'X'.repeat(74));
    });

    it('does not split an umlaut at the 75 octet boundary', () => {
        // 74 ASCII octets + "ü" (2 octets) would be 76 octets
        const folded = foldLine('X'.repeat(74) + 'ü' + 'Y');
        expect(folded).toBe('X'.repeat(74) + '\r\n üY');
    });

    it('keeps an umlaut that ends exactly on the boundary', () => {
        const folded = foldLine('X'.repeat(73) + 'ü' + 'Y');
        expect(folded).toBe('X'.repeat(73) + 'ü\r\n Y');
    });

    it('does not split an emoji at the 75 octet boundary', () => {
        for (let prefix = 70; prefix <= 75; prefix++) {
            const line = 'X'.repeat(prefix) + '😀😀';
            const folded = foldLine(line);
            const physical = folded.split('\r\n');
            for (const part of physical) {
                expect(octets(part)).toBeLessThanOrEqual(75);
                expect(part).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
            }
            expect(unfoldLines(folded)).toEqual([line]);
        }
    });

    it('folds long multibyte text into valid UTF-8 chunks', () => {
        const line = 'DESCRIPTION:' + 'Äpfel, Öl & Übermut 🍎🫒 '.repeat(20);
        const folded = foldLine(line);
        const bytes = Buffer.from(folded, 'utf8');
        expect(bytes.toString('utf8')).toBe(folded);
        for (const part of folded.split('\r\n')) {
            expect(octets(part)).toBeLessThanOrEqual(75);
        }
        expect(unfoldLines(folded)).toEqual([line]);
    });
});

describe('foldLines', () => {
    it('ends every line with CRLF', () => {
        expect(foldLines(['A:1', 'B:2'])).toBe('A:1\r\nB:2\r\n');
    });
});

describe('unfoldLines', () => {
    it('joins continuation lines starting with space or tab', () => {
        expect(unfoldLines('A:12\r\n 34\r\n\t56\r\nB:7\r\n')).toEqual(['A:123456', 'B:7']);
    });

    it('accepts bare LF line breaks', () => {
        expect(unfoldLines('A:1\n 2\nB:3\n')).toEqual(['A:12', 'B:3']);
    });
});
