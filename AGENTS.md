# AGENTS.md

Codex / 自動エージェント向けエントリ。**共有の正は `.cursor/rules/`**（地図: `docs/agent/INDEX.md`）。  
安全不変条件・スコープ・デプロイ順は rules にあり、ここへ复制しない。

---

## Codexレーン固有

- Discord へ自分で投稿しない。常駐ブリッジが発注元への返信1通で行う
- 最終回答に次案を1つ: `[NEXT_IMPLEMENTATION_PROPOSAL] <提案>`（無ければ `なし`）
- 着手不能・保留・失敗も最終回答と終了コードへ残す
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
