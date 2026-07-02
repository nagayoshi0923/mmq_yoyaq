# 管理ページ UI 改装計画（Claude 担当）

作成: 2026-07-02（Claude）　実施: **Claude（後日セッション）**　❌ **Codex は着手禁止**

オーナー判断: 管理ページのUIは後で改善したいが「Codex にさせると微妙」なので Claude が戻ってやる。
UI の好みは「Claude が作成したもの」。デザイン規約と実測データは `docs/IMPROVEMENT_HANDOFF.md` セクション5参照。

---

## 前提条件（着手前に Codex 側の完了を確認）

| # | 前提 | なぜ |
|---|---|---|
| 1 | D-0: 共通部品7点（EmptyState / ListSkeleton / SearchInput / FilterBar / StatCard / ステータスBadge一元化 / ListRow）＋ComponentGallery 掲載 | 改装はこの部品で組む |
| 2 | D-5: ConfirmDialog 新設＋素 confirm の置換が進んでいること | 改装と確認UI置換を同じ diff に混ぜない |
| 3 | P1: 顧客管理のデータ層改修 / P2: 予約統計 / P3: 年間分析のサーバ集計 | 売上・顧客系はデータ層が変わってから見た目を組むと二度手間がない |
| 4 | design-token CI ガード稼働 | 改装後の逆戻り防止 |

**🔒 保護対象（絶対に触らない）**: 公演モーダル（PerformanceModal）・公演カード（PerformanceCard / TimeSlotCell）。
このモーダルの作法（固定高さ3層・フッター[削除 mr-auto|キャンセル outline|実行 default]・子確認 Dialog）が全体の基準。

**🚫 禁止パターン（オーナー指定 2026-07-02）**: カード左ボーダーのステータスアクセント（`border-l-4 border-l-{color}`）は
「AIっぽい」ため**全面禁止**。状態表現はステータスバッジ＋薄い背景 tint（bg-*-50/30 程度）まで。
貸切管理は除去済み（claude/ui-parts）。残存: CouponsPage / KitManagementDialog / TransferPlanTab / PublicBookingTop の
CalendarView・ListView / ShiftSubmission / Settings/OrganizationDesignSettings / Manual系 / GuidePage — **各バッチで改装時に除去**
（⚠ PerformanceCard 内の使用は🔒保護対象なので現状維持）。

---

## スコープ（サイドバーグループ → ページ対応表・実測済み）

### 優先1: 貸切・予約
| メニュー | 実体 | 現状メモ（2026-07-02 実測） |
|---|---|---|
| 貸切管理 | `src/pages/PrivateBookingManagement/`(index 1,024行) | **最も乱れている**: text-xs 主体(90:35)・手書き箱37・全ステータスがグレー一色バッジ・ローディングが「読み込み中…」素テキスト・gap-4 が0回 |
| グループ一覧 | private-booking-groups（貸切グループ管理） | 貸切管理と同系。GroupChat 系は顧客向けと共用なので触る範囲に注意 |
| 予約管理 | `src/pages/ReservationManagement.tsx` | 統計カード・フィルタ・検索・64行の自作スケルトンが全部ある**ショーケース**。PC=TanStackDataTable/モバイル=自作カードの2系統 |

### 優先2: 売上・管理
| メニュー | 実体 | 現状メモ |
|---|---|---|
| 売上（9タブ） | `src/pages/SalesManagement/`（useSalesData 1,118行）＋給与計算 `SalaryCalculation/` | SummaryCards.tsx:91,95,99 に重複 md: クラスのコピペ痕跡。数値カードがグラデ背景＋text-base で他ページと別物。EventListCard は生 article。text-xs 129回で最多 |
| 公演報告（4タブ） | `src/pages/LicenseManagement/`（SendReports 963行） | ロード=スピナーのみ、統計カードは中央寄せ流派、ReportGroupCard は Card 縦積み。差分バッジ⚠️等の既存仕様は変えない（project_license_report_amount_drift） |

### 優先3: MMQ運営（license_admin 専用）
| メニュー | 実体 | 現状メモ |
|---|---|---|
| ユーザー管理 | `AccountManagement`（accounts?tab=users） | grid-cols-12 手書き疑似テーブル系（7ファイルの一角） |
| テナント管理 | `OrganizationManagement` | 小型フォームモーダルは max-w-md 方言 |
| マスタ管理 | `ScenarioMasterAdmin/`（ScenarioMasterEdit 803行） | 一覧は scenarioMasterColumns。編集ダイアログ（D&D バグ B6 の所在）はモーダル統一 D-5 側 |
| 外部公演報告 | `ExternalReports` | — |
| ライセンス報告管理 | `LicenseReportManagement` | 統計カード text-2xl 流派 |
| シナリオマッチャー | `ScenarioMatcher` | — |

