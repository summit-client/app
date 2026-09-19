/**
 * Does a database built from this repo match the one in production?
 *
 * WHY THIS EXISTS. Migration 0000 does not describe the scheduler's original
 * tables - it GUESSES them. They predate this repo, nobody had their real
 * definitions, and somebody reconstructed them by reading application code.
 * 0000's own header says to treat every column in it as inferred rather than
 * observed, and asks for a pg_dump reconciliation that never happened.
 *
 * Two divergences were then found BY ACCIDENT, two days apart, both while
 * doing something else: `sessions.created_at` is declared and does not exist;
 * `profiles.email` exists and is not declared. The second one matters -
 * invite-teammate's guard against overwriting somebody's account queries
 * profiles by email, so on a rebuilt database that guard errors instead of
 * protecting.
 *
 * Finding them by accident is not a strategy. This measures the whole thing.
 *
 * WHAT IT COMPARES. Every table in `public`, column by column: type,
 * nullability, presence. Plus the tables that exist on one side and not the
 * other, which is the more serious class - a table missing from production
 * means a migration in this repo was never applied, and a table missing from
 * the repo means something exists live that no migration describes and no
 * check can reason about.
 *
 * WHAT IT DOES NOT DO. It never writes, and it never proposes that production
 * change to match the files. Where they disagree, production is the fact and
 * this repo is the claim.
 *
 * Run: node schema_drift.mjs ../migrations          (needs a live credential)
 */
import { fromFiles, fromProduction, REF } from "./_live.mjs";

const DIR = process.argv[2];
if (!DIR) {
  console.error("usage: node schema_drift.mjs <migrations dir>");
  process.exit(1);
}

/**
 * Tables that exist in production and are deliberately not in this repo.
 * Each needs a reason. This is a baseline, not an excuse - an entry here is
 * a table no migration describes, which means no review ever saw its columns
 * and `tenancy.mjs` cannot reason about it.
 */
const UNTRACKED_IN_PROD = new Map([
  // NOT leftovers, which is what they looked like until someone read the
  // script that owns them. These three are the UNDO RECORD for
  // supabase/mock-data/dummy-calendar-sessions-2026.sql: they store what each
  // row's availability and location were BEFORE the seed overwrote them, so
  // its documented cleanup can put the originals back. That script creates
  // them itself and is deliberately not a numbered migration, because a
  // `db reset` must not replay fictional bookings for one clinic.
  //
  // So they belong here as tables this repo knows about but does not create,
  // and dropping them would take a rollback path with them. A migration to do
  // that was written and deleted once this was understood.
  //
  // Worth knowing: all three are EMPTY while ~2000 seeded sessions exist, so
  // the cleanup's `update ... from mock_data_availability_backfill` would
  // match nothing and restore no availability. Whoever runs that cleanup
  // should check that first. Issue #201.
  ["mock_data_seed_people", "undo record for the mock-data seed script. Issue #201."],
  ["mock_data_location_backfill", "undo record for the mock-data seed script. Issue #201."],
  ["mock_data_availability_backfill", "undo record for the mock-data seed script. Issue #201."],
]);

/**
 * Tables this repo creates that production does not have. Every entry here is
 * a migration that was never applied, so it should be empty and stay empty.
 */
const MISSING_FROM_PROD = new Map([
  // Empty, and it should stay empty. An entry here is a migration this repo
  // says happened that did not - which is how apps/client shipped an upsert
  // against a table that did not exist (0073, issue #200, applied 2026-09-19).
]);

/**
 * Columns this repo declares that production does not have, same shape as
 * above but one column rather than a whole table. Also 0073, also issue #200 -
 * listed separately only because the table it sits on DOES exist live, so the
 * whole-table check cannot see it.
 */
const COLUMNS_MISSING_FROM_PROD = new Map([
  // Empty. Same rule as the map above: a column declared here and absent live
  // means a migration did not run.
]);

const COLUMNS = `
  select c.relname as tbl, a.attname as col,
         format_type(a.atttypid, a.atttypmod) as typ,
         a.attnotnull as nn
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and a.attnum > 0 and not a.attisdropped
   order by c.relname, a.attname`;

console.log(`\nSchema drift — repo vs production (${REF})\n`);

const live = await fromProduction("schema_drift")(COLUMNS.replace(/\s+/g, " "));
const repo = await (await fromFiles(DIR))(COLUMNS);

