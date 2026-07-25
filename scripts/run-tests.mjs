// Lightweight test runner. Usage: bun scripts/run-tests.mjs
import { parseLocaleAmount } from "../src/lib/format.ts";
import { parseCsv, parseDateBR, sha256Hex } from "../src/lib/csv.ts";
import { normalizeDescriptor } from "../src/lib/suggestions.ts";

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.error(`✗ ${name}\n  ${e.message}`); failed++; }
}
function eq(a, b, msg = "") {
  if (a !== b) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
async function main() {
  t("parseLocaleAmount BR", () => {
    eq(parseLocaleAmount("1.234,56"), 1234.56);
    eq(parseLocaleAmount("R$ 1.234,56"), 1234.56);
    eq(parseLocaleAmount("-R$ 12,00"), -12);
    eq(parseLocaleAmount("1234,5"), 1234.5);
  });
  t("parseLocaleAmount US", () => {
    eq(parseLocaleAmount("1,234.56"), 1234.56);
    eq(parseLocaleAmount("1234.56"), 1234.56);
  });
  t("parseLocaleAmount thousands comma", () => {
    eq(parseLocaleAmount("1,234"), 1234);
  });
  t("parseLocaleAmount invalid", () => {
    eq(Number.isNaN(parseLocaleAmount("")), true);
    eq(Number.isNaN(parseLocaleAmount("abc")), true);
    eq(Number.isNaN(parseLocaleAmount(null)), true);
  });

  t("parseCsv handles quoted commas", () => {
    const { headers, rows, delimiter } = parseCsv('a,b,c\n"1,000","x",y\n');
    eq(delimiter, ",");
    eq(headers.join("|"), "a|b|c");
    eq(rows.length, 1);
    eq(rows[0].a, "1,000");
    eq(rows[0].b, "x");
    eq(rows[0].c, "y");
  });
  t("parseCsv semicolon delimiter", () => {
    const { delimiter, rows } = parseCsv("a;b\n1;2\n3;4\n");
    eq(delimiter, ";");
    eq(rows.length, 2);
  });

  t("parseDateBR valid dates", () => {
    eq(parseDateBR("25/07/2026"), "2026-07-25");
    eq(parseDateBR("2026-07-25"), "2026-07-25");
  });
  t("parseDateBR invalid calendar", () => {
    eq(parseDateBR("31/02/2026"), null);
    eq(parseDateBR("13/13/2026"), null);
    eq(parseDateBR("abc"), null);
  });

  t("sha256Hex is deterministic", async () => {
    const a = await sha256Hex("nubank|abc");
    const b = await sha256Hex("nubank|abc");
    const c = await sha256Hex("nubank|xyz");
    eq(a, b);
    if (a === c) throw new Error("different inputs must hash differently");
  });

  t("normalizeDescriptor strips Nubank noise", () => {
    const norm = normalizeDescriptor("Pix enviado - JOÃO SILVA - ****1234");
    if (!norm.includes("joao silva")) throw new Error(`got ${norm}`);
    if (norm.includes("pix enviado")) throw new Error(`prefix not stripped: ${norm}`);
    if (norm.includes("1234")) throw new Error(`mask not stripped: ${norm}`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
await main();