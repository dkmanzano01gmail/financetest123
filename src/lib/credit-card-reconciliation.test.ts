import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildCardImportDescription,
  installmentReferenceDate,
  invoiceMonthForPaymentDate,
} from "./credit-card-reconciliation.ts";

describe("importação de fatura de cartão", () => {
  test("usa a data de pagamento para o mês financeiro", () => {
    assert.equal(invoiceMonthForPaymentDate("2026-09-06"), "2026-09-01");
  });

  test("descreve a compra original e a parcela no mês do pagamento", () => {
    assert.equal(
      buildCardImportDescription({
        description: "COMPRA PARCELADA",
        purchaseDate: "2026-01-05",
        paymentDate: "2026-08-06",
        installment: "8/12",
      }),
      "COMPRA PARCELADA · Compra original: 05/01/2026 · Parcela 8/12: 05/08/2026",
    );
  });

  test("limita o dia da parcela ao último dia do mês", () => {
    assert.equal(installmentReferenceDate("2026-01-31", "2026-02-06"), "2026-02-28");
  });

  test("não cria data de parcela para compra única", () => {
    assert.equal(
      buildCardImportDescription({
        description: "COMPRA À VISTA",
        purchaseDate: "2026-08-31",
        paymentDate: "2026-09-06",
        installment: "Única",
      }),
      "COMPRA À VISTA · Compra original: 31/08/2026",
    );
  });
});
