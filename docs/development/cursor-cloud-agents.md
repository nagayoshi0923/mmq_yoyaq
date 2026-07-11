# Cursor Cloud Agents 運用

GitHub の Issue 整形・自動実装・PRレビュー・マージ順判定は Cursor Cloud Agents で実行する。
GitHub Actions はイベント受信、結果検証、ラベル・コメント・Discord 通知だけを担当する。

## 必須設定

1. Cursor Dashboard の Integrations で、このリポジトリへの GitHub アクセスを有効にする。
2. Cursor Dashboard の Integrations、または Team Settings の Service accounts で API key を発行する。
3. GitHub の Repository settings > Secrets and variables > Actions に次を登録する。

| 種別 | 名前 | 用途 |
|---|---|---|
| Secret | `CURSOR_API_KEY` | Cloud Agent の起動 |
| Variable（任意） | `CURSOR_MODEL` | 使用モデル。未設定時は `auto` |

Team Admin API key は Cursor Cloud Agents の認証には使用できない。
個人キーまたはエージェントスコープのTeam Service Accountキーを使用する。

## 自動化フロー

- Issue作成: Cursorが内容を整形し、Actionsが検証後にラベル・本文を反映
- `ai-todo`: `staging` を起点にCursorが実装し、PRを自動作成
- PR作成: Cursorがplanモードでレビューし、Actionsがコメントを投稿
- PRレビュー結果:
  - `review-ok`: `【▶N】`順にstagingへマージ
  - `changes-requested`: PRへ `@cursor 指摘を修正して` とコメント
  - `needs-human`: 方針を人間が判断し、Discordにも通知
- 複数PR: Cursorが依存順を返し、Actionsがタイトルへ `【▶N】` を付与
- stagingへのpush: staging→mainのrelease PRを自動作成・更新
  - `【🛑待機中】`: staging向けPRを先に処理
  - `【🛑DB確認】`: 本番DBへmigrationを先行適用
  - `【✅本番反映可】`: 人間がmainへマージ可能
- `@cursor` メンション: 信頼済みメンバーからの指示のみ実行
- 自動処理失敗: `automation-failed` とDiscord通知で人間へ戻す

Cloud Agentには `GITHUB_TOKEN` を渡さない。GitHubへの書き込みは、Actions側が構造化結果を検証してから行う。

## 安全条件

- 自動実装は `staging` 起点、PRのbaseも `staging` であることをActions側で再確認する
- mainへの自動マージ・pushは行わない
- DB migrationを含むrelease PRは、`db-applied`ラベルが付くまでmainへマージできる状態にしない
- fork PRでは `CURSOR_API_KEY` を使用するジョブを起動しない
- 外部起票Issueは、人間が回答・承認するまで自動実装しない
- Cursorの出力JSONが不正、PRが未作成、またはbaseが違う場合は自動修復せず停止する

## SDKランナー

Cursor SDKはアプリ本体から分離し、`scripts/cursor-cloud/` のNode 24専用パッケージで管理する。

```bash
npm ci --prefix scripts/cursor-cloud
node --check scripts/cursor-cloud/run.mjs
npm audit --prefix scripts/cursor-cloud
```

SDK更新時は、Cloud Agentの起動・結果取得・PR URL取得の互換性を確認する。

## キーの失効・ローテーション

`CURSOR_API_KEY` を失効すると、Cloud Agentジョブは失敗し、Issue系フローではDiscordへ通知される。
新しいキーをGitHub Secretへ上書きした後、失敗したworkflowを再実行する。

Cursor契約や利用形態を変更する場合も、GitHub Actions側の実装は変えず、利用可能な個人キーまたはService Accountキーへ交換する。
