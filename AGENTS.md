# AGENTS.md

Codex / Claude Code 共通のエントリ。指示はここにだけ書く（`CLAUDE.md` はこのファイルを取り込む1行のみ）。  
**共有の正は `.cursor/rules/`**（地図: `docs/agent/INDEX.md`）。安全不変条件・スコープ・デプロイ順は rules にあり、ここへ複製しない。

- 不具合報告（GitHub Issue）は記録として残し、修正は社長の指示で Codex / Claude が行う。Cursor による自動整理・自動実装・自動レビューは 2026-09-30 に廃止。
- データ構造（テーブル・関連・画面対応）の正本は **MMQ 構造アトラス**：https://github.com/nagayoshi0923/mmq-model-atlas （`atlas/index.html`、2026-09-28 本番構造照合版）。`docs/design/database-design.md` は 2026-01 の旧版。

---

## 整備期間中の指示（2026-10-02 から、docs/MMQ_SEIBI_PLAN_2026-10.md の Phase 1 完了まで）

- mmq_yoyaq への書き込み（commit / push / PR / DB・Edge の変更）は Claude（queens-waltz-ai-manager 窓口、案件 QW-20261002-006）だけが行う。Codex レーンは読み取り・調査・一覧の提出に限る。
- Codex 窓口への依頼: QW-20260917-001 の58項目（A01〜A28 / B01〜B20 ほか）の「コード・一言説明・状態（受入済み / 実装済み受入待ち / 監査待ち）」を issue #716 のコメントへ貼る。
- 整備の正本は docs/MMQ_SEIBI_PLAN_2026-10.md。完了判断は同書第3節の表だけで行い、台帳へ「全体IN_PROGRESS」を追記しない。
- 挙動を変えない PR は CI 緑で即マージ。migration は rollback と対で出し、staging と本番へ同じ日に適用する。staging と main の間の取り込みは merge commit で行う（squash は祖先関係を失うので使わない）。

---

## Codexレーン固有

Codex レーン（dispatch-lane）で動くときだけ適用する。


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
