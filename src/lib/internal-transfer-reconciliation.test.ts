import assert from "node:assert/strict";
import test from "node:test";
import { buildInternalTransferReconciliation } from "./internal-transfer-reconciliation.ts";

const basePair = [
  {
    id: "out",
    date: "2026-10-05",
    type: "expense" as const,
    amount: 500,
    description: "Transferência",
    account_id: "checking",
    linked_account_id: "savings",
    financial_role: "internal_transfer",
    transfer_group_id: "group",
    source: "csv",
  },
  {
    id: "in",
    date: "2026-10-05",
    type: "income" as const,
    amount: 500,
    description: "Transferência",
    account_id: "savings",
    linked_account_id: "checking",
    financial_role: "internal_transfer",
    transfer_group_id: "group",
    source: "manual",
    method: "account_movement",
  },
];

test("marks an imported pair as reconciled", () => {
  const groups = buildInternalTransferReconciliation([
    basePair[0],
    { ...basePair[1], source: "csv" },
  ]);
  assert.equal(groups[0]?.status, "reconciled");
});

test("suggests an imported regular counterpart in the expected account", () => {
  const groups = buildInternalTransferReconciliation([
    ...basePair,
    {
      id: "candidate",
      date: "2026-10-06",
      type: "income",
      amount: 500,
      description: "PIX recebido",
      account_id: "savings",
      financial_role: "regular",
      source: "csv",
    },
  ]);
  assert.equal(groups[0]?.status, "candidate");
  assert.equal(groups[0]?.candidates[0]?.id, "candidate");
});

test("warns when no imported counterpart exists", () => {
  const groups = buildInternalTransferReconciliation(basePair);
  assert.equal(groups[0]?.status, "missing");
});

test("rejects an incomplete or structurally inconsistent pair", () => {
  const groups = buildInternalTransferReconciliation([basePair[0]]);
  assert.equal(groups[0]?.status, "invalid");
});

test("ignores a generated counterpart retained only for audit history", () => {
  const groups = buildInternalTransferReconciliation([
    { ...basePair[0], reconciliation_method: "internal_transfer_import_match" },
    { ...basePair[1], id: "old-generated", status: "ignored" },
    { ...basePair[1], id: "imported", source: "csv" },
  ]);
  assert.equal(groups[0]?.status, "reconciled");
  assert.equal(groups[0]?.rows.length, 2);
});

test("suggests merging two groups when both imported bank sides already exist", () => {
  const groups = buildInternalTransferReconciliation([
    ...basePair,
    {
      ...basePair[1],
      id: "real-incoming",
      source: "csv",
      transfer_group_id: "other-group",
    },
    {
      ...basePair[0],
      id: "generated-outgoing",
      source: "manual",
      method: "account_movement",
      transfer_group_id: "other-group",
    },
  ]);

  const first = groups.find((group) => group.id === "group");
  const second = groups.find((group) => group.id === "other-group");
  assert.equal(first?.status, "candidate");
  assert.equal(first?.mergeCandidateGroupId, "other-group");
  assert.equal(second?.status, "candidate");
  assert.equal(second?.mergeCandidateGroupId, "group");
});
