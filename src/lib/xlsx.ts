import readXlsxFile from "read-excel-file/browser";
import type { CsvRow, ParsedTabularFile } from "./csv";
import { findTransactionHeaderColumns, findTransactionHeaderRow } from "./tabular-header";

function cellText(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value ?? "").trim();
}

function uniqueHeaders(record: unknown[]): string[] {
  const occurrences = new Map<string, number>();
  return record.map((value) => {
    const header = cellText(value);
    if (!header) return "";
    const occurrence = (occurrences.get(header) ?? 0) + 1;
    occurrences.set(header, occurrence);
    return occurrence === 1 ? header : `${header} (${occurrence})`;
  });
}

/** Read the first worksheet with a detectable transaction table. */
export async function parseXlsx(buffer: ArrayBuffer): Promise<ParsedTabularFile> {
  const workbook = await readXlsxFile(buffer);

  for (const sheet of workbook) {
    const records = sheet.data;
    const headerIndex = findTransactionHeaderRow(records);
    if (headerIndex < 0) continue;

    const headers = uniqueHeaders(records[headerIndex]);
    if (!headers.some(Boolean)) continue;
    const transactionColumns = findTransactionHeaderColumns(records[headerIndex]);

    const rows: CsvRow[] = records
      .slice(headerIndex + 1)
      .filter((record) => {
        if (transactionColumns.length < 2) {
          return record.some((value) => value !== null && cellText(value) !== "");
        }
        return transactionColumns.filter((index) => cellText(record[index]) !== "").length >= 2;
      })
      .map((record) => {
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
