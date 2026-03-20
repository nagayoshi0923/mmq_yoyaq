# 開発ルール

**最終更新**: 2025-12-30

コーディング・デザイン・運用に関するルール集。

---

## 📄 ファイル一覧

| ファイル | 内容 |
|---------|------|
| [critical-features.md](./critical-features.md) | 🚨 削除禁止の重要機能リスト |
| [multi-tenant-security.md](./multi-tenant-security.md) | 🚨 マルチテナント セキュリティ |
| [pii-review-priority.md](./pii-review-priority.md) | 個人情報（PII）セルフレビュー優先度 |
| [design-guidelines.md](./design-guidelines.md) | デザインガイドライン（色・フォント・コンポーネント） |
| [ui-design.md](./ui-design.md) | 全ページのUI要素詳細 |
| [date-handling.md](./date-handling.md) | 日付処理のルール |
| [status-badge-logic.md](./status-badge-logic.md) | ステータスバッジの判定ロジック |

---

## 🔧 プロジェクトルール

詳細は `rules/rurle.mdc` を参照。

### コミット前チェック

```bash
npm run verify
```

### 重要ルール

1. **ページ変更時** → `docs/pages.md` を更新
2. **重要機能変更時** → `critical-features.md` を更新
3. **UI要素追加時** → `ui-design.md` を更新
4. **ドキュメント変更** → コードと同じコミットで

---

## 関連ドキュメント

- [../index.md](../index.md) - ドキュメント目次
- [../features/](../features/) - 機能詳細
