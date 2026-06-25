# 引き継ぎ（2026-06-26 大規模リファクタセッション → 次セッション）

参照: 詳細手順は [docs/REFACTORING_PLAN.md](./REFACTORING_PLAN.md)、運用の罠は `~/.claude/.../memory/`（MEMORY.md）。

---

## 🔴 ブランチ／デプロイ状態

- 作業ブランチは **staging**。**main == staging（完全同期）**。本番 HEAD = `aa7dc1bb`。
- 今セッションのコミットは**全て本番反映済み**（フロントのみ＋realtimeバグのDBマイグレーション1本、prod適用確認済み）。
- 本番反映フロー: `git checkout main && git merge --ff-only staging && git push origin main`（**main push 許可済み**・force push のみ禁止）。マージ前に `origin/staging..origin/main` 空を確認、後に staging へ ff resync。DBマイグレーションがある時のみ deploy-prod CI が `supabase db push`（DB→フロント順）。

## 今セッションで完了したこと（全て本番反映済み）

1. **SendReports**（ライセンス管理>送信タブ）2,290→963（-58%）。純モジュール5＋ダイアログ4＋コンポーネント3＋データ層フック。
   - バグ修正A: リスト操作でヘッダー金額が変わらない → getPreviewItem 集計に統一。
   - 機能B: 送信後に金額/公演数がズレたら ⚠️差分バッジ（メモリ `project_license_report_amount_drift`）。
2. **realtime バグ**: 「募集停止」(schedule_blocked_slots) が他タブに反映されない → publication 追加＋REPLICA IDENTITY FULL（migration `20260626120000`）＋ `useBlockedSlots` に組織フィルタ購読。prod 適用確認済み。同型で `useCustomHolidays` も購読無し（低優先・未対応）。
3. **ReservationList**（公演モーダル内の予約一覧）**2,263→486（-78%）**。`reservationList/` に純モジュール/データ層フック(`useReservationListData`)/アクションフック(`useReservationListActions` 826行)/ダイアログ4/AddParticipantSection/ReservationRow を分離。顧客名はみ出しUI修正も実施。スモークOK・本番反映済み。

## 次セッションの本題：Phase 5 の残り

- **5-4 PerformanceModal**（`src/components/schedule/PerformanceModal.tsx`・1,860行・**毎日使う・売上直結・高リスク**）。
  - 純ロジックは抽出済（`performanceModal/fee.ts`）。残りは対話的：GM役割UI(1456-1659・**役割変更→予約をDB同期するインライン非同期処理**を含む)／日時場所・公演内容・スタッフ備考の各セクション→子／フォーム状態(`formData`)＋多数ハンドラ→`usePerformanceForm` フック。
  - 削除確認・シナリオ変更確認の小ダイアログ2つ(1777-1837)は手軽。
- **5-2d ImportScheduleModal**（1,704行）プレビュー表示UI→子。あまり使わない機能・低優先。

## 進め方の型（今セッションで確立・有効）

1. **Python で JSX/ハンドラを逐語移送**（手転記しない）。子コンポーネント/フックの props・deps は**元のクロージャ参照と同名**にして置換ゼロにする。
2. **抽出後は必ず git 比較で byte 一致を確認**（`git show HEAD:file | sed -n 'A,Bp' | 空白除去 | sort` vs 抽出先 → diff空）。挙動不変の証明。
3. 各歩: `npx tsc --noEmit` / `npx eslint <files>` / `npm run build:fast` / `npm run test:unit`。死 import は Python 検出して除去。
4. **1作業=1コミット**、staging push。**バグ修正とリファクタは別コミット**（挙動変える/変えないを混ぜない）。
5. **対話的変更はモーダル単位でスモーク依頼**。スモーク依頼時は**必ず画面（メニュー→ページ→タブ）を明記**。
6. **TodoWrite で常に現在地が見える状態**を保つ。
7. ⚠️ Python 抽出は**ブロック終端の検出ミスに注意**（内側の `)}` を拾わないようインデント完全一致で。今セッションで1度ミス→git比較で検知・即修正した）。

## 検証コマンド早見

```bash
npx tsc --noEmit
npx eslint <changed files>
npm run test:unit      # vitest（現在 全グリーン・130 passed）
npm run build:fast
# DB照会(本番): supabase db query --linked --output csv "SELECT ..."（read-only）。staging検証は一時 supabase link --project-ref lavutzztfqbdndjiwluc → 戻す
```

---

## ▼ 次セッション用プロンプト（コピペ用）

```
前セッションの続き。docs/HANDOFF.md と docs/REFACTORING_PLAN.md とメモリ(MEMORY.md)を読んで把握して。

main == staging（本番HEAD aa7dc1bb）で今セッション分は全て本番反映済み。
次は Phase 5 の残り＝5-4 PerformanceModal（src/components/schedule/PerformanceModal.tsx・1,860行・毎日使う高リスク）を分割する。

進め方は HANDOFF の「型」に従う：Pythonで逐語移送＋同名props＋git比較でbyte一致確認、1作業1コミット、tsc/eslint/build/test、対話的変更はモーダル単位でスモーク依頼（画面名を明記）、TodoWriteで現在地を可視化。バグ修正とリファクタは別コミット。

PerformanceModal は売上直結で高リスクなので慎重に。まず安全な所（削除/シナリオ変更の確認ダイアログ2つ→子、各セクション→子）から始めて、GM役割UI（予約DB同期インライン処理あり）とフォーム状態フック(usePerformanceForm)は依存を全列挙してから。各バッチ後にスモークリストを出して進めて。
```
