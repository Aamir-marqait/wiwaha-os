/**
 * Prints SQL that inserts the given policy keys from @wiwaha/policy defaults.
 * Used once to write a data migration when new rules are added, so a hosted
 * database (where seeds don't re-run) gets them with identical wording.
 *   pnpm exec tsx scripts/gen-policy-migration.ts key1 key2 ...
 */
import { DEFAULT_POLICIES } from "@wiwaha/policy";

const keys = new Set(process.argv.slice(2));
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const rows = DEFAULT_POLICIES.filter((p) => keys.has(p.key));
if (rows.length !== keys.size) throw new Error("unknown policy key");
console.log("insert into public.policies (key, topic, title, rule_text, value, client_visible, needs_confirmation, sort) values");
console.log(rows.map((p) => `  (${q(p.key)}, ${q(p.topic)}, ${q(p.title)}, ${q(p.rule_text)}, ${q(JSON.stringify(p.value))}::jsonb, ${p.client_visible}, ${p.needs_confirmation}, ${p.sort})`).join(",\n"));
console.log("on conflict (key) do nothing;");