// A suite that finds nothing reports the same as one that finds nothing wrong.
if (!live.length || !repo.length) {
  console.error(`FAIL: read ${repo.length} repo columns and ${live.length} live columns.\n` +
                "      One of those is empty, so every check below would pass vacuously.");
  process.exit(1);
}

let pass = 0, fail = 0, known = 0;
const t = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`); }
};

const key = (r) => `${r.tbl}.${r.col}`;
const R = new Map(repo.map((r) => [key(r), r]));
const P = new Map(live.map((r) => [key(r), r]));
const repoTables = new Set(repo.map((r) => r.tbl));
const liveTables = new Set(live.map((r) => r.tbl));

/* ---------- 1. whole tables ------------------------------------------- */

const onlyRepo = [...repoTables].filter((x) => !liveTables.has(x));
const newOnlyRepo = onlyRepo.filter((x) => !MISSING_FROM_PROD.has(x));
known += onlyRepo.length - newOnlyRepo.length;
t("every table this repo creates exists in production",
  newOnlyRepo.length === 0,
  newOnlyRepo.join(", ") + " — a migration that was never applied. Anything " +
  "reading these fails live while every test here passes.");

const onlyProd = [...liveTables].filter((x) => !repoTables.has(x));
const newOnlyProd = onlyProd.filter((x) => !UNTRACKED_IN_PROD.has(x));
known += onlyProd.length - newOnlyProd.length;
t("every table in production is described by a migration",
  newOnlyProd.length === 0,
  newOnlyProd.join(", ") + " — exists live, in no migration. No review saw " +
  "its columns and tenancy.mjs cannot reason about it.");

/* ---------- 2. columns, on the tables both sides have ------------------ */

const shared = [...repoTables].filter((x) => liveTables.has(x));
const absentFromRepo = [], absentFromProd = [], wrongType = [], wrongNull = [];

for (const tbl of shared) {
  for (const [k, r] of P) if (r.tbl === tbl && !R.has(k)) absentFromRepo.push(r);
  for (const [k, r] of R) if (r.tbl === tbl && !P.has(k)) absentFromProd.push(r);
  for (const [k, r] of R) {
    const p = P.get(k);
    if (!p || p.tbl !== tbl) continue;
    if (p.typ !== r.typ) wrongType.push(`${k}: repo ${r.typ}, prod ${p.typ}`);
    else if (String(p.nn) !== String(r.nn))
      wrongNull.push(`${k}: repo ${r.nn ? "NOT NULL" : "nullable"}, prod ${p.nn ? "NOT NULL" : "nullable"}`);
  }
}

const show = (rows) => rows.map((r) => `${r.tbl}.${r.col} ${r.typ}`).join("\n         ");

t(`no column exists in production and not in this repo (${shared.length} shared tables)`,
  absentFromRepo.length === 0,
  show(absentFromRepo) + "\n         Code reading these works live and breaks on a rebuilt database.");

const newAbsentFromProd = absentFromProd.filter((r) => !COLUMNS_MISSING_FROM_PROD.has(key(r)));
known += absentFromProd.length - newAbsentFromProd.length;
t("no column is declared here that production does not have",
  newAbsentFromProd.length === 0,
  show(newAbsentFromProd) + "\n         A migration listing one of these fails outright, as 0077 nearly did.");

t("every shared column has the same type",
  wrongType.length === 0,
  wrongType.join("\n         "));

t("every shared column has the same nullability",
  wrongNull.length === 0,
  wrongNull.join("\n         "));

/* ---------- the baseline ---------------------------------------------- */

if (known) {
  console.log(`\n  ${known} known difference${known === 1 ? "" : "s"}, each with a reason:`);
  const found = new Set([...onlyRepo, ...onlyProd, ...absentFromProd.map(key)]);
  for (const [k, why] of [...MISSING_FROM_PROD, ...UNTRACKED_IN_PROD, ...COLUMNS_MISSING_FROM_PROD]) {
    if (found.has(k)) console.log(`    - ${k}\n        ${why}`);
  }
  console.log("  These do not fail the run. They are meant to reach zero.");
}

console.log(`\n${pass} passed, ${fail} failed${known ? `, ${known} known` : ""}`);
process.exit(fail ? 1 : 0);
