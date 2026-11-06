import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resolvePiecePayment } from "./piece-payment.ts";

describe("resolvePiecePayment", () => {
  test("Pago aceita valor diferente do cobrado", () => {
    assert.deepEqual(resolvePiecePayment({ status: "paid", amountPaid: 80, charged: 100 }), { status: "paid", paid: 80, pending: 20 });
  });
  test("Pago rejeita zero", () => {
    assert.throws(() => resolvePiecePayment({ status: "paid", amountPaid: 0, charged: 100 }));
  });
  test("Parcial aceita valor entre zero e o cobrado", () => {
    assert.equal(resolvePiecePayment({ status: "partial", amountPaid: 40, charged: 100 }).paid, 40);
    assert.throws(() => resolvePiecePayment({ status: "partial", amountPaid: 100, charged: 100 }));
    assert.throws(() => resolvePiecePayment({ status: "partial", amountPaid: 0, charged: 100 }));
  });
  test("Pendente mantém o valor já registrado", () => {
    assert.equal(resolvePiecePayment({ status: "pending", amountPaid: 999, charged: 100, registeredPaid: 30 }).paid, 30);
    assert.equal(resolvePiecePayment({ status: "pending", amountPaid: 999, charged: 100 }).paid, 0);
  });
});
