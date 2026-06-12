# クライアント状態の保存先ガイド

作成: 2026-06-12（リファクタリング Phase 3 の棚卸し結果）

「このUI状態はどこに保存されているか？」に1ファイルで答えるための文書。
新しく状態を永続化するときは、**生の localStorage/sessionStorage を直接触らず**、
以下の表から適切なフックを選ぶこと。

## フック一覧と使い分け

| フック | 保存先 | 用途 | 例 |
|---|---|---|---|
| `useLocalState` | localStorage | セッションをまたいで残したい汎用設定 | フィルタのデフォルト、店舗選択 |
| `useSessionState` | sessionStorage | タブを閉じたら消えてよい一時状態 | タブ内の絞り込み状態 |
| `useUserPreference` | localStorage（ユーザーIDをキーに含む） | ログインユーザーごとに分けたい設定 | 店舗フィルタの個人設定 |
| `usePageState` | sessionStorage（pageKey単位） | ページのフィルタ・検索条件の保存/復元 | スタッフ管理の検索条件 |
| `useTablePreferences` | **DB** (user_table_preferences) | テーブル列の表示/順序（端末をまたぐ） | 各管理テーブルの列設定 |

## スクロール復元（統一済み・2026-06）

**`RouteScrollRestorationProvider`（AppRoot 登録）が全ルートを自動処理する。**
ページ側で手書きの scroll 保存/復元を実装しないこと。

- データロード完了まで復元を遅らせたいページ：
  `useReportRouteScrollRestoration('page-key', { isLoading })` を1行書く
- 月送り等で「現在ルートの保存位置だけ消したい」：`useRouteScrollControls()`
- 下位ユーティリティ `useScrollRestoration.ts`（`saveScrollPositionForCurrentUrl` 等）は
  Provider と画面遷移直前の保存用。新規ページが直接使うのは `saveScrollPositionForCurrentUrl` のみ。
- `usePageState` の scrollRestoration オプションは**常に false**（Provider に統一済み）

## フックを通さない生キー（特殊用途・現状維持）

| キー | 場所 | 理由 |
|---|---|---|
| `returnUrl` / `oauth_mode` / `auth_error` | sessionStorage | 認証フロー（リダイレクト間の受け渡し） |
| `chunk-*` | sessionStorage | チャンクロード失敗時の自動リロード制御（main.tsx） |
| `shift_draft_*` | localStorage | シフト下書き（スタッフ×月単位の動的キー） |
| `readNotificationIds` | localStorage | 通知既読管理 |
| `hidden_played_scenarios` / `deleted_played_scenarios` / `played_scenarios_date_overrides` | localStorage | プレイ履歴のローカル上書き |
| `webp-support` | localStorage | 画像形式サポート判定キャッシュ |
| `scheduleCurrentDate` / `scheduleStaff` / `scheduleStores` / `scheduleScenarios` / `scheduleHasLoaded` | session/local | スケジュール画面の表示状態（Phase 4 でフック化を検討） |
| `scenarioEditDialogTab` / `scenarioMasterEditDialogTab` | localStorage | 編集ダイアログの最終タブ記憶 |
| `booking-data-snapshot-v1-*` / `${CACHE_PREFIX}*` | session/local | データキャッシュ（独自の versioning あり） |

## 過去の罠

- ScenarioManagement に手書きのスクロール復元（`scenarioScrollY`）が残っており、
  標準 Provider と**二重に復元が走っていた**（2026-06-12 に標準へ統一して解消）。
  同様の手書き実装を見つけたら Provider への置き換えを検討すること。
