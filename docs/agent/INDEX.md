# エージェント規約マップ

常時注入を最小化し、**指示実行の正確さ**（安全不変 + 今回の依頼）を優先するための索引。

## 読む順番（迷ったらこれ）

1. ユーザーの今回指示（範囲・完了条件）
2. `.cursor/rules/00-core.mdc` + `git-deploy.mdc`（常時）
3. 触るファイルに応じた領域ルール
4. 手順がいるならスキル（deploy / db-change / smoke 等）

## `.cursor/rules/`

| ファイル | 適用 | 内容 |
|----------|------|------|
| `00-core.mdc` | 常時 | 優先順・安全不変・スコープ・完了報告 |
| `git-deploy.mdc` | 常時 | staging/main・DB先行・環境・smoke |
| `multi-tenant.mdc` | `src` / `supabase` | organization_id |
| `database.mdc` | `supabase/**` | schema/RPC/RLS/罠 |
| `frontend.mdc` | `src/**/*.{ts,tsx}` | RQ・定数・JST・共有API |
| `design.mdc` | `src/**/*.{tsx,css}` | トークン・公演UI保護・店舗色 |
| `delivery-lanes.mdc` | 手動/description | Codex/Claudeレーン（GO配送時のみ） |
| `commands.mdc` | 手動/description | npm scripts |

## エントリファイル

| ファイル | 対象 |
|----------|------|
| `.cursorrules` | 互換ポインタのみ |
| `CLAUDE.md` | `@AGENTS.md` 取り込みのみ（詳細は `.cursor/rules/`） |
| `AGENTS.md` | エントリ＋Codexレーン固有・レビュー日本語（詳細は rules） |

## スキル

| 状況 | スキル |
|------|--------|
| 本番反映 | `/deploy` |
| DB変更 | `/db-change` |
| push後確認項目 | `/smoke` |
| ドメイン確認 | `/yoyaq-domain` |
| Figmaを実寸どおり実装 | `/figma-dev-mode` |
| Codex自動配送 | `yoyaq-auto-delivery` |

## 変更方針

- **原則を増やすな。例外をスキルか領域ルールへ**
- 同じ文を CLAUDE / AGENTS / rules に三重コピーしない
- 日付つき運用メモはレーン・スキル側へ。常時コアには入れない
