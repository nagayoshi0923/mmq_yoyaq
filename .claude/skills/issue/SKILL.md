---
name: issue
description: 雑な一言（「配役記録ほしい」等）を、型に沿った質の高いissueに変換して起票する。ユーザーが「issueにして」「起票して」と言ったとき、または新しい作業依頼をissue化すべきとき使う。Actions上のClaudeへの指示書になるためissueの質が開発の質を決める。
---

# Issue 起票

**型の正は `docs/templates/issue-format.md`。必ず先に読むこと。**

## 手順

1. `docs/templates/issue-format.md` を読む
2. ユーザーの一言から以下を確定させる。不明なら**起票前に**最大3問だけ聞く:
   - 種別（[Bug]/[Feature]/[Task]/[Refactor]）
   - 誰が困っているか / なぜ今やるか
   - 完了条件（実機で確認できる形）
3. サイズ判定: 1 issue = 1 PR = 1日以内の粒度を超えるなら分割する。
   分割時は依存関係（`依存: #xx のあとに着手`）を各issueに書く
4. **確認を取らずにそのまま起票する**（issueは編集・クローズ可能な可逆操作）:
   `gh issue create --title "..." --body-file <一時ファイル>` + ラベル付与
5. 委任判定（任せてOK / 調査のみ / 人間主導）を本文末尾に書く
6. 起票後に issue URL と本文サマリを報告。「直したければ言って」と添える

## 注意

- 本文に「@claude」という連続文字列を絶対に入れない（claude.yml が誤発火）
- DB変更を含む場合は DB 部分を独立 issue に切る（DB→フロントの順序保証）
- 既存 issue と重複しないか `gh issue list --search` で先に確認する
