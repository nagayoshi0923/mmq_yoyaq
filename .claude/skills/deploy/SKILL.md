---
name: deploy
description: staging → main の本番反映フローを一括実行する。ユーザーが「本番に反映して」「mainにマージして」「デプロイして」と言ったときに使う。開いたPRの整理 → DBマイグレーション先行適用 → リリースPRの取り込み → 本番確認 の順序を保証する。
---

# 本番反映フロー（staging → main）

このスキルは**ユーザーから本番反映の明示的な指示があったときのみ**実行する。
指示なしに勝手にマージしない。**force push は常に禁止。**

## 手順（必ずこの順序で）

### 1. 事前チェック

```bash
gh pr list --base staging --state open          # 開いたPR（取り込むか閉じる）
gh pr list --base main --state open             # release-pr.yml が作ったリリースPR
```

- リリースPRは staging への push ごとに `release-pr.yml` が作る（squash のため `git log` の分岐比較は使わない）
- リリースPRの本文と Deploy Guard のコメントで、含まれる変更と未適用DBの有無を確認する

### 2. DBマイグレーションの確認・適用（DB が先！）

```bash
npm run db:status
```

- 未適用マイグレーションがある場合:
  1. 内容（ファイル名と何をするか）をユーザーに提示
  2. `npm run db:push:prod` で本番DBに適用
  3. 確認クエリで結果を報告（テーブル/カラム/関数の存在確認）
- **鉄則: 本番DB適用 → staging→main マージ → Vercel 確認（Edge/supabase 変更時は deploy-supabase も確認）。逆は絶対禁止**（存在しないカラム参照で本番エラーの事故実績あり）。正は alwaysApply の `git-deploy.mdc`。マージ前に Edge を配備しない。手動 `functions:deploy:prod` はしない

### 3. リリースPRの取り込み

- DB適用が必要な場合は、本番適用の成功後にリリースPRへ `db-applied` ラベルを付ける
- タイトルが【✅本番反映可】になったら squash merge する（【🛑】のままでは取り込まない。force merge しない）
- main への直接 push・`git merge origin/staging` はしない

### 4. Edge / フロントの確認（マージ後）

- マージ後は Vercel 本番デプロイの成功を確認する
- `supabase/functions` 等（`deploy-supabase.yml` の paths）に変更があるときだけ `deploy-supabase` の成功も確認する（該当差分が無い main マージではジョブ自体が走らない）
- 手動 `npm run functions:deploy:prod` は実行しない（自動ジョブと競合し、ローカル checkout 由来の誤配備になり得る）

### 5. 報告

- 反映したコミットの要約（`git log` から主なもの）
- DBマイグレーション適用の有無と結果
- Vercel が本番デプロイを開始したこと
- 本番でひと通り確認すべき画面（変更内容から1〜3項目、ページ名・たどり方つきで）

## Discord入室経路の更新（QW-20260912-017）

`senshin-discord-join` を配備するときは、本番だけの修正がGit管理内容で戻らないよう、配備前に対象のコード・verify_jwt設定を照合する。設定は `supabase/config.toml` の明示値と、両環境の `NO_VERIFY_JWT_FUNCTIONS` をそろえる。`node scripts/check-discord-join-release.mjs` が不合格なら配備しない。

配備後は対象環境の `SUPABASE_PROJECT_REF` を指定して `node scripts/check-discord-join-release.mjs --live` を実行する。顧客と同じ認証ヘッダなしのGETで、参加・観戦リンクがDiscord認証へ302、不正リンクが400になることを確認する。架空の予約IDで入口だけを検査し、Discordへの権限付与や通知を発生させない。CIは結果を90日保存する。この検査は入口の検査であり、顧客本人の認証完了・全員の入室確認とは別に記録する。

障害調査では保存期限内に本番のアクセス時刻・更新履歴・Discord監査を照合し、秘密情報を除いた根拠を会社Driveへ残す。HTTP302だけで入室成功とせず、認証callbackと対象チャンネルの権限付与も照合する。ログが保存期限を過ぎたことを「実行がなかった」と言い換えない。

利用者訂正：初参加者にもメールの再クリックを要求しない。Discordの本人同意（identify + guilds.join）でサーバー参加から予約別チャンネルへの転送まで進める。参加状況の照会失敗を未参加と誤判定せず停止する。検証は参加済み/初参加と参加者/観戦者の4通りを含め、入口だけでなく本人認証・サーバー参加・権限付与の順序も確認する。
