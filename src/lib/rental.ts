// Selá Queimas — shared helpers (public platform + admin panel)

export const RENTAL_WORKSPACE_ID = "37f30192-2237-4949-986b-8ad5d6434f91";

export type RentalItemInput = {
  piece_name: string;
  height_cm: string | number;
  width_cm: string | number;
  depth_cm: string | number;
  quantity: string | number;
};

export function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Volume of a single piece in liters (cm³ / 1000). */
export function pieceVolumeLiters(h: number, w: number, d: number): number {
  return (Math.max(h, 0) * Math.max(w, 0) * Math.max(d, 0)) / 1000;
}

export function itemsVolumeLiters(items: RentalItemInput[]): number {
  return items.reduce(
    (sum, i) =>
      sum +
      pieceVolumeLiters(toNumber(i.height_cm), toNumber(i.width_cm), toNumber(i.depth_cm)) *
        Math.max(Math.round(toNumber(i.quantity)) || 1, 1),
    0,
  );
}

export function itemPrice(item: RentalItemInput, pricePerLiter: number): number {
  return (
    pieceVolumeLiters(toNumber(item.height_cm), toNumber(item.width_cm), toNumber(item.depth_cm)) *
    Math.max(Math.round(toNumber(item.quantity)) || 1, 1) *
    Math.max(pricePerLiter, 0)
  );
}

export function itemsPrice(items: RentalItemInput[], pricePerLiter: number): number {
  return items.reduce((total, item) => total + itemPrice(item, pricePerLiter), 0);
}

export function normalizeItems(items: RentalItemInput[]) {
  return items
    .map((i) => ({
      piece_name: String(i.piece_name || "").trim() || "Peça",
      height_cm: toNumber(i.height_cm),
      width_cm: toNumber(i.width_cm),
      depth_cm: toNumber(i.depth_cm),
      quantity: Math.max(Math.round(toNumber(i.quantity)) || 1, 1),
    }))
    .filter((i) => i.height_cm > 0 && i.width_cm > 0 && i.depth_cm > 0);
}

export const RENTAL_ORDER_STATUS: Record<string, string> = {
  pending: "Aguardando pagamento",
  awaiting_payment: "Aguardando pagamento",
  confirmed: "Reserva confirmada",
  awaiting_delivery: "Aguardando entrega",
  received: "Peças recebidas",
  awaiting_firing: "Aguardando queima",
  firing: "Em queima",
  cooling: "Resfriando",
  ready_for_pickup: "Prontas para retirada",
  cancelled: "Cancelado",
  completed: "Concluído",
};

export const RENTAL_PAYMENT_STATUS: Record<string, string> = {
  pending: "A receber",
  overdue: "Vencido",
  cancelled: "Cancelado",
  partial: "Parcial",
  paid: "Pago",
  refunded: "Reembolsado",
};

export const RENTAL_FIRING_PRICE_PER_LITER: Record<string, number> = {
  biscuit: 4.5,
  glaze: 7,
  other: 7,
};

export const RENTAL_SLOT_STATUS: Record<string, string> = {
  draft: "Rascunho",
  open: "Aberta",
  closed: "Fechada",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export const RENTAL_FIRING_TYPE: Record<string, string> = {
  biscuit: "Queima biscoito",
  glaze: "Queima esmalte",
  other: "Outra queima",
};

export function normalizeRentalWhatsAppPhone(phone?: string | null) {
  const digits = String(phone || "")
    .replace(/\D/g, "")
    .replace(/^00/, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function buildRentalOrderStatusMessage(input: {
  customerName: string;
  orderCode: string;
  status: string;
  slotTitle: string;
  firingType?: string | null;
  firingDate?: string | null;
  pickupDate?: string | null;
  trackingUrl: string;
}) {
  const formatFullDate = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  };
  const lines = [
    `Olá, ${input.customerName}! Tudo bem?`,
    "",
    `O status do seu pedido ${input.orderCode} no Selá Queimas foi atualizado.`,
    `Novo status: ${RENTAL_ORDER_STATUS[input.status] ?? input.status}`,
    "",
    `Vaga selecionada: ${input.slotTitle}`,
  ];
  if (input.firingType) {
    lines.push(`Tipo de queima: ${RENTAL_FIRING_TYPE[input.firingType] ?? input.firingType}`);
  }
  if (input.firingDate) lines.push(`Data prevista da queima: ${formatFullDate(input.firingDate)}`);
  if (input.pickupDate) lines.push(`Retirada prevista: ${formatFullDate(input.pickupDate)}`);
  lines.push(
    "",
    "Você pode acompanhar o pedido usando o código e seu e-mail em:",
    input.trackingUrl,
    "",
    "Obrigada!",
    "Selá Queimas",
  );
  return lines.join("\n");
}

export const RENTAL_ERRORS: Record<string, string> = {
  slot_unavailable: "Esta vaga não está mais disponível.",
  invalid_items: "Adicione ao menos uma peça válida.",
  invalid_dimensions: "Informe altura, largura e profundidade das peças.",
  invalid_name: "Informe seu nome.",
  invalid_studio: "Informe o nome do seu ateliê.",
  invalid_email: "Informe um e-mail válido.",
  invalid_phone: "Informe um telefone ou WhatsApp válido.",
  below_minimum: "O volume mínimo desta vaga não foi atingido.",
  insufficient_capacity: "Não há espaço suficiente nesta vaga.",
  not_found: "Pedido não encontrado. Confira o código e o e-mail.",
};
