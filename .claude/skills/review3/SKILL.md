---
name: review3
description: PRまたは差分をUX・セキュリティ・ビジネスロジックの3視点でレビューし、固定形式のレポートを出す。ユーザーが「このPRレビューして」「3視点で見て」と言ったとき使う。引数はPR番号（#123）またはコミット範囲。省略時は現在の作業ツリーの差分。
---

# 3視点レビュー

**観点の正は `docs/templates/review-perspectives.md`。必ず先に読むこと。**
（CI の claude-review.yml と観点を共有している。観点を足したいときは template 側を直す）

## 手順

1. `docs/templates/review-perspectives.md` と `docs/templates/test-perspectives.md` を読む
2. 対象を特定:
   - PR番号 → `gh pr view <n> --json files,title,body` + `gh pr diff <n>`
   - コミット範囲 → `git diff <範囲>`
   - 省略時 → `git diff HEAD`（未コミット含む作業ツリー）
3. diff だけでなく**変更ファイルの呼び出し元**も scout に列挙させ、影響範囲を把握する
4. 3視点それぞれで観点リストを当てる。該当するテスト観点（test-perspectives.md）があれば必ず言及
5. レポート形式（review-perspectives.md の形式）で出力:
   - 視点ごとの表（重要度 / 場所 file:line / 指摘 / 修正案）
   - 指摘なしの視点も「指摘なし」と明記
   - 総合判定1行: マージ可 / 修正後マージ可（High対応必須） / 差し戻し

## ルール

- スコープ外の気づきは「別issue推奨」として分離（差し戻し理由にしない）
- High は「本番で実害が出る」ものだけ。乱発しない
- 修正案は具体的に（「検証を追加」ではなく「この行にこのチェック」）
