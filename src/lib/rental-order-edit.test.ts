import assert from "node:assert/strict";
import { describe, test as it } from "node:test";
import { orderTotals, reconcilePayments, hasPaidPayment } from "./rental-order-edit.ts";

describe("rental order edit", () => {
  it("total follows item values minus discount", () => {
    const t = orderTotals(
      [
        { piece_name: "A", quantity: 2, width_cm: 10, depth_cm: 10, height_cm: 10, unit_price: 5 },
        { piece_name: "B", quantity: 1, width_cm: "", depth_cm: "", height_cm: "", unit_price: 3 },
      ],
      1,
      4,
    );
    assert.equal(t.subtotal, 13);
    assert.equal(t.total, 12);
    assert.equal(t.total_liters, 2);
    assert.equal(t.balance_amount, 8);
  });

  it("never changes paid payments, resizes pending balance", () => {
    const r = reconcilePayments(
      [
        { id: "d", amount: 20, status: "paid", type: "deposit" },
        { id: "b", amount: 30, status: "pending", type: "balance" },
      ],
      70,
    );
    assert.equal(r.paid, 20);
    assert.equal(r.due, 50);
    assert.deepEqual(r.updates, [{ id: "b", amount: 50 }]);
  });

  it("detects paid payments for removal confirmation", () => {
    assert.equal(hasPaidPayment([{ id: "x", amount: 10, status: "paid" }]), true);
    assert.equal(hasPaidPayment([{ id: "x", amount: 10, status: "pending" }]), false);
  });
});
