# CLAUDE.md

開発ルールの詳細はすべて `.cursorrules` を参照すること。

---

## 🚨 最重要ルール（必ず守ること）

### ブランチ戦略

**main・staging への直接コミット・プッシュは絶対禁止。**

作業開始前に必ず以下を確認・実行すること：

```bash
git branch --show-current   # 現在のブランチを確認
# main または staging にいたら↓
git checkout -b feature/xxx  # または fix/xxx
```

**PRの向き先は常に staging ブランチ**（staging → main のマージはユーザーが判断する）。

### デプロイフロー

```
feature/* で実装
  → staging へ PR 作成（AI の作業はここで止める）
  → ユーザーがステージング確認
  → ユーザーが staging → main にマージ（本番デプロイ）
```

DBマイグレーションがある場合：本番DBへの適用（`npm run db:push:prod`）はユーザーが判断する。**DB変更 → フロントデプロイの順序を絶対に守ること。**

### AIがやってはいけないこと

- main への直接コミット・プッシュ
- ユーザー確認なしに staging → main をマージ
- 本番DBへのマイグレーション適用（`db:push:prod`）を勝手に実行
