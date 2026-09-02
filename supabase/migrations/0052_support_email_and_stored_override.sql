-- 0052 · Support reports go to info@summitclient.io
--
-- `support.devEmail` is where every portal's "Troubleshoot / request a
-- feature" report is addressed. Its default was dev@summitclient.io and is now
-- info@summitclient.io.
--
-- Changing the default in packages/settings is not enough. `getSetting`
-- resolves a stored org_settings row ahead of the registry default, so any
-- clinic that has ever opened the settings screen and saved is still pointed
-- at the old address - and the failure is silent, because a mailto: to a dead
-- inbox looks exactly like a working one from the reporter's side.
--
-- So the stored rows move too, but only the ones that still hold the old
-- default. A clinic that deliberately set their own address keeps it: this is
-- a correction to a value nobody chose, not a reset of one they did.
update org_settings
   set value = to_jsonb('info@summitclient.io'::text)
 where key = 'support.devEmail'
   and value #>> '{}' = 'dev@summitclient.io';

-- Role and user scopes exist for this key too, in principle. Same rule.
update role_settings
   set value = to_jsonb('info@summitclient.io'::text)
 where key = 'support.devEmail'
   and value #>> '{}' = 'dev@summitclient.io';

update user_settings
   set value = to_jsonb('info@summitclient.io'::text)
 where key = 'support.devEmail'
   and value #>> '{}' = 'dev@summitclient.io';
