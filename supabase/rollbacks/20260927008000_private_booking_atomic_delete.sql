-- Revert frontend first. No data is changed by this rollback.
DROP FUNCTION IF EXISTS public.delete_private_booking_request_atomic(uuid);
