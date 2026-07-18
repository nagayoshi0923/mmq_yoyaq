# AGENTS.md

開発ルールの正規ソースは `.cursorrules`。必ずそちらを参照すること。
このファイルは最重要ルールの抜粋のみ（CLAUDE.md と内容を同期させること）。

---

## 🚨 最重要ルール（必ず守ること）

### ブランチ戦略

**通常作業は staging ブランチで直接作業する。**

```bash
git branch --show-current                        # 作業開始前に必ず確認
git checkout staging && git pull origin staging  # 常に staging の最新から
```

#### Codex自動配送の限定例外

POとの壁打ち後に明示GOされたタスクは、[yoyaq-auto-delivery](.agents/skills/yoyaq-auto-delivery/SKILL.md)と[CODEX_DASHBOARD](docs/CODEX_DASHBOARD.md)に従う。この場合だけworker/reviewerを正確な最新`origin/staging`から`codex/*` branch・隔離worktreeへ分け、監督Codexだけがstagingへ1件ずつ統合・pushする。UIはPO visual OKまでstagingへ統合しない。本番DB・main・本番デプロイは明示PO指示なしに行わない。詳細・優先順位は`.cursorrules`を正とする。

### main への反映（本番デプロイ）

- **ユーザーの明示的な指示があったときのみ**、staging → main のマージ＋push まで一気に実行してよい
- 指示なしの main マージ・push は絶対禁止。**force push は常に禁止**
- マージ前に分岐チェック（`git log origin/staging..origin/main --oneline`）。main に hotfix が直接入っていることがある
- マージ後は staging を main に ff で resync する

### DBマイグレーションがある場合

**DB変更 → フロントデプロイの順序を絶対に守ること**（逆だと本番エラー、事故実績あり）。

- マイグレーション適用（`npm run db:push:staging` / `db:push:prod`）は AI が実行してOK。
  実行前に変更内容を提示し、実行後は確認クエリで結果を報告する。

### 作業スコープのルール

**1作業 = 1コミット。依頼された範囲だけをやる。**

- 依頼に含まれていないファイルを勝手に修正しない
- リファクタ・クリーンアップ・関連改善は、明示的に頼まれない限りやらない
- 「ついでに」「念のため」でスコープを広げない
- 複数の修正が必要な場合は、先に分割案をユーザーに提示して確認を取る

### 動作確認の依頼

staging に push したら必ず動作確認チェックリストを出力する。
各項目に「どの画面か（ページ名・タブ名・たどり方）」を必ず書く。

---

## 改善タスク（リファクタ・デザイン統一・性能）を実装する場合

- 運用台帳は `docs/IMPROVEMENT_HANDOFF.md`。着手前に読み、完了したら更新する
- コミット前に `npm run verify` を実行してグリーンであることを確認する
- デザイン変更時の絶対制約: `border-l-4` アクセント禁止 / 公演モーダル・公演カードの見た目変更禁止 / native `confirm()` 禁止（共通 `ConfirmDialog` を使う）。詳細は `.cursorrules` のデザインシステム章

---

## Review guidelines

**IMPORTANT: Write ALL review comments, summaries, and inline feedback in Japanese (日本語). Do not use English.**

PRレビュー(Codex等のAIレビュアー)は以下の観点・方針で行うこと。

### 出力形式

- 指摘・要約・インラインコメントはすべて日本語で書く
- 個別の指摘は該当行へのインラインコメントで書く
- **レビューの最後に、必ずトップレベルコメントとして「総評」を1つ投稿する。**内容: ①最重要の指摘は何か ②マージ可否の推奨(そのままマージ可 / 修正後にマージ / 要議論) ③対応の優先順位
- 重要度の低いスタイル指摘は省略する

### 観点

- バグ・ロジックエラー・エッジケースを最優先で指摘する
- `organization_id` によるマルチテナント分離が維持されているか確認する
- `reservation_source` が `src/lib/constants.ts` の定数を使っているか確認する
- RLSポリシーの直接変更が含まれていないか確認する（SECURITY DEFINER RPC で対応する方針）
- セキュリティ: 入力検証・認可漏れ・個人情報（メール/電話/PIN）の露出がないか
- 明らかなパフォーマンス問題（N+1、無制限フェッチなど）
- migrationを含むPR: 既存データへの影響、一意制約違反の可能性、失敗時に途中状態が残らないか、DB変更→フロントデプロイの順序が守られるかを確認する
- デザイン変更を含むPR: `border-l-4` アクセント禁止 / 公演モーダル・公演カードの見た目変更禁止 / native `confirm()` 禁止（共通 `ConfirmDialog` を使う）に違反していないか
