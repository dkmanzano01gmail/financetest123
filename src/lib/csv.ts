export type CsvRow = Record<string, string>;
import { parseLocaleAmount } from "./format";

/**
 * Decode an ArrayBuffer as UTF-8 (strict). Falls back to Windows-1252 when
 * invalid UTF-8 sequences are found, which is Nubank's common export encoding.
 */
export function decodeCsvBuffer(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    try { return new TextDecoder("windows-1252").decode(buf); }
    catch { return new TextDecoder("latin1").decode(buf); }
  }
}

/** Count occurrences of a character outside double-quoted fields. */
function unquotedCount(line: string, ch: string): number {
  let n = 0, inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { i++; continue; }
      inQ = !inQ;
    } else if (!inQ && c === ch) n++;
  }
  return n;
}

export function parseCsv(text: string): { headers: string[]; rows: CsvRow[]; delimiter: string } {
  // Strip BOM
  text = text.replace(/^\uFEFF/, "");
  // Detect delimiter using several sample lines, counting unquoted occurrences.
  const sample = text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 5);
  const candidates = [",", ";", "\t", "|"];
  let delimiter = ",";
  let bestScore = -1;
  for (const d of candidates) {
    const counts = sample.map((l) => unquotedCount(l, d));
    if (counts.length === 0) continue;
    const min = Math.min(...counts);
    const sum = counts.reduce((a, b) => a + b, 0);
    // Prefer delimiters that appear on every line and total the most.
    const score = min > 0 ? sum + min * 10 : sum;
    if (score > bestScore) { bestScore = score; delimiter = d; }
  }

  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delimiter) { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.some((c) => c.trim() !== "")) records.push(row);
        row = [];
      } else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); if (row.some((c) => c.trim() !== "")) records.push(row); }

  if (records.length === 0) return { headers: [], rows: [], delimiter };
  const headers = records[0].map((h) => h.trim());
  const rows: CsvRow[] = records.slice(1).map((r) => {
    const obj: CsvRow = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); });
    return obj;
  });
  return { headers, rows, delimiter };
}

export function parseAmount(raw: string): number | null {
  const n = parseLocaleAmount(raw);
  return Number.isFinite(n) ? n : null;
}

export function parseDateBR(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const validate = (y: number, mo: number, d: number): string | null => {
    if (y < 1900 || y > 2999 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  // ISO yyyy-mm-dd
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return validate(+m[1], +m[2], +m[3]);
  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    let y = m[3];
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return validate(+y, +m[2], +m[1]);
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return validate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function guessColumn(headers: string[], candidates: string[]): string | "" {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const c of candidates) {
    const found = headers.find((h) => norm(h).includes(norm(c)));
    if (found) return found;
  }
  return "";
}

/**
 * Build the deterministic string used as an import fingerprint.
 * When an external identifier exists (e.g. Nubank "Identificador"), it is the
 * sole content signal so re-imports of the same rows are recognized even when
 * their descriptions or amounts drift (refunds, reversals). Otherwise the
 * combination of date + absolute amount + normalized description is used.
 */
export function buildImportHashSource(input: {
  workspaceId: string;
  target: string;
  targetId: string;
  externalId?: string | null;
  date?: string | null;
  amount?: number | null;
  description?: string | null;
}): string {
  const { workspaceId, target, targetId, externalId, date, amount, description } = input;
  if (externalId && externalId.trim()) {
    return `${workspaceId}|${target}|${targetId}|ext:${externalId.trim()}`;
  }
  const absAmount = amount == null ? "" : String(Math.abs(amount));
  const desc = (description ?? "").trim().toLowerCase();
  return `${workspaceId}|${target}|${targetId}|${date ?? ""}|${absAmount}|${desc}`;
}