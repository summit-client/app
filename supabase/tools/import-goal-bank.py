#!/usr/bin/env python3
"""
Turn the organization's Goal Bank spreadsheet into migration 0061.

  python3 supabase/tools/import-goal-bank.py "path/to/Goal Bank.xlsx"

Committed rather than run once and thrown away, because the mapping decisions
below are the interesting part of the import and a reviewer needs to see them
next to the data they act on. Re-running it regenerates the migration.

No dependencies: an .xlsx is a zip of XML, and pulling four columns out of one
sheet does not justify adding openpyxl to a repo that has no Python toolchain.

WHAT THE SHEET LOOKS LIKE

One row per teaching step. The first row of each goal also carries the goal's
code (A), domain (C), definition (D) and teaching procedure (E). Step rows
carry a step number (B) and the step text (G).

Below each goal's real steps sit rows with an empty B and a bare number in G.
Those are leftover cell references, not steps. The first version of this import
read them as steps and produced ten rungs for almost every goal, most of them
reading "59." - 3,187 pieces of nonsense headed for a clinical bank that
populates client programs. A step is now a row with a step number AND prose.
"""
import collections
import html
import json
import pathlib
import re
import sys
import zipfile

CLINIC = "ee78d13c-eec9-4512-98bc-d00bca2d08c9"
DEFAULT_MASTERY = "80% across 3 consecutive sessions, 2 settings, 2 people"


# --------------------------------------------------------------------------
# Reading the sheet
# --------------------------------------------------------------------------
def read_rows(xlsx: str):
    z = zipfile.ZipFile(xlsx)
    shared = z.read("xl/sharedStrings.xml").decode("utf8")
    strings = [
        html.unescape(re.sub(r"<[^>]+>", "", m))
        for m in re.findall(r"<si>(.*?)</si>", shared, re.S)
    ]
    sheet = z.read("xl/worksheets/sheet1.xml").decode("utf8")

    def cells(body):
        out = {}
        for m in re.finditer(
            r'<c r="([A-Z]+)\d+"(?:[^>]*t="([^"]*)")?[^>]*>(.*?)</c>', body, re.S
        ):
            col, typ, inner = m.group(1), m.group(2), m.group(3)
            v = re.search(r"<v>(.*?)</v>", inner, re.S)
            if not v:
                isv = re.search(r"<is>(.*?)</is>", inner, re.S)
                out[col] = html.unescape(re.sub(r"<[^>]+>", "", isv.group(1))) if isv else ""
                continue
            out[col] = strings[int(v.group(1))] if typ == "s" else v.group(1)
        return out

    return [cells(b) for _, b in re.findall(
        r"<row[^>]*r=\"(\d+)\"[^>]*>(.*?)</row>", sheet, re.S)]


# --------------------------------------------------------------------------
# Domains
#
# 45 distinct strings in the sheet describe 16 domains. They differ by case
# ("Zones of regulation"), by typo ("Expressive Comunication"), by truncation
# ("Expressive" for "Expressive Communication"), by punctuation ("Literacy -
# Decoding", "Literacy Decoding", "Literacy- Decoding") and by folding a
# sub-domain into the domain ("Personal Independence - Hygiene", eleven
# "Fluency Plus Program: X Target" strings).
#
# Keyed on a slug rather than the literal string, so a variant that differs
# only in spacing, case or punctuation cannot produce a second domain. That is
# how "Zones of regulation" slipped through a case-sensitive map.
# --------------------------------------------------------------------------
def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