### 優先4: 設定
| メニュー | 実体 | 現状メモ |
|---|---|---|
| 設定（5カテゴリ・約15タブ） | `src/pages/Settings/` | **実は一番整っている**（「bg-white rounded-xl border p-6」定型50箇所・PageHeader 20/25ファイル）。ただし text-sm 主体でリスト系ページと基準が逆、セクション角丸が xl で他と不一致、EmailLogs の検索/フィルタが独自。テンプレ設置ラベルの交通整理（docs/refactoring/template-editing-triage-plan.md「次の一手」）をここで同時にやると一石二鳥 |

対象外だが同時期に整えると効果的な残り: シナリオ管理（OrganizationScenarioList 863行）/ 顧客・クーポン（CustomerManagement は P1 完了後）/ ScheduleManager の周辺（ツールバー・フィルタのみ。モーダル・カードは🔒）。

---

## 進め方（このプロジェクトで確立済みの規律）

1. **パイロット**: 貸切管理 → 予約管理 の2ページを先に改装し、オーナーの「好み」をここで確定させる。修正指示は規約（IMPROVEMENT_HANDOFF 5.1）に反映してから横展開。
2. **1ページ=1コミット**。UI改装と機能変更・バグ修正は絶対に混ぜない（バグを見つけたら memory の台帳に退避）。
3. 各コミット: tsc / eslint / build:fast / test:unit green ＋ **Playwright ハーネスで自分で描画確認**（幅/整列/余白は実クラスで検証できる）→ オーナーへのスモーク依頼は「メニュー名→ページ名→タブ名→見るべき点」を明記。
4. オーナーへの説明は **before/after 比較テーブル**で（学びながら開発したい方針）。
5. データ表示の数字・件数・並び順は**1件も変えない**（見た目だけ）。集計値が絡むページ（売上・公演報告）はスクショ比較で数値一致を確認。

## バッチ計画（想定）

| バッチ | 内容 | 実機確認 |
|---|---|---|
| 1 | 貸切管理（パイロット①: FilterBar/StatusBadge/EmptyState/ListSkeleton 適用＋text-sm 基準化） **→ 実装済み（ブランチ `claude/ui-parts`・部品=01b47b3a / 改装=49a572da・staging マージ待ち）** | 🔍 |
| 2 | 予約管理（パイロット②: StatCard/SearchInput/スケルトン共通化） | 🔍 |
| 3 | オーナーフィードバックを規約に反映（IMPROVEMENT_HANDOFF 5.1 更新） | — |
| 4〜6 | 売上（タブ毎に分割: 概要系→分析系→給与計算）＋公演報告 | 🔍 |
| 7〜8 | MMQ運営 6ページ（疑似テーブル→TanStackDataTable 化を含む） | 🔍 |
| 9 | 設定（微調整＋テンプレラベル交通整理） | 🔍 |
| 10 | 顧客管理（P1 完了後に新部品で組み直し）＋シナリオ管理＋Schedule周辺 | 🔍 |

---

## このタスクを始めるときの Claude への指示プロンプト（コピペ用）

```
管理ページのUI改装を始めます。docs/design/ADMIN_UI_REDESIGN_PLAN.md と
docs/IMPROVEMENT_HANDOFF.md セクション5（デザイン規約・実測データ）を読んでから、
前提条件（Codex 側の D-0/D-5/P1 完了）を git log で確認し、
バッチ1（貸切管理のパイロット改装）から着手してください。
公演モーダルと公演カードは絶対に触らないこと。1ページ=1コミット、
UI以外の変更は混ぜない、数字・件数・並び順は1件も変えないこと。
```

---

## 改装時に直す既知の構造ワート（スモーク中のオーナー指摘・2026-07-03）

- **アカウント管理 > 顧客タブ: ページヘッダーが2枚重なる**。AccountManagement 自体の
  PageHeader（「アカウント管理」）の直下に、埋め込みの CustomerManagementContent が
  自前の PageHeader（「顧客／全N名の予約顧客を管理」＋新規顧客ボタン）を描画している。
  タブ側は PageHeader をやめてツールバー行（ボタン・件数のみ）に降格する。
  ※スタッフタブ等、他の埋め込みタブも同型の可能性が高い（改装時に横並びで確認）。
- **顧客管理/アカウント管理の行展開レイアウト（オーナーFB 2026-07-03）**:
  1. 展開内が「ごちゃついている」→ 情報のグルーピングと余白を再設計（顧客情報/メモ/クーポン/体験済み/予約履歴のセクション構造を整理）。
  2. 体験済みシナリオ・予約履歴は件数が増えると縦に伸び続ける → **展開内ページネーション or 「もっと見る」折りたたみ**を入れる。
  3. 「クーポン情報（残高・使用履歴）」と「クーポン操作（付与・保有一覧・取消）」が離れている → **隣接ないし1セクションに統合**する。
