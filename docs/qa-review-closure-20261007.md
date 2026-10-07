# 顧客QA追加レビュー是正（2026-10-07）

対象はPR964/965の全12コメントをまとめた10論点。最新main6f288dから独立統合。通知の予約履歴だけの許可/metadata入力、配送前消費、クーポン条件・回数、公開timing、冪等payload、複数顧客、通信失敗候補削除、旧匿名rollbackを是正。

- 保存済み取消/人数減少のDBintentを作成。actor本人・同組織スタッフ・既存systemのみclaim可、実空席も照合。公演metadataはDB正本。
- per-recipient lease、固定送信payload/冪等キー、成功受付後だけnotified。失敗はwaiting、既存5分cronが再試行。結果不明が送信事業者の24h重複防止期限を超える前（23h）に自動再送を保留し、requires_reviewへ。顧客が新たな通知契機を作っても不明な配送を重ねない。
- グループcouponは未確定日時/店舗を保留（割引0・未消費）し確定時に共通条件判定。既存coupon_usagesに使用を記録し回数を原子的消費。同じ操作の再試行は再消費せず、解除/切替は同じTXで戻す。
- timingは顧客 `/api/scenarios?type=public` と同じorg available条件。master draft/pendingを一律除外せず、公開可否を揃える。
- 新規通常予約は全再送payloadを保存して比較。旧予約の未保存流入元は推測せず不一致を拒否。
- UID本人の複数顧客行から体験履歴を統合。upsertは入力email一致→共通→対象org→既存の順、検索errorを新規扱いしない。
- 必要取得に失敗した貸切候補は保持、送信を止めて再試行を案内。取得成功後だけ最新条件で削除。
- 旧権限/旧配送本体へ戻すrollbackは廃止し、データと安全ACLを維持するforward復旧に置換。

## 検証

修正前coupon再現は不変rules_snapshotへのUPDATEが保持されないことに注意し、条件付きの架空新規couponでやり直した。旧関数1000円適用・新関数P0028拒否を同じ条件で実証。

独立Postgres実SQL回帰30項目、React候補取得失敗/選択保持、複数顧客履歴統合/upsert、全単体1738件合格。実Auth/取消RPC/Edge/DBで失敗503・waiting保持、12並列再試行でsink1件、入力metadata無視、完了後再試行0件。coupon12並列適用で使用1回、8並列解除で復元1回。

実通知・顧客データを使ったテストなし。専用internal Docker/localhost、外部メールsink。実機/Safari未検証。既存の旧キュー/旧グループ割引を本番で検索・改変・自動backfillしていない。今回の新しい操作と次の確定時検証が対象で、過去データの監査/是正は別途安全な手順が必要。

## 配備順

20261007110001: 通知intent/lease/固定payloadの準備DB。
20261007110002: coupon条件と使用履歴の準備DB。
20261007110003: 全payload比較/公開timingのDB。
notify-waitlist + process-waitlist-queueを先行配備。
20261007110004: 旧の送信前消費RPC権限を停止する有効化DB。
その後API/UI。release-scopeのprepare-edgesはactivation04をdeferしprepare01の実適用を必須とする。

## 復旧

DB intent/使用履歴/認可と新Edgeを維持してAPI/UIのみ復旧するか、検証済みforward修正を実施。旧匿名権限や送信前消費へ戻さない。各rollbackファイルは安全ACLを再保証しデータを削除しない。DB失敗時は同じmigrationの再試行/修正版を優先し、不明な配送は送信履歴を照合してから扱う。
