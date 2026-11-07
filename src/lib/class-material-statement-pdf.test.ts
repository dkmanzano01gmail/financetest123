import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import logo from "../assets/selo-sela-ceramica.png.asset.json";
import { createClassMaterialsPdf, dimensionValue, hasStatementDimensions, pieceDimensions, type StatementPiece, type Statement } from "./class-material-statement-pdf";

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

test("the executive dimension track is omitted when all pieces have empty or zero dimensions", () => {
  assert.equal(hasStatementDimensions([
    { length_cm: null, depth_cm: "", height_cm: 0 },
    { length_cm: "0", depth_cm: undefined, height_cm: null },
  ]), false);
});

test("one positive dimension on any piece keeps the executive dimension track", () => {
  assert.equal(hasStatementDimensions([
    { length_cm: 0, depth_cm: null, height_cm: "" },
    { length_cm: null, depth_cm: 12, height_cm: 0 },
  ]), true);
});

test("PDF generation keeps input financial values and uses the actual outstanding Pix amount", async () => {
  const statement: Statement = {
    student: "Teste de geração", group: "Turma", period: "Novembro 2026",
    charged: 100, paid: 35.5, pending: 64.5,
    clay: 20, glaze: 20, firing: 30, kilnMaintenance: 10, other: 10, freight: 10,
    pieces: [{ piece_name: "Peça", quantity: 2, charged: 100, paid: 35.5, pending: 64.5 }],
  };
  const before = structuredClone(statement);
  const logoResponse = await fetch(`http://localhost:8080${logo.url}`);
  assert.equal(logoResponse.ok, true);
  const assets = {
    logo: new Uint8Array(await logoResponse.arrayBuffer()),
    regular: new Uint8Array(await readFile("public/fonts/cantarell-regular.ttf")),
    bold: new Uint8Array(await readFile("public/fonts/cantarell-bold.ttf")),
  };
  const { blob, pixPayload } = await createClassMaterialsPdf(statement, { assets, issuedAt: new Date("2026-11-07T12:00:00Z") });
  const document = await PDFDocument.load(await blob.arrayBuffer());
  assert.ok(document.getPageCount() > 0);
  assert.match(pixPayload ?? "", /540564\.50/);
  assert.deepEqual(statement, before);
  const paid = await createClassMaterialsPdf({ ...statement, paid: 100, pending: 0 }, { assets, includeCostBreakdown: false });
  assert.equal(paid.pixPayload, null);
});