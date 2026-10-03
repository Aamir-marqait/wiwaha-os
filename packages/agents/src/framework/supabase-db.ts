import type { SupabaseClient } from "@supabase/supabase-js";
import { isCond, type Db, type Row, type SelectOptions, type Where } from "./db";

type Filterable = {
  eq(c: string, v: unknown): Filterable;
  neq(c: string, v: unknown): Filterable;
  in(c: string, v: readonly unknown[]): Filterable;
  gt(c: string, v: unknown): Filterable;
  gte(c: string, v: unknown): Filterable;
  lt(c: string, v: unknown): Filterable;
  lte(c: string, v: unknown): Filterable;
  is(c: string, v: null): Filterable;
  not(c: string, op: string, v: null): Filterable;
};

function applyWhere<Q>(q: Q, w: Where | undefined): Q {
  let f = q as unknown as Filterable;
  for (const [col, raw] of Object.entries(w ?? {})) {
    const c = isCond(raw) ? raw : { op: "eq" as const, value: raw };
    switch (c.op) {
      case "eq": f = c.value === null ? f.is(col, null) : f.eq(col, c.value); break;
      case "neq": f = f.neq(col, c.value); break;
      case "in": f = f.in(col, c.value as readonly unknown[]); break;
      case "gt": f = f.gt(col, c.value); break;
      case "gte": f = f.gte(col, c.value); break;
      case "lt": f = f.lt(col, c.value); break;
      case "lte": f = f.lte(col, c.value); break;
      case "is": f = f.is(col, null); break;
      case "not_is": f = f.not(col, "is", null); break;
    }
  }
  return f as unknown as Q;
}

function must<T>(res: { data: T | null; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) throw Object.assign(new Error(`${what}: ${res.error.message}`), { code: res.error.code });
  return res.data as T;
}

/** Db over a service-role Supabase client (agents run server-side). */
export class SupabaseDb implements Db {
  constructor(private readonly client: SupabaseClient) {}

  async select<T = Row>(table: string, opts: SelectOptions = {}): Promise<T[]> {
    let q = applyWhere(this.client.from(table).select("*"), opts.where);
    for (const o of opts.order ?? []) q = q.order(o.column, { ascending: o.ascending !== false });
    if (opts.limit !== undefined) q = q.limit(opts.limit);
    return must(await q, `select ${table}`) as T[];
  }

  async insert<T = Row>(table: string, rows: Row | Row[]): Promise<T[]> {
    return must(await this.client.from(table).insert(rows).select("*"), `insert ${table}`) as T[];
  }

  async update<T = Row>(table: string, w: Where, patch: Row): Promise<T[]> {
    return must(await applyWhere(this.client.from(table).update(patch), w).select("*"), `update ${table}`) as T[];
  }

  async upsert<T = Row>(table: string, rows: Row | Row[], onConflict: string): Promise<T[]> {
    return must(await this.client.from(table).upsert(rows, { onConflict }).select("*"), `upsert ${table}`) as T[];
  }

  async rpc<T = unknown>(fn: string, args: Row): Promise<T> {
    return must(await this.client.rpc(fn, args), `rpc ${fn}`) as T;
  }
}
