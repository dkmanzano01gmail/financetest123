import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildCardImportDescription,
  futureInstallmentExpenseSuggestions,
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

describe("projeção de parcelas futuras", () => {
  test("usa somente a fatura mais recente de cada cartão e soma os meses futuros", () => {
    const result = futureInstallmentExpenseSuggestions([
      {
        id: "old",
        date: "2026-07-06",
        type: "expense",
        amount: 999,
        credit_card_id: "card-a",
        invoice_month: "2026-07-01",
        installment: "1/10",
        credit_cards: { name: "Cartão A" },
      },
      {
        id: "a1",
        date: "2026-08-06",
        type: "expense",
        amount: 100,
        credit_card_id: "card-a",
        invoice_month: "2026-08-01",
        installment: "2/4",
        credit_cards: { name: "Cartão A" },
      },
      {
        id: "a2",
        date: "2026-08-06",
        type: "expense",
        amount: 50,
        credit_card_id: "card-a",
        invoice_month: "2026-08-01",
        installment: "1 de 3",
        credit_cards: { name: "Cartão A" },
      },
      {
        id: "b1",
        date: "2026-09-10",
        type: "expense",
        amount: 30,
        credit_card_id: "card-b",
        invoice_month: "2026-09-01",
        installment: "3/4",
        credit_cards: { name: "Cartão B" },
      },
    ]);

    assert.deepEqual(
      result.map(({ month, amount, installmentsCount }) => ({
        month,
        amount,
        installmentsCount,
      })),
      [
        { month: "2026-09", amount: 150, installmentsCount: 2 },
        { month: "2026-10", amount: 180, installmentsCount: 3 },
      ],
    );
  });

  test("ignora compras únicas, receitas e lançamentos ignorados", () => {
    const result = futureInstallmentExpenseSuggestions([
      {
        id: "single",
        date: "2026-08-31",
        type: "expense",
        amount: 10,
        credit_card_id: "a",
        invoice_month: "2026-08-01",
        installment: "Única",
      },
      {
        id: "income",
        date: "2026-08-31",
        type: "income",
        amount: 10,
        credit_card_id: "a",
        invoice_month: "2026-08-01",
        installment: "1/2",
      },
      {
        id: "ignored",
        date: "2026-08-31",
        type: "expense",
        amount: 10,
        credit_card_id: "a",
        invoice_month: "2026-08-01",
        installment: "1/2",
        status: "ignored",
      },
    ]);
    assert.deepEqual(result, []);
  });

  test("não reaproveita parcelas de uma fatura antiga quando já existe uma fatura mais nova", () => {
    const result = futureInstallmentExpenseSuggestions([
      {
        id: "old-installment",
        date: "2026-08-06",
        type: "expense",
        amount: 80,
        credit_card_id: "a",
        invoice_month: "2026-08-01",
        installment: "2/6",
      },
      {
        id: "latest-single",
        date: "2026-09-06",
        type: "expense",
        amount: 20,
        credit_card_id: "a",
        invoice_month: "2026-09-01",
        installment: "Única",
      },
    ]);
    assert.deepEqual(result, []);
  });

  test("mantém o dia de pagamento e limita ao último dia do mês", () => {
    const result = futureInstallmentExpenseSuggestions([
      {
        id: "jan",
        date: "2027-01-31",
        type: "expense",
        amount: 25,
        credit_card_id: "a",
        invoice_month: "2027-01-01",
        installment: "1/2",
      },
    ]);
    assert.equal(result[0].date, "2027-02-28");
  });
});
