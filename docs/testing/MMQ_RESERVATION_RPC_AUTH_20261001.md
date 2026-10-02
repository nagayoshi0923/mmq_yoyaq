# 予約RPCの本人・組織認可 — 独立修正A

状態：ローカル実装・隔離検証済み。2026-10-01、ユーザーがA専用CI→staging→実受入→本番DB/APIの反映を承認。共有適用の実績・実Auth gateは各段階で別途記録する。匿名互換は `MMQ_AUTH_ANONYMOUS_COMPAT_20261001.md`。

基準はmain `5d3ad33734dc2170455d87b1873c8a7e7190a465`。読み取り時のstagingは `e3d936c4fee49b7a35412a4d1b6237e40196d17d`。PR703/706、保留GM、定員保持prototypeを取り込んでいない。

## 根因と変更対象

顧客IDは対象の識別子であり、本人証明ではない。旧人数変更は渡されたID一致だけで許可し、旧通常作成は匿名UIDとゲストのuser_idが両方NULLの場合を通していた。追加棚卸しで、旧日程変更にも同じNULLの問題と組織未確認の管理者例外を確認した。

|入口|従来|今回のDB境界|
|---|---|---|
|`create_reservation_with_lock_v2`|顧客ID＋NULL比較、管理者の組織未確認|UID必須、顧客本人または対象組織の業務担当者。代理する組織付き顧客は公演と同組織|
|`create_reservation_with_lock`|旧引数のwrapperから新版へ|署名・委譲を維持し、匿名EXECUTEを撤去。新版で本人を再確認|
|`update_reservation_participants`|customer_id指定時はID一致のみ|ロックした予約→顧客→user_idで本人を確認。旧引数は対象照合だけに利用|
|`change_reservation_schedule`|NULL顧客の匿名通過、組織未確認admin|UID必須、本人または対象組織の管理者。旧日程変更の管理者権限を広げない|

`reservation_actor_is_org_operator(uuid)`を内部専用の共通判定として追加。既存`get_user_organization_id()`を使い、対象組織が非NULL・所属一致・組織管理者またはactiveスタッフを要求する。ヘルパーはPUBLIC/anon/authenticated/service_roleへ公開しない。4つの外部入口からPUBLIC/anonのEXECUTEを撤去し、既存authenticated/service_roleの明示EXECUTEを維持する。PUBLICの撤去だけでanonの明示権限が残る状態を避ける。

APIは作成・人数変更で同じ本人／組織確認を先行し、DBでも必ず再確認する。人数変更で共用の組織判定を全面改変せず専用経路を使い、取消などへ波及させない。番号重複後の読戻しは公演の組織・対象顧客・公演・人数で限定し、別予約を返さない。受付receiptや完全な再試行方式の導入は別変更。

## 正当な利用者の契約

|利用者|通常作成・人数変更|旧日程変更|
|---|---|---|
|認証済み顧客本人|成功。旧customer_id引数の省略も本人から判断|本人成功|
|users/customersの旧orgが別組織の本人|自己予約は組織横断で成功。顧客は共通モデルという既存ルール/APIの意図に一致|本人成功|
|対象組織のactiveスタッフ|代理操作成功。DBの顧客未紐付け予約も可|既存の管理者専用業務権限は拡張しない。自己予約は可|
|対象組織のadmin|代理操作成功。staff行がない既存招待管理者も維持|成功|
|on-leave|既存通りadminは可。一般staffはactive要件を満たさず代理不可。自己予約は可|既存admin規則を維持|
|inactive/resigned、解除履歴だけ残る旧管理者|業務代理は不可。本人の顧客予約は可|業務代理は不可|
|別組織staff/admin|他人の予約は不可。自己予約は可|同じ|
|license_admin|ライセンス権限だけで店舗の予約権限を新設しない。既存activeスタッフ兼任なら通常のスタッフ業務可|既存の組織admin判定に従う|
|service_role|EXECUTE維持。本人／同組織の確認済みactor文脈があれば成功。UIDなしは拒否|同じ|
|anon／未認証|EXECUTE拒否。ACLが誤って戻っても本文のUID必須で拒否|同じ|

現行のアプリ呼出しは`api/reservations.ts`のuser-scoped JWT。UIDなしserviceとして対象RPCを使う正当な製品呼出しはコード棚卸しで見つからなかった。新しいactor引数、秘密キー、権限付与、認証生成は導入していない。SQL試験のUID設定は人工認証スタブであり、実JWT検証の証拠ではない。

既存staffプロフィールとstaff行の役割が矛盾する場合、APIは確認済みロール、DBは既存有効所属／staff行を使う。曖昧な旧状態に対しAPI権限を自動拡大しない。通常のライフサイクル同期は既存の別DB回帰試験も実行した。

## 移行・互換性・切戻し

- up：`supabase/migrations/20261001090000_reservation_actor_auth.sql`。
- 安全互換down：`supabase/rollbacks/20261001090000_reservation_actor_auth.sql`。
- 表、列、RLS、既存予約データ、金額、定員、ロック順は変更しない。既存データの補正やバックフィルはない。
- 実際の本番/staging関数を取得し、既知の本文hashに一致した場合だけ認可箇所を置換する。stagingだけにある募集停止チェックを維持する。未知の本文・所有者・既存同名ヘルパーは上書きせず全体停止する。
- 顧客とスタッフの旧引数・返値・SQLSTATEを維持。APIではDBの認可拒否を403へ分類する。
- DB→APIの順。旧APIでも修正済みDBを使える。旧APIに戻す場合、旧org付き本人の一部操作は旧API側で拒否されうるが、本人確認を解除しない。
- downは旧顧客org判定だけを戻し、今回の本人／組織ガードと匿名拒否を残す。**既知の穴を戻す完全逆DDLではない。** 個別互換問題は最小前進修正を優先し、全面的に認可を外す復元を自動化しない。これは実装計画Aの復元方針に従う。
- migration再適用・安全down→up、拒否時のデータ不変、未知の本文での停止を隔離DBで試験した。

