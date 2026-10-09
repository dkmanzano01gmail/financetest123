import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  suggestMovementForTransaction,
  type MovementSuggestionRule,
} from "./movement-suggestions.ts";

const rules: MovementSuggestionRule[] = [
  {
    movement_kind: "internal_transfer",
    match_groups: [
      {
        all: ["daniel kuhn manzano", "itau"],
        label: "Daniel Kuhn Manzano · Banco Itaú",
      },
      {
        all: ["giovanna belchior cintra", "nu pagamentos"],
        label: "Giovanna Belchior Cintra · Nu Pagamentos",
      },
    ],
  },
];

describe("sugestões de transferências do perfil", () => {
  test("reconhece transferências enviadas ou recebidas do Banco Itaú", () => {
    const suggestion = suggestMovementForTransaction(
      {
        description:
          "Transferência recebida pelo Pix - DANIEL KUHN MANZANO - 447.627.288-61 - BANCO ITAÚ",
        account_id: "account-1",
        financial_role: "regular",
      },
      rules,
    );

    assert.equal(suggestion?.movement_kind, "internal_transfer");
    assert.equal(suggestion?.label, "Transferir");
    assert.match(suggestion?.reason ?? "", /Daniel Kuhn Manzano/);
  });

  test("reconhece Giovanna na Nu Pagamentos sem depender de acentos ou caixa", () => {
    const suggestion = suggestMovementForTransaction(
      {
        description: "PIX ENVIADO Giovanna Belchior Cintra - NU PAGAMENTOS - IP (0260)",
        account_id: "account-1",
      },
      rules,
    );

    assert.equal(suggestion?.label, "Transferir");
  });

  test("não sugere para terceiros, cartões ou movimentações já convertidas", () => {
    assert.equal(
      suggestMovementForTransaction(
        { description: "PIX MERCADO", account_id: "account-1" },
        rules,
      ),
      null,
    );
    assert.equal(
      suggestMovementForTransaction(
        {
          description: "Daniel Kuhn Manzano Banco Itaú",
          account_id: "account-1",
          credit_card_id: "card-1",
        },
        rules,
      ),
      null,
    );
    assert.equal(
      suggestMovementForTransaction(
        {
          description: "Giovanna Belchior Cintra Nu Pagamentos",
          account_id: "account-1",
          financial_role: "internal_transfer",
        },
        rules,
      ),
      null,
    );
  });
});
