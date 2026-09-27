# 旧グループ取消RPCの直接実行閉鎖

案件 QW-20260917-001。通知付き取消入口の本番受入後にのみ適用する。

`cancel_reservation_and_group_with_lock(uuid,uuid,text)` のPUBLIC・anon・authenticatedの実行権限を閉じ、通知を省略する直接経路をなくす。所有者postgres経由の通知付き入口と、既存service_role権限は維持する。通常取消の別RPCやRLSは変更しない。

実装の旧RPC呼出元は通知付きRPCのみ。検証DBの実ACLも確認済み。ロールバックは元のPUBLIC・anon・authenticated権限を復元する。

隔離DBで旧入口の認証済み・匿名拒否、新入口経由の実取消・通知、通知失敗時の予約・グループ・人数の全体取消、service_role実行権限維持、復元再適用を確認した。実予約取消・通知は実施していない。

DDL: `supabase/migrations/20260927040000_close_legacy_group_cancellation.sql`。
復元: `supabase/rollbacks/20260927040000_close_legacy_group_cancellation.sql`。

現在は未適用。顧客グループ取消、直接RPC経由の取消期限、料金記録、店舗却下の公演連動、全域棚卸しは引き続き未完了。