## 検証

1. 外部ネットワークなしの専用PostgreSQL 17。実取得した本番/staging関数をそれぞれ最小人工スキーマへ載せる。実ロールanon/authenticated/service_roleで実行。認証UID・料金補助・設定読取等の依存は明示したスタブ。期限、実数再集計、作品ID同期は実関数。通知triggerは載せず、履歴はローカルの人工trigger。
2. **130ケース成功**。このうち残件の再現を確認するケースは「残件」と明記し、修正成功数に換算しない。修正前の3欠陥＋旧日程2経路を人工データで再現してからupを検証。拒否時に予約・金額・cache・履歴・couponのスナップショットが不変と確認。
3. 実2接続で、最後の1席の作成、同じ人数への二重変更、別予約の増員競合。`pg_stat_activity`でロック待ちも確認。各環境で1件だけ保存／人数二重加算なし／定員内を確認。
4. API追加21ケース成功。全体は181ファイル・**1,308テスト成功**。`npm run verify`成功。既存staff lifecycleと関連境界13テスト、既存private change policy回帰も成功。
5. CIに専用・外部通信なしPostgreSQLで同じ試験を行うstepを追加、YAML構文検証成功。GitHubでの実CIは未実行（未push）。
6. 既存typecheck/lintは主にsrcが対象。新API helperのstrict型検査と新APIファイルの対象lintは成功。API全体を追加strict検査すると既存のdb nullableエラー2件があり、基準mainでも同じ箇所で再現。今回差分で追加エラーなし。API全域の型ゲートは別残件。

実行例：専用コンテナを`--network none --tmpfs /var/lib/postgresql/data`で作成し、`MMQ_RPC_TEST_CONTAINER=<mmq-reservation-auth-で始まる専用名> npm run test:reservation-actor-auth-db`。専用名とnetwork noneをrunnerが確認する。試験DBは必ずfinallyで削除。実環境URL／資格情報を受け取る経路はない。

既存`npm run test:rpcs`は任意のローカルSupabaseへ接続する全体smokeであり、今回は実行していない。既存共有ローカル環境を触らず、上記の専用SQL試験で対象RPCを実行した。実Auth、全既存trigger、既存通知・決済、全ページ実機受入の合格とはしない。

## 9再現ケースとの対応

|番号|今回の結果|
|---|---|
|1 匿名＋顧客IDで人数変更|閉鎖：ACL＋本文UID必須|
|2 他人＋同じ顧客IDで人数変更|閉鎖：DBで予約顧客のuser_idを照合|
|3 人数変更で割引後額が崩れる|未修正。特性試験で残存を確認。計画C|
|4 古いアプリ集計でcache上書き|未修正。特性試験で残存を確認。計画D|
|5 初回で満席→同番号再試行失敗|未修正。特性試験で残存を確認。計画B|
|6 非公開／受付無効の通常RPC作成|未修正。特性試験で残存を確認。計画B|
|7 作品の互換2列不一致|未修正。両列を指定するINSERTで残存を確認。計画E|
|8 接続TZ依存|未修正。UTCの人工セッションで9時間差を確認。実環境の時刻事故とは断定しない|
|9 匿名＋既存ゲストIDの作成|閉鎖：新版・旧wrapperのACL＋本文UID必須|

追加で旧日程変更の匿名NULL・他組織管理者の経路を閉鎖した。日程変更の手動cache更新、作品・金額の移動契約は未修正。大元の設計レビュー／IMPLEMENTATION_PLAN B〜Gを置き換えない。

## 周辺入口の確認と残件

- `cancel_reservation_with_lock`の2署名：現在は同組織admin/activeスタッフ用。UID確認あり。共用取消の古い`cancel_reservation_and_group_with_lock`はauthenticated/anon EXECUTE撤去済み。今回そのACLや処理を変更していない。
- `admin_update_reservation_fields`：UID・利用者ロール・予約組織を確認する別入口。スタッフ状態の再確認を直接持たない。特に旧管理者プロフィールと停止状態の整合は、通常のライフサイクルを含む別監査対象。今回この別業務RPCの権限を広げたり閉じたりしていない。
- 既存`set_reservation_change_policy_snapshot`の例外判定は個別にusers/staffを参照する。今回の共通判定へ全面移行していない。本人確認とは別に、退職管理者等の期限例外の監査を残す。
- 所有者の再紐付け／スタッフ権限変更と進行中リクエストの競合、実JWT失効はこの隔離試験の範囲外。

## 次の反映判断（まとめて1回）

緊急度は高い。既知の認可欠陥をローカルで再現して閉鎖した。実データでの悪用有無は調査していない。

承認対象は、(1)本独立差分を専用branchへ保存しCI/preview、(2)現在の関数hash/ACLを再取得してこの単一migrationと4入口のACL変更をstagingへ適用、(3)既存専用QAの実認証受入、(4)合格した同一migrationを本番DBへ先行適用しAPIを正規release、(5)定義/実効ACL/公開安全smokeを読戻す、の一組。未知の本文なら停止し再レビューする。全stagingや未適用migrationを一括pushしない。

実Authは顧客2・スタッフ1の安全な専用アカウントの手動認証が別途必要。既存QA fixtureは閉鎖状態のまま。この承認だけでパスワード入力、実顧客予約、通知試験、全体DB補正を許可したものと扱わない。認証が未成立でも本番前の読み取り・ローカルCI準備は進められる。
