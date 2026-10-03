import { randomUUID } from "node:crypto";

/**
 * A small database port for agents built from Phase 2 on. Each agent gets a
 * *scoped* view (see `scopeDb`) that only allows the tables, operations and
 * RPCs listed in its tools.ts, so "only the tools this agent may call" is
 * enforced at runtime, not just by convention. The same agent code runs on
 * Supabase (SupabaseDb) and in tests (MemoryDb).
 */

export type Row = Record<string, unknown>;
export type Op = "eq" | "neq" | "in" | "gt" | "gte" | "lt" | "lte" | "is" | "not_is";
export type Cond = { op: Op; value: unknown };
export type Where = Record<string, unknown | Cond>;

export interface SelectOptions {
  where?: Where;
  order?: { column: string; ascending?: boolean }[];
  limit?: number;
}

export interface Db {
  select<T = Row>(table: string, opts?: SelectOptions): Promise<T[]>;
  insert<T = Row>(table: string, rows: Row | Row[]): Promise<T[]>;
  update<T = Row>(table: string, where: Where, patch: Row): Promise<T[]>;
  /** Insert or update on the given unique columns ("a,b"). */
  upsert<T = Row>(table: string, rows: Row | Row[], onConflict: string): Promise<T[]>;
  rpc<T = unknown>(fn: string, args: Row): Promise<T>;
}

export const where = {
  in: (value: readonly unknown[]): Cond => ({ op: "in", value }),
  gte: (value: unknown): Cond => ({ op: "gte", value }),
  gt: (value: unknown): Cond => ({ op: "gt", value }),
  lte: (value: unknown): Cond => ({ op: "lte", value }),
  lt: (value: unknown): Cond => ({ op: "lt", value }),
  neq: (value: unknown): Cond => ({ op: "neq", value }),
  isNull: (): Cond => ({ op: "is", value: null }),
  notNull: (): Cond => ({ op: "not_is", value: null }),
};

export function isCond(v: unknown): v is Cond {
  return typeof v === "object" && v !== null && "op" in v && "value" in v && Object.keys(v).length === 2;
}

// ---------------------------------------------------------------------------
// Tool scoping
// ---------------------------------------------------------------------------
export type TableOp = "select" | "insert" | "update" | "upsert";
export interface DbGrants {
  tables: Readonly<Record<string, readonly TableOp[]>>;
  rpcs?: readonly string[];
}

export class ToolNotAllowedError extends Error {
  constructor(agent: string, what: string) {
    super(`${agent} is not allowed to ${what} (see its tools.ts)`);
    this.name = "ToolNotAllowedError";
  }
}

export function scopeDb(db: Db, agent: string, grants: DbGrants): Db {
  const check = (table: string, op: TableOp) => {
    if (!grants.tables[table]?.includes(op)) throw new ToolNotAllowedError(agent, `${op} ${table}`);
  };
  return {
    select: async (t, o) => { check(t, "select"); return db.select(t, o); },
    insert: async (t, r) => { check(t, "insert"); return db.insert(t, r); },
    update: async (t, w, p) => { check(t, "update"); return db.update(t, w, p); },
    upsert: async (t, r, c) => { check(t, "upsert"); return db.upsert(t, r, c); },
    rpc: async (fn, args) => {
      if (!grants.rpcs?.includes(fn)) throw new ToolNotAllowedError(agent, `call ${fn}()`);
      return db.rpc(fn, args);
    },
  } as Db;
}

// ---------------------------------------------------------------------------
// In-memory implementation for scenario tests
// ---------------------------------------------------------------------------
type RpcHandler = (args: Row, db: MemoryDb) => unknown;

