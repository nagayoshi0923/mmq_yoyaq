-- Revert frontend first. Existing groups and their children are preserved.
DROP FUNCTION IF EXISTS public.create_private_group_atomic(uuid,uuid,text,uuid[],jsonb,text);
