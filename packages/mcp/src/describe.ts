// A one-paragraph, plain-text account of a validated block, for the model.

interface MarkLike {
  mark?: unknown;
}

/** Summarizes a parsed block: its title, its marks and the size of its datasets. */
export function describePlot(spec: Record<string, unknown>): string {
  const parts: string[] = [];
  const title = typeof spec.title === "string" ? spec.title : undefined;
  const marks = Array.isArray(spec.marks) ? (spec.marks as MarkLike[]) : [];
  const names = marks.map((m) => (typeof m?.mark === "string" ? m.mark : "?"));
  parts.push(title ? `Chart "${title}"` : "Chart");
  parts.push(`with ${marks.length} mark${marks.length === 1 ? "" : "s"}${names.length ? ` (${names.join(", ")})` : ""}`);
  const data = spec.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const sets = Object.entries(data as Record<string, unknown>).map(([name, value]) => {
      const rows = countRows(value);
      return rows === undefined ? name : `${name}: ${rows} rows`;
    });
    if (sets.length) parts.push(`and data ${sets.join(", ")}`);
  }
  return parts.join(" ") + ".";
}

function countRows(value: unknown): number | undefined {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") {
    const text = (value as {csv?: unknown; tsv?: unknown}).csv ?? (value as {tsv?: unknown}).tsv;
    if (typeof text === "string") return Math.max(0, text.split(/\r?\n/).filter((l) => l.trim() !== "").length - 1);
  }
  return undefined;
}
