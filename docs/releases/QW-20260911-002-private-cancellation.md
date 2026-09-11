# 貸切取消の担当GM通知

キャンセル・公演中止・削除をDBで検知し、担当GMごとに送信待ちを同じトランザクションで記録する。顧客へのメール送信の有無に依存しない。最終顧客予約の取消を判定し、スタッフ参加予約は顧客残数に含めない。通常公演と既存予約RPCの条件は変更しない。

同一公演・取消世代・担当スタッフのキーで重複を防ぐ。復活後は世代を更新し、配送時に古い世代を抑止する。削除後は取消時のスナップショットを使用する。配送claimは期限と試行回数を照合して競合を防ぎ、期限切れの処理を回収する。

既存5分間隔cronから配送。通信失敗・設定不備は最大3回試行して、queueのfailed/last_errorへ残す。管理者が原因を解消した後、該当通知だけretry_count=0、status=pending、next_retry_at=now()へ戻すと再送する。送信成功後のDB通信断など配送結果が不明な場合はDiscord nonceでも重複を抑制するが、外部サービスを跨ぐ厳密な一度だけの送信は保証しない。

## 配備

1. migration `20260911090000_private_cancellation_notifications.sql`をstaging、次に本番へ適用。
2. `retry-discord-notifications`と旧クライアント互換の`notify-private-booking-cancelled-discord`だけを配備。
3. Webの旧通知呼出しを削除した差分を反映。

既存キャンセルの遡及送信は行わない。実顧客の予約を検証用に取り消さず、スタッフへのテスト投稿は行わない。

## ロールバック

先に以下の2トリガーを削除して新規記録を停止する。既存キューは削除せずprivate_cancellationの未送信分を調査する。以前のEdgeコードとWebを戻す。epoch列は残してよい。

```sql
DROP TRIGGER IF EXISTS private_cancellation_event ON public.schedule_events;
DROP TRIGGER IF EXISTS private_cancellation_reservation ON public.reservations;
```

## 検証結果

- `npm run verify` 合格（型・lint・セキュリティ検査・ビルド）。
- 配送のVitest 6件合格（組織分離、二重起動、HTTP再送、通信/設定失敗、復活抑止、処理期限切れ回収）。外部送信はモック。
- `scripts/test-private-cancellation-db.mjs` をPGliteで実行し、最後の顧客取消、checked_in保持、中止→削除の重複防止、復活/再取消、スタッフ参加除外、再予約INSERT、未設定宛先保持、他組織分離、rollbackを検証。
- staging実スキーマで取消→通知記録→復活→旧通知無効化を確認し、トランザクション全体をROLLBACK（実送信なし）。
- 独立レビューで復活/削除と並行再送の境界を補強し、再検収済み。
- DB配備は今回の1件のみ。既存未適用20260831010000を除外。remoteにだけ存在する適用済み10バージョンは一時配備ディレクトリの履歴対応用に保持し、DB履歴のrepairは行わない。
