import assert from "node:assert/strict";
import test from "node:test";
import { affectsAccountBalance, affectsAccountReconciliation } from "./account-balance.ts";

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

test("allows excluding a transaction only from account reconciliation", () => {
  const transaction = {
    account_id: "account",
    financial_role: "regular",
    status: "confirmed",
    exclude_from_account_reconciliation: true,
  };

  assert.equal(affectsAccountBalance(transaction), true);
  assert.equal(affectsAccountReconciliation(transaction), false);
  assert.equal(
    affectsAccountReconciliation({
      ...transaction,
      exclude_from_account_reconciliation: false,
    }),
    true,
  );
});
