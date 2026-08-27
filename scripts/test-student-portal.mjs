import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260826190000_student_portal_mvp.sql", "utf8");
const functions = readFileSync("src/lib/student-portal.functions.ts", "utf8");

for (const policy of [
  "student_own_profile_read",
  "student_own_attendance_read",
  "student_own_pieces_read",
  "student_own_payments_read",
  "student_projects_own",
])
  assert.match(migration, new RegExp(`CREATE POLICY "${policy}"`), `${policy} ausente`);

assert.match(
  migration,
  /student_id = public\.student_portal_student_id\(workspace_id, auth\.uid\(\)\)/,
);
assert.match(
  migration,
  /a\.user_id = auth\.uid\(\)[\s\S]*a\.status = 'ativo'[\s\S]*a\.revoked_at IS NULL/,
);
assert.match(functions, /expires_at[\s\S]*new Date\(access\.expires_at\) <= new Date\(\)/);
assert.match(functions, /status !== "convite_pendente"/);
assert.match(functions, /invite_token_hash: null/);
assert.match(functions, /status: "revogado"[\s\S]*invite_token_hash: null/);
assert.doesNotMatch(functions, /\.from\("students"\)\.delete/);
assert.doesNotMatch(functions, /\.from\("workspace_members"\)\.insert/);

console.log("student portal security contract: ok");
