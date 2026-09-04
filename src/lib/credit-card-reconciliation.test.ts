import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildCardImportDescription,
  futureInstallmentExpenseSuggestions,
  installmentReferenceDate,
  invoiceMonthForPaymentDate,
  parseInstallment,
  typicalCardPaymentDay,
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
  test("aceita os formatos de parcela suportados e rejeita valores inválidos", () => {
    assert.deepEqual(parseInstallment("2/6"), { current: 2, total: 6 });
    assert.deepEqual(parseInstallment("2 de 6"), { current: 2, total: 6 });
    assert.equal(parseInstallment("7/6"), null);
    assert.equal(parseInstallment("Única"), null);
  });

  test("calcula a mediana histórica e usa o vencimento quando não há histórico", () => {
    const payments = [7, 8, 10, 30].map((day, index) => ({
      date: `2026-0${index + 5}-${String(day).padStart(2, "0")}`,
      linked_credit_card_id: index === 3 ? "other" : "card-a",
      financial_role: "credit_card_payment",
      status: "confirmed",
    }));
    assert.deepEqual(typicalCardPaymentDay("card-a", payments, 12), {
      day: 8,
      source: "history",
    });
    assert.deepEqual(typicalCardPaymentDay("card-b", payments, 12), {
      day: 12,
      source: "due_day",
    });
  });

  test("usa só a última fatura e mantém cartões em datas separadas", () => {
    const result = futureInstallmentExpenseSuggestions(
      [
        {
          id: "old",
          date: "2026-07-06",
          type: "expense",
          amount: 999,
          credit_card_id: "card-a",
          invoice_month: "2026-07-01",
          installment: "1/10",
        },
        {
          id: "a1",
          date: "2026-08-06",
          type: "expense",
          amount: 100,
          credit_card_id: "card-a",
          invoice_month: "2026-08-01",
          installment: "2/4",
        },
        {
          id: "a2",
          date: "2026-08-06",
          type: "expense",
          amount: 50,
          credit_card_id: "card-a",
          invoice_month: "2026-08-01",
          installment: "1 de 3",
        },
        {
          id: "b1",
          date: "2026-09-10",
          type: "expense",
          amount: 30,
          credit_card_id: "card-b",
          invoice_month: "2026-09-01",
          installment: "3/4",
        },
      ],
      [
        { id: "card-a", name: "Cartão A", due_day: 6 },
        { id: "card-b", name: "Cartão B", due_day: 10 },
      ],
      [
        {
          date: "2026-07-07",
          linked_credit_card_id: "card-a",
          financial_role: "credit_card_payment",
          status: "confirmed",
        },
        {
          date: "2026-08-08",
          linked_credit_card_id: "card-a",
          financial_role: "credit_card_payment",
          status: "confirmed",
        },
      ],
    );

    assert.deepEqual(
      result.map(({ cardName, date, amount, installmentsCount, paymentDaySource }) => ({
        cardName,
        date,
        amount,
        installmentsCount,
        paymentDaySource,
      })),
      [
        {
          cardName: "Cartão A",
          date: "2026-09-08",
          amount: 150,
          installmentsCount: 2,
          paymentDaySource: "history",
        },
        {
          cardName: "Cartão A",
          date: "2026-10-08",
          amount: 150,
          installmentsCount: 2,
          paymentDaySource: "history",
        },
        {
          cardName: "Cartão B",
          date: "2026-10-10",
          amount: 30,
          installmentsCount: 1,
          paymentDaySource: "due_day",
        },
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

  test("limita o vencimento ao último dia do mês", () => {
    const result = futureInstallmentExpenseSuggestions(
      [
        {
          id: "jan",
          date: "2027-01-15",
          type: "expense",
          amount: 25,
          credit_card_id: "a",
          invoice_month: "2027-01-01",
          installment: "1/2",
        },
      ],
      [{ id: "a", name: "Cartão A", due_day: 31 }],
    );
    assert.equal(result[0].date, "2027-02-28");
  });

  test("ignora pagamentos históricos cancelados", () => {
    assert.deepEqual(
      typicalCardPaymentDay(
        "a",
        [
          {
            date: "2026-08-20",
            linked_credit_card_id: "a",
            financial_role: "credit_card_payment",
            status: "cancelled",
          },
        ],
        9,
      ),
      { day: 9, source: "due_day" },
    );
  });
});
