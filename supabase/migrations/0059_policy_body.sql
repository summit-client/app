-- 0059 · A policy can hold its own text
--
-- The Policies & Handbook screen previews a policy two ways: an embedded
-- document when the policy has a URL, and the policy's text when it does not.
-- The second path has never worked against a real database, because
-- `hr_policies` has no column to put text in. apps/employee/lib/hr-backend.ts
-- maps `content: null` unconditionally, which reads like an oversight and is
-- not one - there was nothing to map.
--
-- The effect: the starter policies shipped in hr-store.ts preview fine, and
-- every policy an administrator actually creates previews as "This policy's
-- document has not been attached yet." A clinic that types its Right to
-- Disconnect policy into the system gets a screen that says it has no policy.
--
-- `body` rather than `content` to match the column naming the rest of this
-- schema uses for long text (forum_posts.body, messages.body,
-- family_observations.body).
alter table hr_policies add column if not exists body text;

comment on column hr_policies.body is
  'The policy text, for a policy that lives in Summit rather than in an '
  'external document. Either this or document_url carries the policy; a row '
  'with neither previews as nothing, which is what the screen now says '
  'explicitly rather than implying the document failed to load.';
