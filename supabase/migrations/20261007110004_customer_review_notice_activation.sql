-- notify-waitlist/process-waitlist-queue先行配備後に有効化。
REVOKE ALL ON FUNCTION public.notify_all_waitlist_entries(uuid) FROM PUBLIC,anon,authenticated,service_role;
