import { describe, expect, it } from "vitest";
import { orderTotals, reconcilePayments, hasPaidPayment } from "./rental-order-edit";

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
    expect(t.subtotal).toBe(13);
    expect(t.total).toBe(12);
    expect(t.total_liters).toBe(2);
    expect(t.balance_amount).toBe(8);
  });

  it("never changes paid payments, resizes pending balance", () => {
    const r = reconcilePayments(
      [
        { id: "d", amount: 20, status: "paid", type: "deposit" },
        { id: "b", amount: 30, status: "pending", type: "balance" },
      ],
      70,
    );
    expect(r.paid).toBe(20);
    expect(r.due).toBe(50);
    expect(r.updates).toEqual([{ id: "b", amount: 50 }]);
  });

  it("detects paid payments for removal confirmation", () => {
    expect(hasPaidPayment([{ id: "x", amount: 10, status: "paid" }])).toBe(true);
    expect(hasPaidPayment([{ id: "x", amount: 10, status: "pending" }])).toBe(false);
  });
});
