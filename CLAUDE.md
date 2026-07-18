# CLAUDE.md

開発ルールの正規ソースは `.cursorrules`。必ずそちらを参照すること。
このファイルは最重要ルールの抜粋のみ（AGENTS.md と内容を同期させること）。

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

staging に push したら必ず動作確認チェックリストを出力する（`/smoke` スキルを使う）。
各項目に「どの画面か（ページ名・タブ名・たどり方）」を必ず書く。

---

## プロジェクト用スキル（.claude/skills/）

| スキル | 用途 |
|--------|------|
| `/deploy` | staging → main の本番反映フロー一式（分岐チェック→DB適用→マージ→resync） |
| `/smoke` | 変更 diff から動作確認チェックリストを生成 |
| `/codex` | Codex（実装担当）向けの指示書＋コピペプロンプトを生成 |
| `/codex-run` | 設計→Codex CLI自動実行→diffレビューの一気通貫パイプライン |
| `/handoff` | セッション引き継ぎ＋次セッション用プロンプトを生成 |
| `/issue` | 雑な一言を型どおりのissueに変換して起票（型= docs/templates/issue-format.md） |
| `/bug-report` | 曖昧なバグ報告を再現手順つきissueに整形＋ヒアリング質問生成 |
| `/review3` | UX・セキュリティ・ビジネスロジックの3視点PRレビュー（観点= docs/templates/review-perspectives.md） |
| `/pr-triage` | open PRをまとめて捌くレビュー会（マージ基準・差し戻しの型） |
| `/db-change` | DBスキーマ変更の安全手順（罠チェック→staging→本番→ロールバック） |
| `/test-view` | 予約システム特有のエッジケース検証（観点= docs/templates/test-perspectives.md） |
| `/release-notes` | マージ済みPRからスタッフ向け/お客さん向けのお知らせ文面を生成 |
| `/yoyaq-domain` | ドメイン知識ロード（本体= docs/DOMAIN.md） |
| `/customer-reply` | 顧客対応の定型文面（メール/LINE）を生成 |
| `/figma-kit` | シナリオキット制作ツールの要件ロード |

グローバル（~/.claude/skills/、全リポジトリ共通）: `/project-init` `/briefing` `/weekly-review` `/subsidy-docs`

---

## 委譲ルール（推論コスト最適化）🚨

メインモデルは**設計・指示書作成・品質レビュー・コミット判断**に徹し、作業は下位に委譲する。

| 作業 | 委譲先 |
|------|--------|
| コード調査・呼び出し元列挙・影響範囲マップ | `scout` サブエージェント（haiku・読み取り専用） |
| 検証スイート実行（typecheck / lint / check:* / test） | `checker` サブエージェント（haiku・変更不可） |
| 仕様が固まった実装 | `mmq-impl` サブエージェント（opus）**または** Codex（`/codex` で指示書生成） |
| 大きな機能実装・改善タスク | Codex（`/codex` で指示書生成。台帳 = docs/IMPROVEMENT_HANDOFF.md） |

- **mmq-impl / Codex の成果物は、メインモデルが必ず `git diff` をレビューしてからコミットする**（コミット・push・DB操作は委譲しない）
- メインモデル自身で grep や検証コマンドを直接回さない（まず scout / checker に投げる）。1ファイル読む程度の単発確認は直接でよい
