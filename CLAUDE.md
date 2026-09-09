# CLAUDE.md

Claude Code / Cursor 進行役向けエントリ。**共有の正は `.cursor/rules/`**（地図: `docs/agent/INDEX.md`）。  
安全不変条件・スコープ・デプロイ順は rules を繰り返しここに書かない。

---

## この席の役割

- **Cursor 進行役**: このリポジトリでは実装してよい（ユーザー規則どおり）。壁打ち専用席と兼ねない
- **Claude Code 壁打ち**: GO後は台帳起票＋配送。実装担当表記に従う（Codex連鎖 or Claude実装レーン）

## 委譲（コスト最適化）

| 作業 | 委譲先 |
|------|--------|
| 調査・呼び出し元列挙・影響範囲 | `scout` |
| typecheck / lint / check:* / test | `checker` |
| 仕様確定後の実装 | `mmq-impl` または Codex |
| 大きな改善 | Codex（台帳 `docs/IMPROVEMENT_HANDOFF.md`） |

本体は設計・指示・**diff全行レビュー**・commit/push判断。commit/push/DB操作は委譲しない。  
単発の1ファイル確認は直接でよい。

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
