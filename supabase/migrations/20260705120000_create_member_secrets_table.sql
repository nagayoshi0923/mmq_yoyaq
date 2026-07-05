-- #281 / #283: ゲストPINをmembersテーブルから分離した秘匿テーブル。
--
-- 背景（#280 監査）:
--   private_group_members は RLS が USING(true) の全開放で、anon から access_pin を
--   直接 SELECT できてしまう（本番検証済み）。列単位 GRANT は PostgREST の埋め込み取得と
--   相性が悪く permission denied を招くため使えない（#281 コメント参照）。
--   よって PIN を別テーブルへ分離し、RLS で全ロール遮断、SECURITY DEFINER RPC のみが
--   アクセスできる構成にする。ハッシュ化（#283）も同時に満たす。
--
-- failed_attempts / locked_until は #282（レート制限）で使用する器も兼ねる。

CREATE TABLE IF NOT EXISTS public.private_group_member_secrets (
  member_id       UUID PRIMARY KEY REFERENCES public.private_group_members(id) ON DELETE CASCADE,
  access_pin_hash TEXT NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.private_group_member_secrets ENABLE ROW LEVEL SECURITY;

-- RLS 有効・ポリシー無し = anon / authenticated からの直接アクセスは一切不可。
-- SECURITY DEFINER 関数（テーブル所有者権限で実行）だけが読み書きする。
-- 念のため明示的にテーブル権限も剥奪しておく。
REVOKE ALL ON public.private_group_member_secrets FROM anon;
REVOKE ALL ON public.private_group_member_secrets FROM authenticated;

COMMENT ON TABLE public.private_group_member_secrets IS
  'ゲストPINのbcryptハッシュと認証試行状態。RLSで全ロール遮断し、SECURITY DEFINER RPCのみアクセス可（#281/#283）';
