import { expect, test } from "bun:test";
import { parseLocaleAmount } from "./format";

test("parseLocaleAmount handles BR format", () => {
  expect(parseLocaleAmount("1.234,56")).toBe(1234.56);
  expect(parseLocaleAmount("R$ 1.234,56")).toBe(1234.56);
  expect(parseLocaleAmount("-R$ 12,00")).toBe(-12);
  expect(parseLocaleAmount("1234,5")).toBe(1234.5);
});

test("parseLocaleAmount handles US format", () => {
  expect(parseLocaleAmount("1,234.56")).toBe(1234.56);
  expect(parseLocaleAmount("1234.56")).toBe(1234.56);
});

test("parseLocaleAmount handles thousands-only comma", () => {
  expect(parseLocaleAmount("1,234")).toBe(1234);
});

test("parseLocaleAmount rejects garbage", () => {
  expect(Number.isNaN(parseLocaleAmount(""))).toBe(true);
  expect(Number.isNaN(parseLocaleAmount("abc"))).toBe(true);
  expect(Number.isNaN(parseLocaleAmount(null))).toBe(true);
});

test("parseLocaleAmount passes through numbers", () => {
  expect(parseLocaleAmount(42)).toBe(42);
  expect(Number.isNaN(parseLocaleAmount(Number.NaN))).toBe(true);
});