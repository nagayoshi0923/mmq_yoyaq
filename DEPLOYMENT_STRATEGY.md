# デプロイ戦略とブランチ管理

## 🚨 重要：安全なデプロイフロー

現在、`main`ブランチへのプッシュで本番環境に自動デプロイされます。
**テスト環境なしで本番デプロイは危険**なため、以下の戦略を採用します。

---

## ブランチ戦略

### ブランチの役割

```
main (本番環境 - Production)
  └─ 常に安定した状態
  └─ Vercel: https://your-app.vercel.app

develop (開発環境 - Staging)
  └─ 開発中の機能をテスト
  └─ Vercel: https://your-app-develop.vercel.app (Preview)

feature/* (機能開発)
  └─ 個別の機能開発
  └─ Vercel: Preview URL (自動生成)
```

---

## 開発フロー

### 1. 新機能を開発する場合

```bash
# developブランチから新しいブランチを作成
git checkout develop
git pull origin develop
git checkout -b feature/スタッフ招待機能

# 開発・コミット
git add .
git commit -m "feat: スタッフ招待機能を追加"

# GitHubにプッシュ
git push origin feature/スタッフ招待機能
```

### 2. Pull Requestを作成

1. GitHub上でPull Requestを作成
2. ベースブランチ: `develop`
3. コードレビュー（自分でレビューしてもOK）
4. Vercelが自動的にPreview URLを生成
5. Preview環境でテスト
6. 問題なければマージ

### 3. developで動作確認

```bash
git checkout develop
git pull origin develop
```

- `develop`ブランチは自動的にVercelのPreview環境にデプロイ
- ここでさらにテスト

### 4. 本番リリース

```bash
# mainブランチにマージ
git checkout main
git pull origin main
git merge develop
git push origin main
```

- `main`への反映で本番環境に自動デプロイ

---

## Vercelの設定

### 推奨設定

1. **Vercel Dashboard** → プロジェクト設定
2. **Git** タブで以下を設定：

#### Production Branch
```
main
```
- このブランチが本番環境にデプロイされる

#### Preview Branches
```
develop
feature/*
```
- これらのブランチはPreview環境にデプロイされる

---

## 緊急時のロールバック

### 方法1: Vercelダッシュボードから

1. Vercel Dashboard → Deployments
2. 以前の安定したデプロイを選択
3. **"Promote to Production"** をクリック

### 方法2: Gitで戻す

```bash
# 特定のコミットに戻す
git revert <commit-hash>
git push origin main

# または、直前のコミットを取り消す
git revert HEAD
git push origin main
```

---

## チェックリスト

### 開発時
- [ ] `develop`ブランチから機能ブランチを作成
- [ ] ローカルでテスト
- [ ] コミットメッセージは明確に
- [ ] Pull Requestを作成

### デプロイ前
- [ ] Preview環境でテスト
- [ ] TypeScriptエラーなし
- [ ] Lintエラーなし
- [ ] 主要機能の動作確認

### 本番デプロイ後
- [ ] 本番環境で動作確認
- [ ] エラーログの確認（Vercel Dashboard → Logs）
- [ ] 主要機能が正常に動作するか確認

---

## ブランチ保護（GitHub Settings）

### main ブランチの保護設定

1. GitHub → Settings → Branches
2. "Add branch protection rule"
3. Branch name pattern: `main`
4. 推奨設定：
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging

これにより、直接`main`にプッシュできなくなり、必ずPull Requestを経由するようになります。

---

## よくある質問

### Q: 今までの開発スタイルと何が違う？

**Before（危険）:**
```bash
git add .
git commit -m "変更"
git push origin main  # 即座に本番へ！😱
```

**After（安全）:**
```bash
git add .
git commit -m "変更"
git push origin develop  # 開発環境でテスト ✅
# テストOKなら → mainにマージ → 本番デプロイ
```

### Q: 小さな修正もPull Requestが必要？

個人プロジェクトの場合、小さな修正は`develop`に直接プッシュしてもOK。
ただし、**mainには必ずdevelopを経由**させることを推奨。

### Q: hotfix（緊急修正）は？

緊急時は`main`から`hotfix/`ブランチを切って、修正後に`main`と`develop`の両方にマージ。

```bash
git checkout main
git checkout -b hotfix/緊急修正
# 修正
git push origin hotfix/緊急修正
# PR → main にマージ
# その後、develop にもマージ
```

---

## まとめ

### 現在の設定
- ✅ `main` ブランチ = 本番環境
- ✅ `develop` ブランチ = 開発環境（作成済み）
- ⏳ ブランチ保護ルール（GitHub設定が必要）

### 次のステップ
1. GitHubでブランチ保護を設定
2. 今後は`develop`で開発
3. テスト後に`main`にマージ
4. 安全なデプロイフロー完成！🎉

