# AGENTS.md

Codex / Claude Code 共通のエントリ。指示はここにだけ書く（`CLAUDE.md` はこのファイルを取り込む1行のみ）。  
**共有の正は `.cursor/rules/`**（地図: `docs/agent/INDEX.md`）。安全不変条件・スコープ・デプロイ順は rules にあり、ここへ複製しない。

- データ構造（テーブル・関連・画面対応）の正本は **MMQ 構造アトラス**：https://github.com/nagayoshi0923/mmq-model-atlas （`atlas/index.html`、2026-09-28 本番構造照合版）。`docs/design/database-design.md` は 2026-01 の旧版。

---

## Codexレーン固有

Codex レーン（dispatch-lane）で動くときだけ適用する。  
完了報告の共通方針（Discord投稿禁止・案件台帳への完了/保留/失敗記録）は `00-core.mdc` を正とする。ここへ複製しない。

- Discord へ自分で投稿しない。常駐ブリッジが発注元への返信1通で行う
- 最終回答に次案を1つ: `[NEXT_IMPLEMENTATION_PROPOSAL] <提案>`（無ければ `なし`）
- 着手不能・保留・失敗も最終回答と終了コードへ残す（台帳記録は `00-core.mdc`）
- PO明示GOの自動配送は `.agents/skills/yoyaq-auto-delivery/SKILL.md` + `docs/CODEX_DASHBOARD.md`
- 「実装: Claude(Opus)」起票は実装workerを作らず、staging push後の focused 検収1回と DONE/REWORK 記録のみ
- Claudeへの相談は `scripts/ask-claude.sh`（コード/diff非含有）。見解は自分と区別して書く

## Review guidelines

指摘・要約・インライン・総評は**すべて日本語**。英語禁止。

- 行コメントで個別指摘。最後にトップレベル「総評」1つ（最重要点 / マージ可否 / 優先順）
- 優先: バグ・エッジケース → テナント → 認可/PII → 回帰
- `organization_id`、`reservation_source` 定数、RLS直書き回避、migration時のDB先行、デザイン禁止（`border-l-4` / 公演見た目 / native confirm）を確認
- 薄いスタイル指摘は省略

## 改善タスク

台帳 `docs/IMPROVEMENT_HANDOFF.md`。着手前に読み完了後に更新。commit前 `npm run verify`。
