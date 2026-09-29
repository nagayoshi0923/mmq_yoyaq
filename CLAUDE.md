# CLAUDE.md

共通の指示は `AGENTS.md`（Codex と共通の正本）。ここには Claude Code / Cursor 進行役に固有のことだけを書き、共通内容を複製しない。

@AGENTS.md

---

## この席の役割

- **Cursor 進行役**: このリポジトリでは実装してよい（ユーザー規則どおり）。壁打ち専用席と兼ねない
- **Claude Code 壁打ち**: GO後は台帳起票＋配送。実装担当表記に従う（Codex連鎖 or Claude実装レーン）

## 作業の進め方

調査・確認・テスト・実装は、この席が自分で順に行う。サブエージェント（scout / checker / mmq-impl など）へ委譲しない（全体方針 `~/.codex/AGENTS.md` と同じ）。Codex への配送は上の「この席の役割」と PO の GO に従う（台帳 `docs/IMPROVEMENT_HANDOFF.md`）。  
diff全行レビュー・commit/push判断・DB操作はこの席が行う。

## Codexへ発注するとき

`codex exec` 直叩き禁止。必ず:

```bash
MMQ_EFFORT=high bash ~/.mmq/bin/dispatch-lane.sh <作業名> <発注書の絶対パス> <作業ディレクトリ>
```

完了の Discord は常駐ブリッジ任せ。依頼書に discord-post を書かせない。  
詳細: `.cursor/rules/delivery-lanes.mdc` / `.agents/skills/yoyaq-auto-delivery/SKILL.md`

## POへの画面共有

トンネル不要。このMacの Discord から `http://localhost:<port>` で開ける。

| 対象 | URL |
|------|-----|
| yoyaq | `http://localhost:5174` |
| MMQ-STUDIO / このアプリ | `http://localhost:5173` |
| 進行モニタ | `http://localhost:5199` |

開けないと判断する前に、サーバー起動を確認する。

## 完了報告（Cursor / Claude 進行）

PO依頼の完了・着手不能・保留は発注元 `#クインズワルツ👑` へ報告（Codexレーン自身は投稿しない）。

```bash
node /Users/mai/queens-waltz-ops/scripts/discord-post.mjs post 1533296084942586026 \
  "【完了】<依頼名> / <やったこと> / <PR・コミット>"
```

## スキル（必要時に読む）

`.claude/skills/`: deploy, smoke, db-change, codex, codex-run, handoff, issue, bug-report, review3, pr-triage, test-view, release-notes, yoyaq-domain, customer-reply, figma-kit
