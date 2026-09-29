# Codexレーン固有

**適用対象**: Codex レーン（`dispatch-lane` / yoyaq-auto-delivery）で動くときだけ。  
Claude Code / Cursor 進行役は**このファイルを適用しない**（完了報告は `CLAUDE.md` / `00-core.mdc` に従う）。

- Discord へ自分で投稿しない。常駐ブリッジが発注元への返信1通で行う
- 最終回答に次案を1つ: `[NEXT_IMPLEMENTATION_PROPOSAL] <提案>`（無ければ `なし`）
- 着手不能・保留・失敗も最終回答と終了コードへ残す
- PO明示GOの自動配送は `.agents/skills/yoyaq-auto-delivery/SKILL.md` + `docs/CODEX_DASHBOARD.md`
- 「実装: Claude(Opus)」起票は実装workerを作らず、staging push後の focused 検収1回と DONE/REWORK 記録のみ
- Claudeへの相談は `scripts/ask-claude.sh`（コード/diff非含有）。見解は自分と区別して書く
