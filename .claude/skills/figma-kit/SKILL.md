---
name: figma-kit
description: シナリオキット制作ツール（Figma）の要件定義と設計思想をロードする。キット制作ツールの仕様の続きを議論するとき、Agent Teamsに渡す資料を作るとき、「キットツールの件」と言われたとき使う。
---

# シナリオキット制作ツール 要件ロード

**知識の本体は `docs/design/kit-tool-requirements.md`（要件定義書v2の写し）。**

> ⚠️ 初期状態では未インポート。本体ファイルが無い場合は、ユーザーに
> 「要件定義書v2の本体（Figma/Notion等にあるもの）を貼るか場所を教えて」と依頼し、
> もらった内容を `docs/design/kit-tool-requirements.md` に保存してから進める。
> 以後はこのskillだけでゼロ説明で議論を再開できる。

## 手順

1. `docs/design/kit-tool-requirements.md` を読む（無ければ上記の依頼をする）
2. 関連するリポジトリ内の既存キット実装も前提に入れる:
   - キット移動計画の設計: `docs/design/kit-transfer-planning.md`
   - キット位置/移動のスキーマ: `supabase/migrations/20260131100000_kit_management.sql`
   - kit_count の持ち方: `supabase/schemas/organization_scenarios.sql`
3. 議論の成果（決定事項・変更）は同ファイルに追記して焼き込む
   （「v2からの変更履歴」セクションに日付つきで）

## Agent Teams / Cowork に渡すとき

- `docs/design/kit-tool-requirements.md` 単体で自己完結するように保つ
  （リポジトリ外から参照されるため、内部ファイルへの相対リンクには要点の抜き書きを添える）
