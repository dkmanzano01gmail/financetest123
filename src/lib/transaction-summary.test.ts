import assert from "node:assert/strict";
import test from "node:test";
import { matchesTransactionSource } from "./transaction-summary.ts";

test("filters transactions by a specific account", () => {
  assert.equal(matchesTransactionSource({ account_id: "checking" }, "account:checking"), true);
  assert.equal(matchesTransactionSource({ account_id: "cash" }, "account:checking"), false);
  assert.equal(
    matchesTransactionSource({ linked_account_id: "checking" }, "account:checking"),
    true,
  );
});

test("filters transactions by a specific credit card", () => {
  assert.equal(matchesTransactionSource({ credit_card_id: "visa" }, "credit_card:visa"), true);
  assert.equal(
    matchesTransactionSource({ linked_credit_card_id: "visa" }, "credit_card:visa"),
    true,
  );
  assert.equal(matchesTransactionSource({ credit_card_id: "master" }, "credit_card:visa"), false);
});
