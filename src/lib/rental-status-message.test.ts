import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRentalOrderStatusMessage,
  itemPrice,
  normalizeRentalWhatsAppPhone,
} from "./rental.ts";

test("adds the configured glaze spacing to width and depth", () => {
  assert.equal(
    itemPrice({ piece_name: "Vaso", height_cm: 5, width_cm: 7, depth_cm: 7, quantity: 2 }, 15, 1),
    9.6,
  );
});

test("keeps biscuit dimensions unchanged when no glaze spacing is provided", () => {
  assert.equal(
    itemPrice({ piece_name: "Vaso", height_cm: 5, width_cm: 7, depth_cm: 7, quantity: 2 }, 15),
    7.35,
  );
});

test("builds a status message with the selected firing slot", () => {
  const message = buildRentalOrderStatusMessage({
    customerName: "Daniel",
    orderCode: "SQ-2026-TESTE",
    status: "firing",
    slotTitle: "Esmalte — Cone 7",
    firingType: "glaze",
    firingDate: "2026-10-30",
    pickupDate: "2026-11-05",
    trackingUrl: "https://selafinance.lovable.app/rental",
  });

  assert.match(message, /Em queima/);
  assert.match(message, /Esmalte — Cone 7/);
  assert.match(message, /Queima esmalte/);
  assert.match(message, /30\/10\/2026/);
  assert.match(message, /SQ-2026-TESTE/);
});

test("normalizes Brazilian WhatsApp numbers", () => {
  assert.equal(normalizeRentalWhatsAppPhone("+55 (11) 95275-7412"), "5511952757412");
  assert.equal(normalizeRentalWhatsAppPhone("11 95275-7412"), "5511952757412");
  assert.equal(normalizeRentalWhatsAppPhone(null), "");
});
