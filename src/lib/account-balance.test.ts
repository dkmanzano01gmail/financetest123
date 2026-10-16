import assert from "node:assert/strict";
import test from "node:test";
import { affectsAccountBalance } from "./account-balance.ts";

test("includes every active transaction linked to an account", () => {
  for (const financial_role of [
    "regular",
    "credit_card_payment",
    "internal_transfer",
    "investment_contribution",
    "investment_redemption",
  ]) {
    assert.equal(
      affectsAccountBalance({
        account_id: "account",
        financial_role,
        status: "confirmed",
      }),
      true,
    );
  }
});

test("excludes rows that are not real movements in the account ledger", () => {
  assert.equal(
    affectsAccountBalance({
      account_id: "account",
      financial_role: "credit_card_payment_offset",
      status: "confirmed",
    }),
    false,
  );
  assert.equal(
    affectsAccountBalance({
      account_id: "account",
      financial_role: "regular",
      status: "ignored",
    }),
    false,
  );
  assert.equal(
    affectsAccountBalance({
      account_id: null,
      financial_role: "regular",
      status: "confirmed",
    }),
    false,
  );
});
