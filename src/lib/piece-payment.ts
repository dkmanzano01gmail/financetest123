export type PiecePaymentStatus = "pending" | "partial" | "paid" | "waived";

/**
 * Resolves the amount paid / status to persist for a class piece.
 * - paid: requires amount > 0 (may differ from the charged value).
 * - partial: requires 0 < amount < charged.
 * - pending: keeps the amount already registered (or 0).
 * - waived: 0.
 */
export function resolvePiecePayment(input: {
  status: PiecePaymentStatus | string;
  amountPaid: number;
  charged: number;
  registeredPaid?: number;
}): { status: PiecePaymentStatus; paid: number; pending: number } {
  const charged = Math.max(0, Number(input.charged) || 0);
  const amount = Number(input.amountPaid);
  if (input.status === "waived") return { status: "waived", paid: 0, pending: 0 };
  if (input.status === "pending") {
    const paid = Math.max(0, Number(input.registeredPaid) || 0);
    return { status: "pending", paid, pending: Math.max(0, charged - paid) };
  }
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Valor pago inválido.");
  if (input.status === "paid") {
    if (amount <= 0) throw new Error("Para o status Pago, informe um valor pago maior que zero.");
    return { status: "paid", paid: amount, pending: Math.max(0, charged - amount) };
  }
  if (input.status === "partial") {
    if (amount <= 0 || (charged > 0 && amount >= charged)) {
      throw new Error("Para o status Parcial, o valor pago deve ser maior que zero e menor que o valor cobrado.");
    }
    return { status: "partial", paid: amount, pending: Math.max(0, charged - amount) };
  }
  throw new Error("Status de pagamento inválido.");
}