function matches(row: Row, w: Where | undefined): boolean {
  if (!w) return true;
  for (const [col, raw] of Object.entries(w)) {
    const v = row[col];
    const c: Cond = isCond(raw) ? raw : { op: "eq", value: raw };
    const cmp = (a: unknown, b: unknown) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
    const num = typeof v === "number" && typeof c.value === "number";
    const order = num ? (v as number) - (c.value as number) : cmp(v, c.value);
    switch (c.op) {
      case "eq": if (v !== c.value) return false; break;
      case "neq": if (v === c.value) return false; break;
      case "in": if (!(c.value as unknown[]).includes(v)) return false; break;
      case "is": if (v !== null && v !== undefined) return false; break;
      case "not_is": if (v === null || v === undefined) return false; break;
      case "gt": if (v == null || !(order > 0)) return false; break;
      case "gte": if (v == null || !(order >= 0)) return false; break;
      case "lt": if (v == null || !(order < 0)) return false; break;
      case "lte": if (v == null || !(order <= 0)) return false; break;
    }
  }
  return true;
}

export class MemoryDb implements Db {
  readonly tables = new Map<string, Row[]>();
  private readonly rpcs = new Map<string, RpcHandler>();
  /** Unique columns per table, to emulate constraints that matter in tests. */
  private readonly uniques = new Map<string, string[][]>();
  /** Before-insert checks, to emulate the triggers that matter in tests. */
  private readonly guards = new Map<string, ((row: Row, db: MemoryDb) => void)[]>();
  now: () => Date = () => new Date();

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [t, rows] of Object.entries(seed)) this.tables.set(t, rows.map((r) => ({ ...r })));
  }

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  unique(table: string, ...columns: string[]): this {
    this.uniques.set(table, [...(this.uniques.get(table) ?? []), columns]);
    return this;
  }

  beforeInsert(table: string, guard: (row: Row, db: MemoryDb) => void): this {
    this.guards.set(table, [...(this.guards.get(table) ?? []), guard]);
    return this;
  }

  onRpc(fn: string, handler: RpcHandler): this {
    this.rpcs.set(fn, handler);
    return this;
  }

  async select<T = Row>(table: string, opts: SelectOptions = {}): Promise<T[]> {
    let out = this.rows(table).filter((r) => matches(r, opts.where));
    for (const o of [...(opts.order ?? [])].reverse()) {
      out = [...out].sort((a, b) => {
        const x = a[o.column], y = b[o.column];
        const d = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""));
        return o.ascending === false ? -d : d;
      });
    }
    if (opts.limit !== undefined) out = out.slice(0, opts.limit);
    return out.map((r) => ({ ...r })) as T[];
  }

  async insert<T = Row>(table: string, rows: Row | Row[]): Promise<T[]> {
    const list = Array.isArray(rows) ? rows : [rows];
    const now = this.now().toISOString();
    const created: Row[] = list.map((r) => ({ id: randomUUID(), created_at: now, ...r }));
    for (const r of created) {
      for (const g of this.guards.get(table) ?? []) g(r, this);
      for (const cols of this.uniques.get(table) ?? []) {
        if (cols.every((c) => r[c] !== undefined && r[c] !== null) && this.rows(table).some((x) => cols.every((c) => x[c] === r[c]))) {
          throw Object.assign(new Error(`duplicate key value violates unique constraint (${table}: ${cols.join(", ")})`), { code: "23505" });
        }
      }
      this.rows(table).push(r);
    }
    return created.map((r) => ({ ...r })) as T[];
  }

  async update<T = Row>(table: string, w: Where, patch: Row): Promise<T[]> {
    const hit = this.rows(table).filter((r) => matches(r, w));
    for (const r of hit) Object.assign(r, patch);
    return hit.map((r) => ({ ...r })) as T[];
  }

  async upsert<T = Row>(table: string, rows: Row | Row[], onConflict: string): Promise<T[]> {
    const cols = onConflict.split(",").map((c) => c.trim());
    const out: Row[] = [];
    for (const r of Array.isArray(rows) ? rows : [rows]) {
      const existing = this.rows(table).find((x) => cols.every((c) => x[c] === r[c]));
      if (existing) { Object.assign(existing, r); out.push({ ...existing }); }
      else out.push(...(await this.insert(table, r)));
    }
    return out as T[];
  }

  async rpc<T = unknown>(fn: string, args: Row): Promise<T> {
    const h = this.rpcs.get(fn);
    if (!h) throw new Error(`MemoryDb: no handler for rpc ${fn}`);
    return (await h(args, this)) as T;
  }
}
