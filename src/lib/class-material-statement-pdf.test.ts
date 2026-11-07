import assert from "node:assert/strict";
import { test } from "node:test";
import { dimensionValue, pieceDimensions, type StatementPiece } from "./class-material-statement-pdf";

test("absent dimensions never become zero in the statement", () => {
  for (const value of [null, undefined, "", 0, "0", -1, NaN]) {
    assert.equal(dimensionValue(value), "Não informado");
  }
});

test("all three existing dimensions are preserved without changing the piece", () => {
  const piece: StatementPiece = { length_cm: 12.5, depth_cm: null, height_cm: 8 };
  const before = structuredClone(piece);
  assert.equal(pieceDimensions(piece), "12,5 × Não informado × 8");
  assert.deepEqual(piece, before);
});