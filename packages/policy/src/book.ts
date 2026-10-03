import { DEFAULT_POLICIES } from "./defaults";
import {
  isPolicyKey,
  policySchemas,
  type PolicyKey,
  type PolicyRecord,
  type PolicyRow,
  type PolicyValue,
} from "./schema";

export class PolicyError extends Error {
  constructor(
    message: string,
    readonly key?: string,
  ) {
    super(message);
    this.name = "PolicyError";
  }
}

export interface PolicyIssue {
  key: string;
  message: string;
}

/**
 * The typed, validated policy book that agents read from. Build it from the
 * rows in the `policies` table with `PolicyBook.fromRows`. Agents must never
 * read rules from their own prompts.
 */
export class PolicyBook {
  private readonly records: Map<PolicyKey, PolicyRecord>;
  readonly issues: readonly PolicyIssue[];

  private constructor(records: Map<PolicyKey, PolicyRecord>, issues: PolicyIssue[]) {
    this.records = records;
    this.issues = issues;
  }

  /**
   * Validates every row. Rows that fail validation are left out and reported in
   * `issues`. An agent that needs a missing rule gets a PolicyError and must
   * escalate, never guess.
   */
  static fromRows(rows: readonly PolicyRow[]): PolicyBook {
    const records = new Map<PolicyKey, PolicyRecord>();
    const issues: PolicyIssue[] = [];
    for (const row of rows) {
      if (!isPolicyKey(row.key)) {
        // Unknown keys are allowed (free-text rules added by the owner) but not typed.
        continue;
      }
      const parsed = policySchemas[row.key].safeParse(row.value);
      if (!parsed.success) {
        issues.push({ key: row.key, message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
        continue;
      }
      records.set(row.key, {
        key: row.key,
        topic: row.topic,
        title: row.title,
        rule_text: row.rule_text,
        value: parsed.data,
        version: row.version,
        client_visible: row.client_visible,
        needs_confirmation: row.needs_confirmation,
        sort: row.sort,
      } as PolicyRecord);
    }
    return new PolicyBook(records, issues);
  }

  /** The seed defaults, as if freshly loaded. Useful for tests and offline demos. */
  static defaults(): PolicyBook {
    return PolicyBook.fromRows(
      DEFAULT_POLICIES.map((p) => ({ ...p, value: p.value as unknown, version: 1 })),
    );
  }

  has(key: PolicyKey): boolean {
    return this.records.has(key);
  }

  record<K extends PolicyKey>(key: K): PolicyRecord<K> {
    const rec = this.records.get(key);
    if (!rec) {
      throw new PolicyError(`Policy "${key}" is missing or invalid; escalate to a human`, key);
    }
    return rec as unknown as PolicyRecord<K>;
  }

  get<K extends PolicyKey>(key: K): PolicyValue<K> {
    return this.record(key).value;
  }

  ruleText(key: PolicyKey): string {
    return this.record(key).rule_text;
  }

  version(key: PolicyKey): number {
    return this.record(key).version;
  }

  /** Versions of the given keys, for stamping on agent_actions. */
  versions(keys: readonly PolicyKey[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const k of keys) {
      const rec = this.records.get(k);
      if (rec) out[k] = rec.version;
    }
    return out;
  }

  all(): PolicyRecord[] {
    return [...this.records.values()].sort((a, b) => a.sort - b.sort);
  }

  /**
   * A plain-text digest of the given rules for an agent's context. This is the
   * only way business rules reach a model.
   */
  digest(keys: readonly PolicyKey[], opts: { clientVisibleOnly?: boolean } = {}): string {
    const lines: string[] = [];
    for (const k of keys) {
      const rec = this.records.get(k);
      if (!rec) {
        lines.push(`- [${k}] (missing; if this matters, escalate)`);
        continue;
      }
      if (opts.clientVisibleOnly && !rec.client_visible) continue;
      const flag = rec.needs_confirmation ? " (some details still awaiting confirmation; do not improvise them)" : "";
      lines.push(`- [${rec.key} v${rec.version}] ${rec.title}: ${rec.rule_text}${flag}`);
    }
    return lines.join("\n");
  }
}
