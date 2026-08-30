import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createPixPayload, pixCrc16 } from "./pix-br.ts";

describe("Pix BR Code", () => {
  test("inclui o valor e fecha com CRC16 válido", () => {
    const payload = createPixPayload({ amount: 38.5, studentName: "Aluna Teste" });
    assert.match(payload, /540538\.50/);
    assert.match(payload, /60607671000147/);
    assert.equal(payload.slice(-4), pixCrc16(payload.slice(0, -4)));
  });

  test("recusa zero e valores negativos", () => {
    assert.throws(() => createPixPayload({ amount: 0, studentName: "Aluna" }));
    assert.throws(() => createPixPayload({ amount: -1, studentName: "Aluna" }));
  });
});
