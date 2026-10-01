# A本人確認修正：匿名閲覧・正規ゲストの境界

2026-10-01。反映前確認。Aだけの公開候補であり、B1/receipt/定員変更は含めない。

## 依存と正当な操作

- 対象4 RPCは予約作成新版・旧wrapper・人数変更・旧日程変更の書込み。src/api/Edge検索では、現アプリの新版作成と人数変更は`api/reservations.ts`のuser-scoped JWTから呼ぶ。旧wrapper/旧日程変更を呼ぶ公開画面は見つからない。
- 本番・staging全public関数の本文依存検索でも、対象RPCを呼ぶ関数は旧作成wrapperだけ。公開読取・正規guestからの依存は見つからない。動的SQLや管理外clientまで不存在と保証するものではない。
- 正規ゲストの招待previewは`private_group_read_snapshot`、PINは`authenticate_guest_by_pin_v3`、参加は`join_private_group`、回答/チャット等はguest token付き`private_group_member_action`。本番・stagingでanon EXECUTEあり。Aはこれらの本文/権限を変更しない。
- 貸切の主催者による予約申請`create_private_booking_request_with_notice`は現物でもanon EXECUTEなし。通常予約確定・待機列登録・貸切申請主催者は現UIでもログイン必須。
- 予約確認/変更/取消の通常顧客はMyPage/APIの認証経路。ゲストの共有招待と、他人の予約IDだけによる未認証操作を混同しない。既存取消RPC/専用group取消の権限・本文は変更しない。

## 公開読取

A migrationは表/列/RLS/SELECT権限を変更しない。隔離回帰に公開view/RPCを置き、A適用前後の全既存表ACL/RLSと公開RPC ACL不変、およびanon実ロールでの日程/残席SELECT成功を追加した。

現物の公開SELECTはschedule_events_public、schedule_events、organizations、booking_notices、business_hours_settingsにある。stores/scenario_masters/organization_scenarios等には匿名直接SELECTが無いものがあり、現行の公開API等で提供される。ルールの古い一律GRANT案内を根拠に再付与しない。Aではこの既存構造を変えない。

## 実行結果と限界

- 適用前の本番 https://mmq.game/ を新規匿名ブラウザ、GET以外/分析通信遮断で確認。公開作品一覧と作品詳細（公演日程・残席）が表示され、ログイン壁にならない。
- Aを含むローカル実予約確認画面＋Auth/APIモックで、認証中断後も画面表示、確定は「ログインが必要です」、API書込み0を確認。
- 既存guest PIN/session/member action、private group atomic create/deletionの隔離回帰を実行し成功。実PINを発行/送信せず、人工データだけを使用。
- 固定された実招待コードを使う旧anon-inviteテストは、既存利用者データを読み出すため今回は実行していない。
- これらをA適用後の実Auth・実DB一続き受入と同一視しない。専用顧客2/スタッフ1の手動作成/ログインが未完了なら、正規業務の実Auth受入は保留する。本番前にこのgateの状態を明示する。

公開候補で134隔離ケース（元130＋匿名read不変4）、全体1308テスト、verifyが成功。GitHub CI結果とstaging適用結果は別記録。

## 配備互換の追加

初回A SHA738442f1のCI/E2EはNode20で成功したが、Vercel PreviewはNode20提供終了のためビルド開始前に失敗。公式配備画面の案内に従いpackage.json/lockのengineとCI/E2Eを24.xへ揃える。DBや認可契約は追加変更しない。Node24のexact SHA CI/Previewを別途回収し、20での成功を24の合格と扱わない。
