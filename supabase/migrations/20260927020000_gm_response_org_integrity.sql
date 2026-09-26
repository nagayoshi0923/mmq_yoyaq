-- GM回答の所属を予約・スタッフ双方に一致させる。
-- 旧7件のスタッフ所属不一致は推測修正せず、NOT VALIDで保持する。
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE UNIQUE INDEX staff_id_organization_id_key ON public.staff(id, organization_id);
CREATE UNIQUE INDEX reservations_id_organization_id_key ON public.reservations(id, organization_id);
ALTER TABLE public.gm_availability_responses
  ADD CONSTRAINT gm_responses_staff_org_fkey
  FOREIGN KEY (staff_id, organization_id) REFERENCES public.staff(id, organization_id)
  ON DELETE CASCADE NOT VALID;
ALTER TABLE public.gm_availability_responses
  ADD CONSTRAINT gm_responses_reservation_org_fkey
  FOREIGN KEY (reservation_id, organization_id) REFERENCES public.reservations(id, organization_id)
  ON DELETE CASCADE NOT VALID;
ALTER TABLE public.gm_availability_responses VALIDATE CONSTRAINT gm_responses_reservation_org_fkey;
COMMENT ON CONSTRAINT gm_responses_staff_org_fkey ON public.gm_availability_responses IS
  '旧所属不一致は履歴保持し未検証。新規/参照変更を同組織に限定。既存データの事実確認後にVALIDATEする。';
NOTIFY pgrst, 'reload schema';
COMMIT;
