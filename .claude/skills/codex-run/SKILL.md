---
name: codex-run
description: 設計をClaudeが固め、実装をCodex CLIに自動実行させ、成果物のdiffをClaudeがレビューする一気通貫パイプライン。ユーザーが「Codexにやらせて」「codexで実装して」と言ったとき、または仕様確定済みの実装を委譲するとき使う。手動貼り付け版は /codex（そちらはプロンプト生成のみ）。
---

# Codex 自動実行パイプライン（設計=Claude / 実装=Codex / レビュー=Claude）

Codex CLI: `/Applications/Codex.app/Contents/Resources/codex`（アプリ同梱・認証済み・このリポジトリはtrusted）

## 手順

### 1. 設計フェーズ（Claude）

- 仕様を確定させる（不明点が残るなら実行前にユーザーに確認）
- `/codex` skill の指示書形式でプロンプトを組み立て、scratchpad にファイル保存
  - 改善タスクなら `docs/IMPROVEMENT_HANDOFF.md` と整合させる
  - **必ず含める**: 対象ファイル / 期待する完成形 / 触ってはいけない範囲 /
    検証コマンド（typecheck等）/ 「コミットはしない」という指示

### 2. 実行フェーズ（Codex）

```bash
/Applications/Codex.app/Contents/Resources/codex exec \
  --cd /Users/mai/mmq_yoyaq-1 \
  --sandbox workspace-write \
  -o <scratchpad>/codex_result.md \
  "$(cat <scratchpad>/codex_prompt.md)"
```

- 実行は Bash の `run_in_background: true` で。完了通知を待つ間、他の作業を進めてよい
- 長い場合に備えタイムアウトは長め（10分）に
- `--sandbox danger-full-access` と `--dangerously-bypass-*` は使わない
- 失敗・途中終了したら `codex exec resume --last` で継続できる

### 3. レビューフェーズ（Claude・必須）

- `git status --short` + `git diff` を**全行**レビュー（CLAUDE.md の鉄則）:
  - 依頼範囲外のファイルを触っていないか（触っていたら revert）
  - `docs/templates/review-perspectives.md` の3視点を当てる
  - 検証スイートは checker サブエージェントに投げる（typecheck / lint / test）
- 問題があれば: 軽微なら Claude が直接修正、大きければ修正指示を足して再度 codex exec

### 4. コミット（Claude）

- レビュー通過後に Claude がコミット（**Codex にはコミットさせない**）
- 1作業 = 1コミット。push 後は `/smoke` でチェックリストを出す

## 使い分け

| 状況 | 使うもの |
|---|---|
| その場で完結する実装を自動で回したい | **このskill（/codex-run）** |
| Codexアプリで対話しながらやりたい・台帳に積む大型タスク | `/codex`（指示書生成→手動貼り付け） |
| 設計から曖昧で相談しながら書きたい | mmq-impl サブエージェント |
