export type CsvRow = Record<string, string>;

export function parseCsv(text: string): { headers: string[]; rows: CsvRow[]; delimiter: string } {
  // Strip BOM
  text = text.replace(/^\uFEFF/, "");
  // Detect delimiter from first non-empty line
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const candidates = [",", ";", "\t", "|"];
  let delimiter = ",";
  let best = -1;
  for (const d of candidates) {
    const c = firstLine.split(d).length;
    if (c > best) { best = c; delimiter = d; }
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
  if (!raw) return null;
  let s = raw.replace(/\s/g, "").replace(/[R$€$£]/g, "");
  const neg = /^-/.test(s) || /\(.*\)/.test(s);
  s = s.replace(/[()-]/g, "");
  // If both . and , present, last one is the decimal separator
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) { s = s.replace(/\./g, "").replace(",", "."); }
    else { s = s.replace(/,/g, ""); }
  } else if (lastComma > -1) {
    // Treat comma as decimal if 2 digits after
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  }
  const n = Number(s);
  if (!isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

export function parseDateBR(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // ISO yyyy-mm-dd
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // dd/mm/yyyy or dd-mm-yyyy
  m = s.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{2,4})/);
  if (m) {
    let y = m[3];
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y}-${m[2]}-${m[1]}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
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