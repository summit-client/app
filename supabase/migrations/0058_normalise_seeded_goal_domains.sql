-- 0058 · The seeded goal bank rows join the same domain vocabulary
--
-- 0002 seeded seven entries for the Functional Requesting cluster, with the
-- domains "Expressive communication" and "Receptive communication". The 2026
-- import writes "Expressive Communication" and "Receptive Communication".
--
-- Two spellings of one domain is not cosmetic here: the Goal Generator filters
-- by domain, so a clinician picking "Expressive Communication" would see 86
-- goals and silently not see the six seeded ones. The bug is invisible from
-- the screen, because a filter that returns results looks like it worked.
--
-- Case-insensitive so this cannot miss a third spelling, and scoped to the
-- exact strings 0002 wrote rather than to a pattern, so a clinic that has
-- deliberately created a differently-named domain keeps it.
update goal_bank_entries
   set domain = 'Expressive Communication'
 where lower(domain) = 'expressive communication'
   and domain <> 'Expressive Communication';

update goal_bank_entries
   set domain = 'Receptive Communication'
 where lower(domain) = 'receptive communication'
   and domain <> 'Receptive Communication';
