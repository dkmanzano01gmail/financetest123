import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildDashboardAccountGroups,
  matchesDashboardAccountGroup,
} from "./dashboard-account-groups.ts";

const accounts = [
  { id: "itau", name: "Conta Itaú", institution: "Banco Itaú" },
  { id: "nubank-dkm", name: "Conta NuBank", institution: "NuBank" },
  { id: "nubank-gigi", name: "Conta NuBank Gigi", institution: "NuBank" },
];

const cards = [
  { id: "card-itau-dkm", name: "Itaú - DKM", institution: "Itaú" },
  { id: "card-nubank-dkm", name: "Nubank - DKM", institution: "Nubank" },
  { id: "card-nubank-gigi", name: "Nubank - Gigi", institution: "Nubank" },
];

describe("agrupamento de contas e cartões no dashboard", () => {
  test("associa o cartão da Gigi à conta da Gigi", () => {
    const groups = buildDashboardAccountGroups(accounts, cards);
    const gigi = groups.find((group) => group.account.id === "nubank-gigi");

    assert.deepEqual(
      gigi?.cards.map((card) => card.id),
      ["card-nubank-gigi"],
    );
  });

  test("usa a conta padrão da instituição quando o titular não aparece nela", () => {
    const groups = buildDashboardAccountGroups(accounts, cards);

    assert.deepEqual(
      groups.find((group) => group.account.id === "nubank-dkm")?.cards.map((card) => card.id),
      ["card-nubank-dkm"],
    );
    assert.deepEqual(
      groups.find((group) => group.account.id === "itau")?.cards.map((card) => card.id),
      ["card-itau-dkm"],
    );
  });

  test("filtra lançamentos da conta e dos cartões associados", () => {
    const group = buildDashboardAccountGroups(accounts, cards).find(
      (item) => item.account.id === "nubank-gigi",
    )!;

    assert.equal(matchesDashboardAccountGroup({ account_id: "nubank-gigi" }, group), true);
    assert.equal(matchesDashboardAccountGroup({ credit_card_id: "card-nubank-gigi" }, group), true);
    assert.equal(matchesDashboardAccountGroup({ credit_card_id: "card-nubank-dkm" }, group), false);
  });
});
