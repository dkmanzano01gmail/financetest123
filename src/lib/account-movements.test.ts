import assert from "node:assert/strict";
import test from "node:test";
import {
  accountMovementLabel,
  isAccountMovement,
  movementConversionDefaults,
  summarizeAccountMovements,
} from "./account-movements.ts";

test("recognizes only account movement financial roles", () => {
  assert.equal(isAccountMovement({ financial_role: "internal_transfer" }), true);
  assert.equal(isAccountMovement({ financial_role: "investment_contribution" }), true);
  assert.equal(isAccountMovement({ financial_role: "investment_redemption" }), true);
  assert.equal(isAccountMovement({ financial_role: "regular" }), false);
  assert.equal(isAccountMovement({ financial_role: "credit_card_payment" }), false);
});

test("labels each account movement", () => {
  assert.equal(accountMovementLabel("internal_transfer"), "Transferência interna");
  assert.equal(accountMovementLabel("investment_contribution"), "Aporte em investimento");
  assert.equal(accountMovementLabel("investment_redemption"), "Resgate de investimento");
});

test("summarizes paired movements once using the correct side", () => {
  const rows = [
    {
      id: "t-out",
      transfer_group_id: "t",
      financial_role: "internal_transfer",
      type: "expense",
      amount: 500,
    },
    {
      id: "t-in",
      transfer_group_id: "t",
      financial_role: "internal_transfer",
      type: "income",
      amount: 500,
    },
    {
      id: "a-out",
      transfer_group_id: "a",
      financial_role: "investment_contribution",
      type: "expense",
      amount: 1000,
    },
    {
      id: "a-in",
      transfer_group_id: "a",
      financial_role: "investment_contribution",
      type: "income",
      amount: 1000,
    },
    {
      id: "r-out",
      transfer_group_id: "r",
      financial_role: "investment_redemption",
      type: "expense",
      amount: 250,
    },
    {
      id: "r-in",
      transfer_group_id: "r",
      financial_role: "investment_redemption",
      type: "income",
      amount: 250,
    },
    { id: "regular", financial_role: "regular", type: "expense", amount: 999 },
  ];

  assert.deepEqual(summarizeAccountMovements(rows), {
    transfers: { count: 1, amount: 500 },
    contributions: { count: 1, amount: 1000 },
    redemptions: { count: 1, amount: 250 },
  });
});

test("prefills the existing transaction account on the correct movement side", () => {
  assert.deepEqual(
    movementConversionDefaults({ type: "income", account_id: "checking" }, "checking"),
    {
      investmentAction: "redemption",
      sourceAccountId: "",
      destinationAccountId: "checking",
    },
  );
  assert.deepEqual(
    movementConversionDefaults({ type: "expense", account_id: "checking" }, "checking"),
    {
      investmentAction: "contribution",
      sourceAccountId: "checking",
      destinationAccountId: "",
    },
  );
  assert.deepEqual(
    movementConversionDefaults({ type: "income", account_id: "brokerage" }, "investment"),
    {
      investmentAction: "contribution",
      sourceAccountId: "",
      destinationAccountId: "brokerage",
    },
  );
});
