# コードレビュー クイックリファレンス

## 🚀 自動化された仕組み

### 1. **保存時の自動チェック（ESLint）**
- ファイル保存時に自動実行
- 検出内容：
  - ✅ 未使用変数・import
  - ✅ 型エラー（any型の警告）
  - ✅ useEffect依存配列の不足
  - ✅ React Hooksのルール違反
  - ✅ console.log（警告）

### 2. **コミット前の強制チェック（pre-commit hook）**
- `git commit` 実行時に自動起動
- ESLintチェック → Cursorレビュー推奨 → 確認プロンプト
- キャンセル可能（y/n/skip）

---

## 📋 Cursorでのレビューコマンド

### **コミット前**
```
コミット前レビュー
```

### **昨日の変更チェック**
```
昨日の変更をチェック
```

### **特定ファイル**
```
@ファイル名 をレビュー
```

### **全体チェック**
```
主要ファイルをレビュー
```

### **問題点の確認**
```
何か問題ない？
```

---

## 🛠️ ESLint手動実行

```bash
# 全ファイルチェック
npm run lint

# 特定ファイルチェック
npx eslint src/pages/ScheduleManager.tsx

# 自動修正（可能な範囲）
npx eslint src/**/*.tsx --fix
```

---

## ⚙️ 設定ファイル

- **ESLint設定**: `.eslintrc.json`
- **VSCode設定**: `.vscode/settings.json`
- **pre-commit hook**: `.git/hooks/pre-commit`

---

## 🎯 レビューのタイミング

| タイミング | 実行内容 | 自動/手動 |
|-----------|---------|----------|
| **ファイル保存時** | ESLintチェック | 🤖 自動 |
| **コミット前** | pre-commit hook起動 | 🤖 自動 |
| **Cursorレビュー** | AIによる詳細レビュー | 👤 手動 |
| **朝の開発開始時** | 前日変更のレビュー | 👤 手動 |
| **機能完成時** | 関連ファイルレビュー | 👤 手動 |

---

## 🔧 トラブルシューティング

### pre-commit hookが動かない
```bash
# 実行権限を確認
ls -la .git/hooks/pre-commit

# 権限がなければ付与
chmod +x .git/hooks/pre-commit
```

### ESLintエラーが多すぎる
```bash
# 警告のみ表示（エラーは無視）
npm run lint -- --quiet
```

### 一時的にhookをスキップしたい
```bash
# --no-verify オプションを使用
git commit --no-verify -m "メッセージ"
```

---

## 📊 レビュー基準（.cursorrules準拠）

### 🔴 重要度：高
- 型安全性（any型の使用）
- useEffect依存配列の不足
- 大規模コンポーネント（300行以上）
- 重要機能の変更（CRITICAL_FEATURES.md参照）

### 🟡 重要度：中
- React.memoの不使用
- useMemo/useCallbackの不足
- エラーハンドリングの不足

### 🟢 重要度：低
- 未使用import
- console.logの残存
- 命名規則の改善提案

---

## 💡 効率的な使い方

1. **日常開発**: 保存時のESLintに従う
2. **コミット前**: pre-commit hookでチェック
3. **重要変更**: Cursorで詳細レビュー依頼
4. **定期チェック**: 週1回の全体レビュー

---

最終更新: 2025-10-18
