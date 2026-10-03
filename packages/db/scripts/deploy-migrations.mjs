#!/usr/bin/env node
// Applies new SQL migrations to the hosted Supabase project through the
// Supabase Management API, so CI only needs an access token (no DB password).
//
//   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_PROJECT_REF=abc node deploy-migrations.mjs [--dry-run] [--dir <path>]
//
// A migration is "applied" when its version (the filename prefix before "_")
// is in supabase_migrations.schema_migrations. Each new file runs in its own
// transaction together with the row that records it, so a failure leaves the
// database and the history unchanged. Files are applied in filename order and
// the run stops at the first failure.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const dirArg = args.indexOf("--dir");
const dir = dirArg >= 0 ? args[dirArg + 1] : join(dirname(fileURLToPath(import.meta.url)), "../supabase/migrations");

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error("SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF must be set");
  process.exit(1);
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return text ? JSON.parse(text) : [];
}

const literal = (s) => `'${s.replace(/'/g, "''")}'`;

const files = readdirSync(dir).filter((f) => /^\d+_[a-z0-9_]+\.sql$/.test(f)).sort();
const applied = new Set((await query("select version from supabase_migrations.schema_migrations")).map((r) => String(r.version)));
const pending = files.filter((f) => !applied.has(f.split("_")[0]));

const fileVersions = new Set(files.map((f) => f.split("_")[0]));
const unknown = [...applied].filter((v) => !fileVersions.has(v));
if (unknown.length) console.warn(`::warning::Applied on the database but missing from the repo: ${unknown.join(", ")}`);

if (pending.length === 0) {
  console.log(`Database is up to date (${applied.size} migrations applied).`);
  process.exit(0);
}
console.log(`${pending.length} new migration(s): ${pending.join(", ")}`);
if (dryRun) process.exit(0);

for (const file of pending) {
  const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
  const name = rest.join("_");
  const sql = readFileSync(join(dir, file), "utf8");
  process.stdout.write(`→ ${file} … `);
  try {
    await query(
      `begin;\n${sql}\n;\ninsert into supabase_migrations.schema_migrations (version, name) values (${literal(version)}, ${literal(name)});\ncommit;`,
    );
    console.log("applied");
  } catch (err) {
    console.log("FAILED");
    console.error(`::error::${file} failed and was rolled back. ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
console.log("All new migrations applied.");
