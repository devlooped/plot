// Inline data: CSV/TSV parsing, value typing and ISO 8601 date coercion.

/**
 * An ISO 8601 date or date-time with at least a year and a month:
 * YYYY-MM, YYYY-MM-DD, YYYY-MM-DDTHH:MM, …:SS, …:SS.sss, with Z or ±HH:MM.
 * A six-digit year may carry a sign (+YYYYYY or -YYYYYY).
 */
const ISO_DATE = /^([+-]\d{6}|\d{4})-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?)?)?$/;

/** Parses an ISO 8601 string as a Date; a time without an offset is UTC. Returns undefined if it is not one. */
export function parseIsoDate(value: string): Date | undefined {
  const m = ISO_DATE.exec(value);
  if (!m) return undefined;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = m[3] === undefined ? 1 : Number(m[3]);
  const hours = m[4] === undefined ? 0 : Number(m[4]);
  const minutes = m[5] === undefined ? 0 : Number(m[5]);
  const seconds = m[6] === undefined ? 0 : Number(m[6]);
  const ms = m[7] === undefined ? 0 : Number(m[7].slice(0, 3).padEnd(3, "0"));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hours > 24 || minutes > 59 || seconds > 59) return undefined;
  if (hours === 24 && (minutes || seconds || ms)) return undefined;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hours, minutes, seconds, ms);
  if (date.getUTCDate() !== day && hours !== 24) return undefined; // e.g. 2023-02-30
  const zone = m[8];
  if (zone && zone !== "Z") {
    const sign = zone[0] === "-" ? -1 : 1;
    const digits = zone.slice(1).replace(":", "");
    const offset = Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2));
    date.setTime(date.getTime() - sign * offset * 60_000);
  }
  return date;
}

/** Whether every non-null value is an ISO 8601 date string, and there is at least one. */
function allIsoDates(values: Iterable<unknown>): boolean {
  let any = false;
  for (const value of values) {
    if (value == null) continue;
    if (typeof value !== "string" || !ISO_DATE.test(value) || parseIsoDate(value) === undefined) return false;
    any = true;
  }
  return any;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/**
 * Applies the date rule to an array of values (a channel, a domain, mark data
 * of primitives): when every non-null value is an ISO 8601 string, returns a
 * new array of Dates; otherwise returns the array as is.
 */
export function coerceArray<T>(values: readonly T[]): (T | Date)[] {
  if (!allIsoDates(values)) return values as T[];
  return values.map((v) => (typeof v === "string" ? parseIsoDate(v)! : v));
}

/**
 * Applies the date rule to rows: each column (field of object rows, index of
 * array rows) made only of ISO 8601 strings becomes Dates, and an array of
 * primitive values made only of them too. Returns new rows when anything
 * changes; the input is never modified.
 */
export function coerceRows(rows: readonly unknown[]): unknown[] {
  if (rows.length === 0) return rows as unknown[];
  if (rows.every((row) => row == null || !(typeof row === "object"))) return coerceArray(rows);
  const objectFields = new Set<string>();
  let maxLength = 0;
  for (const row of rows) {
    if (Array.isArray(row)) maxLength = Math.max(maxLength, row.length);
    else if (isPlainObject(row)) for (const key of Object.keys(row)) objectFields.add(key);
  }
  const dateFields = [...objectFields].filter((field) => allIsoDates(columnValues(rows, (row) => (isPlainObject(row) ? row[field] : undefined))));
  const dateIndexes: number[] = [];
  for (let i = 0; i < maxLength; i++) if (allIsoDates(columnValues(rows, (row) => (Array.isArray(row) ? row[i] : undefined)))) dateIndexes.push(i);
  if (dateFields.length === 0 && dateIndexes.length === 0) return rows as unknown[];
  return rows.map((row) => {
    if (isPlainObject(row) && dateFields.length) {
      const copy: Record<string, unknown> = {...row};
      for (const field of dateFields) if (typeof copy[field] === "string") copy[field] = parseIsoDate(copy[field] as string);
      return copy;
    }
    if (Array.isArray(row) && dateIndexes.length) {
      const copy = row.slice();
      for (const i of dateIndexes) if (typeof copy[i] === "string") copy[i] = parseIsoDate(copy[i] as string);
      return copy;
    }
    return row;
  });
}

function* columnValues(rows: readonly unknown[], get: (row: unknown) => unknown): Generator<unknown> {
  for (const row of rows) yield get(row);
}

const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

/** Types a CSV/TSV cell: empty → null, true/false → boolean, decimal numbers → number, otherwise the text. */
export function typeCell(text: string): string | number | boolean | null {
  const value = text.trim();
  if (value === "") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (NUMBER.test(value)) return Number(value);
  return text;
}

export class DelimitedError extends Error {
  constructor(
    message: string,
    readonly row: number
  ) {
    super(message);
  }
}

/**
 * Parses delimiter-separated text with a header row (RFC 4180 quoting) into
 * typed object rows, then applies the date rule. Throws DelimitedError past maxRows.
 */
export function parseDelimited(text: string, delimiter: "," | "\t", maxRows: number): Record<string, unknown>[] {
  const records = splitRecords(text, delimiter, maxRows + 1);
  if (records.length === 0) return [];
  const header = records[0]!.map((name) => name.trim());
  const seen = new Set<string>();
  for (const name of header) {
    if (name === "__proto__" || name === "constructor" || name === "prototype") throw new DelimitedError(`column name "${name}" is not allowed`, 0);
    if (seen.has(name)) throw new DelimitedError(`column "${name}" appears twice in the header`, 0);
    seen.add(name);
  }
  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r < records.length; r++) {
    const record = records[r]!;
    if (record.length === 1 && record[0] === "") continue; // blank line
    const row: Record<string, unknown> = {};
    for (let c = 0; c < header.length; c++) row[header[c]!] = typeCell(record[c] ?? "");
    rows.push(row);
  }
  return coerceRows(rows) as Record<string, unknown>[];
}

function splitRecords(text: string, delimiter: string, maxRecords: number): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let i = 0;
  const n = text.length;
  let quoted = false;
  let atFieldStart = true;
  while (i < n) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
      i++;
      continue;
    }
    if (c === delimiter) {
      record.push(field);
      field = "";
      atFieldStart = true;
      i++;
      continue;
    }
    if (c === "\n" || c === "\r") {
      record.push(field);
      records.push(record);
      if (records.length > maxRecords) throw new DelimitedError(`more than ${maxRecords - 1} rows`, records.length - 1);
      record = [];
      field = "";
      atFieldStart = true;
      i += c === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += c;
    atFieldStart = false;
    i++;
  }
  if (quoted) throw new DelimitedError("a quoted field is not closed", records.length);
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  if (records.length > maxRecords) throw new DelimitedError(`more than ${maxRecords - 1} rows`, records.length - 1);
  return records;
}