DOMAIN = {
    "receptivecommunication": ("Receptive Communication", None),
    "receptive": ("Receptive Communication", None),
    "auditorydiscrimination": ("Receptive Communication", "Auditory Discrimination"),
    "audprocessingcomprehensionandretention": ("Receptive Communication", "Auditory Processing"),
    "expressivecommunication": ("Expressive Communication", None),
    "expressivecomunication": ("Expressive Communication", None),   # typo in source
    "expressive": ("Expressive Communication", None),
    "socialskills": ("Social Skills", None),
    "finemotor": ("Fine Motor", None),
    "grossmotor": ("Gross Motor", None),
    "cognition": ("Cognition", None),
    "play": ("Play", None),
    "imitation": ("Imitation", None),
    "jointattention": ("Joint Attention", None),
    "behaviour": ("Behaviour", None),
    "motorspeech": ("Speech", "Motor Speech"),
    "soundproduction": ("Speech", "Sound Production"),
    "soundproductionspeech": ("Speech", "Sound Production"),
    "speech": ("Speech", None),
    "personalindependence": ("Personal Independence", None),
    "personalindependencehygiene": ("Personal Independence", "Hygiene"),
    "personalindependencechores": ("Personal Independence", "Chores"),
    "personalindependencefastenersanddressing": ("Personal Independence", "Dressing"),
    "readingcomprehension": ("Literacy", "Reading Comprehension"),
    "zonesofregulation": ("Emotional Regulation", "Zones of Regulation"),
    "fluencyparenttraining": ("Fluency", "Parent Training"),
}

# Where the sheet's own domain is missing or literally "Blank", the code prefix
# places the goal. Never used to override a stated domain.
PREFIX = {
    "RC": ("Receptive Communication", None), "EC": ("Expressive Communication", None),
    "SS": ("Social Skills", None), "FM": ("Fine Motor", None),
    "GM": ("Gross Motor", None), "CO": ("Cognition", None), "PL": ("Play", None),
    "IM": ("Imitation", None), "JA": ("Joint Attention", None),
    "PI": ("Personal Independence", None), "ST": ("Social Thinking", None),
    "MS": ("Speech", "Motor Speech"), "SP": ("Speech", None),
    "FL": ("Fluency", None), "BX": ("Behaviour", None), "BXC": ("Behaviour", None),
    "ART": ("Play", "Art"), "EFZ": ("Emotional Regulation", "Zones of Regulation"),
    "LITD": ("Literacy", "Decoding"), "LITC": ("Literacy", "Reading Comprehension"),
    "AAC": ("Expressive Communication", "AAC"),
    "AUDC": ("Receptive Communication", "Auditory Processing"),
}


def canon_domain(raw: str):
    k = slug(raw)
    if not k or k == "blank":
        return None, None
    if k.startswith("socialthinking"):
        # "Social Thinking: Size of the Problem" -> domain + the specific unit.
        sub = raw.split(":", 1)[1] if ":" in raw else (raw.split("-", 1)[1] if "-" in raw else "")
        return "Social Thinking", (sub.strip() or None)
    if k.startswith("literacy"):
        rest = re.sub(r"^literacy\s*[-–]?\s*", "", raw, flags=re.I).strip()
        return "Literacy", (rest or None)
    if k.startswith("fluencyplusprogram") or k.startswith("fluencytarget"):
        rest = raw.split(":", 1)[1].strip() if ":" in raw else raw
        return "Fluency", (re.sub(r"\s*Target$", "", rest).strip() or None)
    if k in DOMAIN:
        return DOMAIN[k]
    return raw.strip(), None


# --------------------------------------------------------------------------
# Text
# --------------------------------------------------------------------------
PROMPT_EXPANSIONS = [
    (r"\bFP\b", "full physical prompt"),
    (r"\bPPP\b|\bPP\b", "partial physical prompt"),
    (r"\bGP\b", "gestural prompt"),
    (r"\bVP\b", "verbal prompt"),
    (r"\bMP\b", "model prompt"),
]
PROMPT_LEVELS = [
    (r"physical", "physical"), (r"\bmodel", "model"), (r"gestural", "gestural"),
    (r"verbal prompt", "verbal"), (r"independent", "independent"),
]


def expand_prompts(text: str):
    """Spell out the bank's abbreviations, and report the level taught.

    "Looks toward sound after a FP to turn head" is only legible to someone who
    already knows the convention, which is exactly the person who does not need
    the step written down.
    """
    out = text
    for pat, full in PROMPT_EXPANSIONS:
        out = re.sub(pat, full, out)
    low = out.lower()
    for pat, level in PROMPT_LEVELS:
        if re.search(pat, low):
            return out, level
    return out, None


def sentence(s: str) -> str:
    s = re.sub(r"\s+", " ", (s or "")).strip().strip("–-— ")
    if not s:
        return s
    s = s[0].upper() + s[1:]
    return s if s.endswith((".", "?", "!")) else s + "."


