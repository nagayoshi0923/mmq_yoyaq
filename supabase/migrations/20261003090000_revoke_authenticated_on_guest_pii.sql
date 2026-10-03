-- #280 / #284 の残り: ゲストの個人情報（名前・メール・電話・PIN のハッシュ・ロック状態）の表に、
-- ログインした利用者が直接アクセスできる権限が残っていた。
-- RLS は is_staff_or_admin()（どこかの組織のスタッフなら真）だけで判定しており、組織を見ていないため、
-- どの組織のスタッフでも、他の組織の貸切グループのゲスト情報を読み書きできた（ロック解除・PIN の付け替えも可能）。
-- アプリはこの表を直接使わず、所有者権限で動く関数（join_private_group / authenticate_guest_by_pin_v2・v3 /
-- save_guest_access_pin / sync_private_group_member_pii）だけが使うので、直接の権限を外す。
REVOKE ALL ON TABLE public.private_group_members_pii FROM authenticated;
REVOKE ALL ON TABLE public.private_group_members_pii FROM anon;
