import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { findPaymentSuggestions } from "./student-payment-control.ts";

describe("de/para de pagamentos de alunos", () => {
  test("cruza nome completo e valor da mensalidade", () => {
    const [suggestion] = findPaymentSuggestions({
      studentName: "Luiza de Souza Jacome",
      allStudentNames: ["Luiza de Souza Jacome", "Luiza Martinez"],
      tuitionDue: 600,
      materialsDue: 0,
      transactions: [
        {
          id: "transaction-1",
          amount: 600,
          description: "PIX RECEBIDO LUIZA SOUZA JACOME MENSALIDADE",
        },
      ],
    });

    assert.equal(suggestion.kind, "tuition");
    assert.equal(suggestion.confidence, "high");
    assert.match(suggestion.reasons.join(" "), /nome completo|nome e sobrenome/);
  });

  test("aceita uma parte exclusiva do nome, mas rejeita primeiro nome ambíguo", () => {
    const names = ["Luiza Jacome", "Luiza Martinez"];
    const unique = findPaymentSuggestions({
      studentName: "Luiza Jacome",
      allStudentNames: names,
      tuitionDue: 600,
      materialsDue: 0,
      transactions: [{ id: "unique", amount: 600, description: "PIX JACOME" }],
    });
    const ambiguous = findPaymentSuggestions({
      studentName: "Luiza Jacome",
      allStudentNames: names,
      tuitionDue: 600,
      materialsDue: 0,
      transactions: [{ id: "ambiguous", amount: 600, description: "PIX LUIZA" }],
    });

    assert.equal(unique.length, 1);
    assert.equal(ambiguous.length, 0);
  });

  test("sugere separadamente mensalidade e materiais M+1", () => {
    const suggestions = findPaymentSuggestions({
      studentName: "Ana Beatriz Lima",
      allStudentNames: ["Ana Beatriz Lima"],
      tuitionDue: 600,
      materialsDue: 83.5,
      transactions: [
        { id: "tuition", amount: 600, description: "Ana Beatriz mensalidade" },
        { id: "materials", amount: 83.5, description: "Ana Lima materiais" },
      ],
    });

    assert.deepEqual(suggestions.map(({ transaction, kind }) => [transaction.id, kind]).sort(), [
      ["materials", "materials"],
      ["tuition", "tuition"],
    ]);
  });

  test("identifica pagamento conjunto pelo valor total", () => {
    const [suggestion] = findPaymentSuggestions({
      studentName: "Marina Costa",
      tuitionDue: 600,
      materialsDue: 75,
      transactions: [
        { id: "combined", amount: 675, description: "Marina Costa mensalidade e materiais" },
      ],
    });

    assert.equal(suggestion.kind, "combined");
    assert.equal(suggestion.targetAmount, 675);
  });
});