MASTERY = re.compile(
    r"(measured\s+across.*|across\s+\d+\s+consecutive.*|\d+%\s*(?:accuracy|correct).*)$",
    re.I | re.S)

# The two GETACAB dimensions a script can actually check. A definition built on
# a mentalist verb is not behavioural; one too short to act on is not
# technological. Everything else - applied, analytic, conceptually systematic,
# effective, generality - is a clinical judgement about the goal in context,
# and a regex claiming to assess it would be worse than no check.
VAGUE = re.compile(
    r"\b(understand|understands|know|knows|learn about|be aware|appreciate|"
    r"enjoy|feel comfortable|realise|realize)\b", re.I)


def is_step_text(s: str) -> bool:
    s = (s or "").strip()
    return bool(s) and len(s) > 3 and not re.fullmatch(r"[\d.,\s]+", s)


# --------------------------------------------------------------------------
def parse(rows):
    goals, order = {}, []
    for c in rows:
        code = (c.get("A") or "").strip()
        if not re.match(r"^[A-Z]{1,4}\d+\.\d+", code):
            continue
        if code not in goals:
            goals[code] = {"code": code, "domain": "", "definition": "",
                           "procedure": "", "steps": []}
            order.append(code)
        g = goals[code]
        for key, col in (("domain", "C"), ("definition", "D"), ("procedure", "E")):
            if not g[key] and (c.get(col) or "").strip():
                g[key] = c[col].strip()
        # A step needs a step number and prose. See the module docstring.
        if (c.get("B") or "").strip() and is_step_text(c.get("G")):
            g["steps"].append(c["G"].strip())
    return [goals[c] for c in order]


def shape(g, flags):
    domain, sub = canon_domain(g["domain"])
    if not domain:
        domain, sub = PREFIX.get(re.match(r"^([A-Z]+)", g["code"]).group(1), (None, None))
        if domain:
            flags["domain recovered from the code prefix"] += 1
    if not domain:
        domain, sub = "Uncategorised", None
        flags["domain could not be determined"] += 1

    raw = re.sub(r"\s+", " ", g["definition"]).strip()
    m = MASTERY.search(raw)
    mastery, definition = (sentence(m.group(1)), raw[:m.start()].strip()) if m else (None, raw)
    definition = sentence(definition)

    reasons = []
    if VAGUE.search(definition):
        reasons.append("not observable: uses a mentalist verb rather than a countable behaviour")
    if len(definition) < 25:
        reasons.append("definition too short for another clinician to replicate")

    steps, levels = [], []
    for i, s in enumerate(g["steps"], 1):
        text, level = expand_prompts(re.sub(r"\s+", " ", s).strip())
        steps.append({"n": i, "text": sentence(text), "level": level})
        if level:
            levels.append(level)
    if not steps:
        flags["no teaching steps in the source"] += 1

    name = re.split(r"[.;]", definition)[0].strip() or g["code"]
    if len(name) > 90:
        name = name[:87].rstrip() + "…"

    # Only a domain that names a published curriculum asserts one. Everything
    # else is the organization's own bank - never inferred from the subject
    # matter, because a goal's stated source travels into progress reports and
    # funding claims.
    if sub == "Zones of Regulation":
        assessment, source = "Zones of Regulation (Kuypers)", "curriculum"
    elif domain == "Social Thinking":
        assessment, source = "Social Thinking (Winner)", "curriculum"
    else:
        assessment, source = "Mount Etna internal goal bank", "internal"

    ladder = ["physical", "model", "gestural", "verbal", "independent"]
    for r in reasons:
        flags[r] += 1

    return {
        "code": g["code"], "name": name, "domain": domain, "sub_domain": sub,
        "definition": definition, "mastery": mastery,
        "procedure": sentence(g["procedure"]) if g["procedure"] else None,
        "assessment": assessment, "assessment_source": source,
        "default_prompt_level": next((l for l in ladder if l in levels), None),
        "needs_review": bool(reasons), "review_reason": "; ".join(reasons) or None,
        # Only kept where the goal is flagged: for the rest the change is
        # punctuation and case, and storing 554 near-identical originals would
        # bury the handful a reviewer actually has to compare.
        "original": raw if reasons else None,
        "status": "approved", "steps": steps,
    }


