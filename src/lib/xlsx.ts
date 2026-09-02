import readXlsxFile from "read-excel-file/browser";
import type { CsvRow, ParsedTabularFile } from "./csv";

function cellText(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value ?? "").trim();
}

/** Read the first non-empty worksheet and normalize it to the CSV import shape. */
export async function parseXlsx(buffer: ArrayBuffer): Promise<ParsedTabularFile> {
  const workbook = await readXlsxFile(buffer);

  for (const sheet of workbook) {
    const records = sheet.data.filter((record) => record.some((value) => value !== null));
    if (records.length === 0) continue;

    const headers = records[0].map((value) => cellText(value));
    if (!headers.some(Boolean)) continue;

    const rows: CsvRow[] = records.slice(1).map((record) => {
      const row: CsvRow = {};
      headers.forEach((header, index) => {
        if (header) row[header] = cellText(record[index]);
      });
      return row;
    });

    return { headers: headers.filter(Boolean), rows };
  }

  return { headers: [], rows: [] };
}
