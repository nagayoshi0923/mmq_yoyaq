-- Sessions are disposable authentication state; business records remain intact.
DROP FUNCTION IF EXISTS public.private_group_member_action(uuid,uuid,text,jsonb,text);
DROP FUNCTION IF EXISTS public.join_private_group(text,text,text,text,text);
DROP FUNCTION IF EXISTS public.require_private_group_member(uuid,uuid,text);
DROP FUNCTION IF EXISTS public.authenticate_guest_by_pin_v3(uuid,text,text);
DROP FUNCTION IF EXISTS public.issue_private_group_guest_session(uuid);
DROP TABLE IF EXISTS public.private_group_guest_sessions;
