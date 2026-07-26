// Lightweight test runner. Usage: bun scripts/run-tests.mjs
import { parseLocaleAmount } from "../src/lib/format.ts";
import { parseCsv, parseDateBR, sha256Hex, buildImportHashSource } from "../src/lib/csv.ts";
import { normalize as normalizeDescriptor, suggestForTransaction } from "../src/lib/suggestions.ts";
import {
  attendanceSummary,
  buildCashFlowProjection,
  calculateClassPieceCost,
  calculateKilnCost,
  calculatePiecePrice,
  calculateWorkshop,
  dashboardSummary,
  expandCashFlowEntries,
  resolveFiringProfile,
} from "../src/lib/orna-logic.ts";

let passed = 0,
  failed = 0;
const tests = [];
function t(name, fn) {
  tests.push({ name, fn });
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

  t("buildImportHashSource — external ID short-circuits row content", () => {
    const a = buildImportHashSource({
      workspaceId: "ws1",
      target: "account",
      targetId: "acc1",
      externalId: "abc-123",
      date: "2026-01-01",
      amount: 10,
      description: "COFFEE",
    });
    const b = buildImportHashSource({
      workspaceId: "ws1",
      target: "account",
      targetId: "acc1",
      externalId: "abc-123",
      date: "2026-06-15",
      amount: -999,
      description: "REFUND — reversal",
    });
    eq(a, b, "external ID must dominate the fingerprint");
    const c = buildImportHashSource({
      workspaceId: "ws1",
      target: "account",
      targetId: "acc1",
      externalId: "different",
      date: "2026-01-01",
      amount: 10,
      description: "COFFEE",
    });
    if (a === c) throw new Error("different external IDs must not collide");
  });
  t("buildImportHashSource — no external ID uses normalized fields", () => {
    const a = buildImportHashSource({
      workspaceId: "ws1",
      target: "account",
      targetId: "acc1",
      externalId: null,
      date: "2026-01-01",
      amount: -50,
      description: "  Padaria  ",
    });
    const b = buildImportHashSource({
      workspaceId: "ws1",
      target: "account",
      targetId: "acc1",
      externalId: "",
      date: "2026-01-01",
      amount: 50,
      description: "padaria",
    });
    eq(a, b, "sign and trailing spaces must not affect the fingerprint");
  });
  t("buildImportHashSource — different workspaces do not collide", () => {
    const a = buildImportHashSource({
      workspaceId: "wsA",
      target: "account",
      targetId: "acc1",
      externalId: "same-id",
    });
    const b = buildImportHashSource({
      workspaceId: "wsB",
      target: "account",
      targetId: "acc1",
      externalId: "same-id",
    });
    if (a === b) throw new Error("workspaces must be part of the fingerprint");
  });

  const ctx = {
    categories: [
      {
        id: "food",
        name: "Restaurantes",
        type: "expense",
        importance_level: "flexible",
        importance_comment: "ifood uber eats delivery restaurante padaria",
      },
      {
        id: "tx",
        name: "Transporte",
        type: "expense",
        importance_level: "important",
        importance_comment: "uber taxi 99 metro gasolina",
      },
    ],
    rules: [],
    history: [],
  };
  t("suggestForTransaction — category-comment keyword match", () => {
    const s = suggestForTransaction(
      { id: "t1", type: "expense", description: "iFood — Padaria", counterparty: null, amount: 30 },
      ctx,
    );
    eq(s.category_id, "food");
    eq(s.source, "category");
  });
  t("suggestForTransaction — manual category defaults to its importance", () => {
    const s = suggestForTransaction(
      {
        id: "t2",
        type: "expense",
        description: "algo qualquer",
        counterparty: null,
        amount: 10,
        category_id: "tx",
      },
      ctx,
    );
    eq(s.category_id, "tx");
    eq(s.importance, "important");
  });
  t("suggestForTransaction — history match wins over comment/category", () => {
    const s = suggestForTransaction(
      {
        id: "t3",
        type: "expense",
        description: "Uber viagem",
        counterparty: null,
        amount: 20,
        category_id: "food",
      },
      {
        ...ctx,
        history: [
          {
            description: "Uber viagem centro",
            counterparty: null,
            category_id: "tx",
            importance_level: "essential",
            date: "2026-01-01",
            amount: 20,
          },
        ],
      },
    );
    eq(s.category_id, "tx");
    eq(s.importance, "essential");
    eq(s.source, "history");
  });

  t("dashboardSummary compares current and previous month", () => {
    const result = dashboardSummary([
      { id: "1", date: "2026-07-01", type: "income", amount: 100 },
      { id: "2", date: "2026-07-02", type: "expense", amount: 20 },
      { id: "3", date: "2026-06-02", type: "income", amount: 50 },
      { id: "4", date: "2026-07-03", type: "expense", amount: 999, status: "ignored" },
    ], 7, 2026);
    eq(result.income, 100);
    eq(result.expense, 20);
    eq(result.balance, 80);
    eq(result.previous.income, 50);
  });

  t("monthly cash-flow clamps day 31 in February", () => {
    const rows = expandCashFlowEntries([{
      id: "rent", entry_date: "2026-01-31", type: "expense", description: "Rent",
      amount: 10, recurrence: "monthly", is_active: true, day_of_month: 31,
    }], new Date(2026, 1, 1, 12), new Date(2026, 1, 28, 12));
    eq(rows.length, 1);
    eq(rows[0].date, "2026-02-28");
  });

  t("Apps Script kiln cone 6 profile is preserved", () => {
    const profile = resolveFiringProfile(null, "glaze", "6");
    eq(profile.ovenDiameter, 57);
    eq(profile.resistanceBurns, 175);
    eq(profile.hours, 10.5);
    eq(profile.utilization, 0.75);
  });

  t("piece pricing applies desired profit before labor", () => {
    const result = calculatePiecePrice({
      clayWeightKg: 1, clay10kgPrice: 100, glazeGrams: 0, glazeCostPerGram: 0,
      bisqueCost: 0, glazeFiringCost: 0, laborCost: 50, desiredProfitRate: 1,
    });
    eq(result.productionCost, 10);
    eq(result.desiredProfitValue, 10);
    eq(result.suggestedUnitPrice, 70);
  });

  t("workshop break-even includes fees and surprise reserve", () => {
    const result = calculateWorkshop({
      attendees: 10, pricePerPerson: 100, fixedCosts: 300,
      variableCostPerPerson: 20, paymentFeeRate: 0.05, surpriseRate: 0.1,
    });
    eq(result.breakEvenAttendees, 5);
  });

  t("regular-class charge uses separate biscuit and glaze profiles", () => {
    const result = calculateClassPieceCost({
      quantity: 1, clayWeightKg: 1, clayUnitCost: 7.7,
      glazeAmount: 0, glazeUnitCost: 0, lengthCm: 10, depthCm: 10,
      glazeCone: "10", firingSettings: null, kilnFiringProfitRate: 1,
    });
    eq(result.glazeProfile.cone, "10");
    if (!(result.chargeAmount > result.clayCost)) throw new Error("firing charge was not added");
  });

  for (const test of tests) {
    try {
      await test.fn();
      console.log(`✓ ${test.name}`);
      passed++;
    } catch (e) {
      console.error(`✗ ${test.name}\n  ${e instanceof Error ? e.message : String(e)}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
await main();
