-- SEC-P0-02 TS-1: auth.uid() が期待通りか確認（1行返る）
-- 使い方:
--   <customer_user_id> を TS-0 の結果で置換して実行
SELECT
  set_config('request.jwt.claim.sub', '<customer_user_id>', true) AS _sub,
  set_config(
    'request.jwt.claims',
    json_build_object('sub', '<customer_user_id>'::uuid)::text,
    true
  ) AS _claims,
  auth.uid() AS uid,
  current_setting('request.jwt.claim.sub', true) AS claim_sub;