def q(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def emit(entries, out_path, header):
    parts = [header]
    for g in entries:
        parts.append(f"""
insert into goal_bank_entries
  (clinic_id, code, name, domain, sub_domain, operational_definition,
   default_measurement_mode, default_mastery_criteria, default_prompt_level,
   teaching_procedure, assessment, assessment_source, status,
   needs_clinical_review, review_reason, original_definition)
values ('{CLINIC}', {q(g['code'])}, {q(g['name'])}, {q(g['domain'])}, {q(g['sub_domain'])},
        {q(g['definition'])}, 'dtt', {q(g.get('mastery') or DEFAULT_MASTERY)},
        {q(g['default_prompt_level'])}, {q(g['procedure'])}, {q(g['assessment'])},
        {q(g['assessment_source'])}, {q(g.get('status', 'approved'))},
        {str(g['needs_review']).lower()}, {q(g['review_reason'])}, {q(g.get('original'))})
-- The unique index on (clinic_id, code) is partial - contributed goals have no
-- code and must not collide on null - so ON CONFLICT has to repeat its
-- predicate or Postgres cannot match it to an index.
on conflict (clinic_id, code) where code is not null do update
   set name = excluded.name, domain = excluded.domain, sub_domain = excluded.sub_domain,
       operational_definition = excluded.operational_definition,
       default_mastery_criteria = excluded.default_mastery_criteria,
       default_prompt_level = excluded.default_prompt_level,
       teaching_procedure = excluded.teaching_procedure,
       assessment = excluded.assessment, assessment_source = excluded.assessment_source,
       status = excluded.status, needs_clinical_review = excluded.needs_clinical_review,
       review_reason = excluded.review_reason,
       original_definition = excluded.original_definition, updated_at = now()
returning id into v_entry;
delete from goal_bank_steps where entry_id = v_entry;""")
        if g["steps"]:
            vals = ",\n  ".join(
                f"(v_entry, {s['n']}, {q(s['text'])}, {q(s['level'])})" for s in g["steps"])
            parts.append(
                "\ninsert into goal_bank_steps (entry_id, step_number, description, prompt_level)"
                f" values\n  {vals};")
    parts.append("\nend $seed$;\n")
    pathlib.Path(out_path).write_text("".join(parts), encoding="utf8")


def main():
    xlsx = sys.argv[1] if len(sys.argv) > 1 else "Goal Bank.xlsx"
    here = pathlib.Path(__file__).resolve().parent
    flags = collections.Counter()
    entries = [shape(g, flags) for g in parse(read_rows(xlsx))]

    drafts_path = here / "goal-bank-drafts.json"
    drafts = json.loads(drafts_path.read_text(encoding="utf8")) if drafts_path.exists() else []
    entries += drafts

    # Refuse to emit a colliding set. The generated SQL upserts on
    # (clinic_id, code), so two entries sharing a code do not fail - the second
    # silently replaces the first. Six drafted Joint Attention goals were
    # numbered JA2.01..JA2.06, which are real codes in the bank, and they
    # overwrote six real goals without a word. The count in the migration
    # header was the only thing that noticed, and only because it was checked.
    counts = collections.Counter(g["code"] for g in entries)
    clashes = {c: n for c, n in counts.items() if n > 1}
    if clashes:
        raise SystemExit(
            "duplicate goal codes would silently overwrite each other: "
            + ", ".join(f"{c} x{n}" for c, n in sorted(clashes.items())))

    header = (here.parent / "tools" / "goal-bank-header.sql").read_text(encoding="utf8")
    emit(entries, here.parent / "migrations" / "0056_import_2026_goal_bank.sql", header)

    print(f"{len(entries)} entries, {sum(len(g['steps']) for g in entries)} steps")
    print(f"domains: {len({g['domain'] for g in entries})}, "
          f"sub-domains: {len({(g['domain'], g['sub_domain']) for g in entries if g['sub_domain']})}")
    for f, n in flags.most_common():
        print(f"  {n:4}  {f}")


if __name__ == "__main__":
    main()
