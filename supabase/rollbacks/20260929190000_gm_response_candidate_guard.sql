-- Revert frontend/API and Discord callers before dropping this new service-only RPC.
DROP FUNCTION IF EXISTS public.save_gm_response_atomic(uuid,uuid,uuid,jsonb,jsonb,jsonb);
