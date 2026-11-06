// Pure rules for editing an existing Selá Queimas order.
import { pieceVolumeLiters, toNumber } from "./rental.ts";

export type EditableItem = {
  id?: string;
  piece_name: string;
  quantity: string | number;
  width_cm: string | number;
  depth_cm: string | number;
  height_cm: string | number;
  unit_price: string | number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function itemQuantity(item: EditableItem) {
  return Math.max(Math.round(toNumber(item.quantity)) || 1, 1);
}

export function itemVolume(item: EditableItem) {
  return round2(
    pieceVolumeLiters(toNumber(item.height_cm), toNumber(item.width_cm), toNumber(item.depth_cm)) *
      itemQuantity(item),
  );
}

export function itemTotal(item: EditableItem) {
  return round2(Math.max(toNumber(item.unit_price), 0) * itemQuantity(item));
}

/** Unit price suggested by the existing per-liter rule (edge spacing on width/depth). */
export function suggestedUnitPrice(item: EditableItem, pricePerLiter: number, edgeMarginCm = 0) {
  const s = Math.max(edgeMarginCm, 0);
  return round2(
    pieceVolumeLiters(
      toNumber(item.height_cm),
      toNumber(item.width_cm) + s,
      toNumber(item.depth_cm) + s,
    ) * Math.max(pricePerLiter, 0),
  );
}

export function orderTotals(items: EditableItem[], discount: number, depositAmount: number) {
  const subtotal = round2(items.reduce((s, i) => s + itemTotal(i), 0));
  const total = round2(Math.max(subtotal - Math.max(discount, 0), 0));
  const total_liters = round2(items.reduce((s, i) => s + itemVolume(i), 0));
  const balance_amount = round2(Math.max(total - Math.max(depositAmount, 0), 0));
  return { subtotal, total, total_liters, balance_amount };
}

type Payment = { id: string; amount: number | string; status: string; type?: string | null };

/**
 * Paid payments are never touched. Only pending "balance" payments are resized so
 * that paid + pending equals the new total. Returns the updates and the amount due.
 */
export function reconcilePayments(payments: Payment[], newTotal: number) {
  const paid = round2(
    payments.filter((p) => p.status === "paid").reduce((s, p) => s + toNumber(p.amount), 0),
  );
  const pending = payments.filter((p) => p.status !== "paid");
  const pendingOther = pending.filter((p) => p.type !== "balance");
  const pendingBalance = pending.filter((p) => p.type === "balance");
  const otherSum = pendingOther.reduce((s, p) => s + toNumber(p.amount), 0);
  const updates: { id: string; amount: number }[] = [];
  if (pendingBalance.length) {
    const target = round2(Math.max(newTotal - paid - otherSum, 0));
    pendingBalance.forEach((p, idx) => {
      const amount = idx === 0 ? target : 0;
      if (round2(toNumber(p.amount)) !== amount) updates.push({ id: p.id, amount });
    });
  }
  const due = round2(Math.max(newTotal - paid, 0));
  return { paid, due, updates };
}

export function hasPaidPayment(payments: Payment[]) {
  return payments.some((p) => p.status === "paid" && toNumber(p.amount) > 0);
}
