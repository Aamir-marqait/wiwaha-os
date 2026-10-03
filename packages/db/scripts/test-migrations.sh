#!/usr/bin/env bash
# Applies every migration + seed to a throwaway local Postgres, then runs the
# SQL test suite in packages/db/tests. Needs Postgres 15+ binaries on PATH or
# in /usr/lib/postgresql/*/bin. Usage: pnpm db:test
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
export PATH="${PGBIN:+$PGBIN:}$PATH"
TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
shopt -s nullglob
RUN_AS=""
cleanup() { $RUN_AS pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

if [ "$(id -u)" = "0" ]; then
  id wiwaha_pg >/dev/null 2>&1 || useradd -M -s /bin/bash wiwaha_pg
  chown -R wiwaha_pg "$TMP"; chmod 755 "$TMP"
  RUN_AS="runuser -u wiwaha_pg --"
fi
$RUN_AS initdb -D "$TMP/data" -U postgres --auth=trust >/dev/null
$RUN_AS pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP" -l "$TMP/pg.log" start >/dev/null
PSQL=(psql -v ON_ERROR_STOP=1 -q -h "$TMP" -p "$PORT" -U postgres -d postgres)

echo "→ shim"
"${PSQL[@]}" -f "$HERE/scripts/local-shim.sql"
for f in "$HERE"/supabase/migrations/*.sql; do
  echo "→ $(basename "$f")"
  "${PSQL[@]}" -o /dev/null -f "$f"
done
for f in "$HERE"/supabase/seed/*.sql; do
  echo "→ seed $(basename "$f")"
  "${PSQL[@]}" -o /dev/null -f "$f"
done
for f in "$HERE"/tests/*.sql; do
  echo "→ test $(basename "$f")"
  "${PSQL[@]}" -o /dev/null -f "$f"
done
echo "✓ migrations, seed and SQL tests passed"
