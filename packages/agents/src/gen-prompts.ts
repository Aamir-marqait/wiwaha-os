/**
 * Bundles each agent's prompt.md into prompts.generated.ts so the prompts ship
 * with serverless builds (no filesystem reads at runtime).
 *   pnpm --filter @wiwaha/agents gen:prompts
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const agentsDir = join(here, "agents");
const entries: string[] = [];
for (const name of readdirSync(agentsDir).sort()) {
  const md = join(agentsDir, name, "prompt.md");
  if (existsSync(md)) entries.push(`  ${JSON.stringify(name)}: ${JSON.stringify(readFileSync(md, "utf8"))},`);
}
const out = `// GENERATED from packages/agents/src/agents/*/prompt.md by src/gen-prompts.ts. Do not edit.\nexport const PROMPTS: Record<string, string> = {\n${entries.join("\n")}\n};\n`;
writeFileSync(join(here, "prompts.generated.ts"), out);
console.log(`bundled ${entries.length} prompts`);
