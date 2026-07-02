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
