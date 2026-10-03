/** Turns Postgres / Supabase errors into sentences people can act on. */
export function friendlyError(err: { message?: string; code?: string } | null | undefined, fallback = "Something went wrong. Please try again."): string {
  if (!err?.message) return fallback;
  if (err.code === "42501" || /row-level security|permission/i.test(err.message)) return "You don't have permission to do that.";
  return err.message;
}
