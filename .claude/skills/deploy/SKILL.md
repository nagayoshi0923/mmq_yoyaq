---
name: deploy
description: staging → main の本番反映フローを一括実行する。ユーザーが「本番に反映して」「mainにマージして」「デプロイして」と言ったときに使う。分岐チェック → DBマイグレーション先行適用 → マージ＆push → staging resync の順序を保証する。
---

# 本番反映フロー（staging → main）

このスキルは**ユーザーから本番反映の明示的な指示があったときのみ**実行する。
指示なしに勝手にマージしない。**force push は常に禁止。**

## 手順（必ずこの順序で）

### 1. 事前チェック

```bash
git fetch origin
git status --short                               # 未コミットの変更がないこと
git log origin/staging..origin/main --oneline    # 分岐チェック
```

- **分岐チェックで main 側にコミットがある場合は停止**して報告する（hotfix が main に直接入っている可能性）。
  マージ方針（先に main → staging を取り込むか）をユーザーに確認する。
- 未コミットの変更が staging にある場合も停止して報告。

### 2. DBマイグレーションの確認・適用（DB が先！）

```bash
npm run db:status
```

- 未適用マイグレーションがある場合:
  1. 内容（ファイル名と何をするか）をユーザーに提示
  2. `npm run db:push:prod` で本番DBに適用
  3. 確認クエリで結果を報告（テーブル/カラム/関数の存在確認）
- `supabase/functions/` に変更が含まれる場合は `npm run functions:deploy:prod` も実行
- **鉄則: DB変更 → フロントデプロイの順。逆は絶対禁止**（存在しないカラム参照で本番エラーの事故実績あり）

### 3. マージ＆push

```bash
git checkout main && git pull origin main
git merge origin/staging --no-edit
git push origin main
```

### 4. staging を resync

```bash
git checkout staging
git merge --ff-only main   # マージコミットができた場合に staging を追いつかせる
git push origin staging    # 差分がある場合のみ
```

### 5. 報告

- 反映したコミットの要約（`git log` から主なもの）
- DBマイグレーション適用の有無と結果
- Vercel が本番デプロイを開始したこと
- 本番でひと通り確認すべき画面（変更内容から1〜3項目、ページ名・たどり方つきで）

## Discord入室経路の更新（QW-20260912-017）

`senshin-discord-join` を配備するときは、本番だけの修正がGit管理内容で戻らないよう、配備前に対象のコード・verify_jwt設定を照合する。設定は `supabase/config.toml` の明示値と、両環境の `NO_VERIFY_JWT_FUNCTIONS` をそろえる。`node scripts/check-discord-join-release.mjs` が不合格なら配備しない。

配備後は対象環境の `SUPABASE_PROJECT_REF` を指定して `node scripts/check-discord-join-release.mjs --live` を実行する。顧客と同じ認証ヘッダなしのGETで、参加・観戦リンクがDiscord認証へ302、不正リンクが400になることを確認する。架空の予約IDで入口だけを検査し、Discordへの権限付与や通知を発生させない。CIは結果を90日保存する。この検査は入口の検査であり、顧客本人の認証完了・全員の入室確認とは別に記録する。

障害調査では保存期限内に本番のアクセス時刻・更新履歴・Discord監査を照合し、秘密情報を除いた根拠を会社Driveへ残す。HTTP302だけで入室成功とせず、認証callbackと対象チャンネルの権限付与も照合する。ログが保存期限を過ぎたことを「実行がなかった」と言い換えない。
