# 個人情報（PII）レビュー優先度リスト

**目的**: セルフチェック（コストゼロの「1」）で、**氏名・電話・メール**が載る経路から先に人が確認する順序を固定する。  
**関連**: [multi-tenant-security.md](./multi-tenant-security.md) · `npm run check:security-guardrails` · `./scripts/check-multi-tenant.sh`

---

## このアプリで扱う PII の置き場所

| 置き場所 | 主なカラム・内容 |
|----------|------------------|
| `customers` | `name`, `phone`, `email`, ほか `address`, `birth_date` 等 |
| `reservations` | `participant_names`, `customer_notes`、および **`customer_name` / `customer_email` / `customer_phone`**（非正規化） |
| Supabase Auth | `auth.users` のメール（顧客プロフィールと二重管理になり得る） |

`check-multi-tenant.sh` で **`customers` の `.from('customers')` 行**が列挙されたら、下表の **P0 から**当てはまるか確認する（RLS だけで守られている行はスクリプト上「未検出」になり得る）。

---

## 優先度サマリ

- **P0**: 登録・認証・プロフィール・メール照会・紐付け。**IDOR・他人レコード更新・組織越え**の影響が最大。
- **P1**: 予約・貸切・クーポン・スタッフ顧客管理。**予約行に載る連絡先**と **顧客マスタ**の両方。
- **P2**: マイページ周辺の閲覧系（基本は自分の `user_id` だが、クエリの `.eq` を確認）。

---

## P0（最優先でコード＋手動テスト）

| ファイル | 確認ポイント |
|----------|----------------|
| `src/pages/CompleteProfile.tsx` | `customers` の **insert/update**、**メールでの既存検索**、重複時の **user_id 紐付け**。別ユーザーのレコードに触れないか（RLS とアプリ両方）。 |
| `src/AppRoot.tsx` | 顧客の **プロフィール強制**用 `select('id, name, phone, email').eq('user_id', user.id)` — 条件が常に **自分のみ**か。 |
| `src/contexts/AuthContext.tsx` | 顧客名取得、`email` + `user_id IS NULL` での **自動紐付け update**。メール衝突・組織越えの解釈は RLS に依存するため **ポリシーとセット**で確認。 |
| `src/pages/MyPage/pages/SettingsPage.tsx` | プロフィール更新・**アカウント削除**（`customers` delete）。対象 ID が常に本人か。 |
| `src/pages/BookingConfirmation/hooks/useCustomerData.ts` | 予約フローでの顧客読み取り。 |
| `src/pages/BookingConfirmation/hooks/useBookingSubmit.ts` | 予約時の `customers` 参照・更新。 |
| `src/pages/BookingConfirmation/index.tsx` | 同上経路の UI 側。 |
| `src/lib/reservationApi.ts` | **`customer_name` / `customer_email` / `customer_phone`** を含む select・RPC 引数。`customer_id` 不一致時の扱い（既にガードがある行も要確認）。 |
| `src/pages/CustomerManagement/components/CustomerEditModal.tsx` | スタッフによる **顧客 PII 編集**。`organization_id` 境界と RLS。 |
| `src/pages/CustomerManagement/hooks/useCustomerData.ts` | 顧客一覧・取得のスコープ。 |
| `src/pages/PrivateBookingRequest/hooks/usePrivateBookingSubmit.ts` | 貸切申込での `customers` 作成・更新。 |
| `src/pages/PrivateGroupInvite/index.tsx` | `customers` の複数箇所 — **招待トークン・グループ境界**とセットで IDOR がないか。 |
| `src/pages/PrivateGroupManage/components/GroupChat.tsx` | `customers` 取得 — **メンバー以外に見えないか**。 |
| `src/hooks/usePrivateGroup.ts` | グループと `customers` の結びつき。 |

**手動テスト（P0 用）**

1. 顧客アカウント A / B を用意し、B の `customer_id` や予約 ID を A のブラウザで直接指定して **読めない・更新できない**こと。
2. スタッフを組織 X / Y で分け、**Y の顧客が X の管理画面に出ない**こと。

---

## P1（次に確認）

| ファイル | 確認ポイント |
|----------|----------------|
| `src/components/schedule/modal/ReservationList.tsx` | `participant_names`、`customers` への名前検索・紐付け。**スタッフ画面**として組織スコープ内か。 |
| `src/components/schedule/modal/SurveyResponsesTab.tsx` | `customers` とアンケ回答の対応。 |
| `src/pages/PrivateBookingManagement/components/SurveyResponsesView.tsx` | 同上（貸切管理側）。 |
| `src/lib/api/couponApi.ts` | `customers` 多数 — **クーポン所有者・組織**の整合。 |
| `src/pages/CouponPresent.tsx` | クーポン提示フローでの顧客参照。 |
| `src/pages/AddDemoParticipants.tsx` | デモ参加者・`customers` — **本番で意図した権限だけ**か。 |

---

## P2（マイページ・閲覧・付随機能）

確認は「**常に `user_id` または自分の `customer_id` に限定されているか**」「**公開ページで他人の PII を返していないか**」。

| ファイル |
|----------|
| `src/pages/MyPage/index.tsx` |
| `src/pages/MyPage/pages/ReservationsPage.tsx` |
| `src/pages/MyPage/pages/ReservationDetailPage.tsx` |
| `src/pages/MyPage/pages/SettingsPage.tsx`（P0 と重複するが UI 全体） |
| `src/pages/MyPage/pages/AlbumPage.tsx` |
| `src/pages/MyPage/pages/PlayedScenariosPage.tsx` |
| `src/pages/MyPage/pages/LikedScenariosPage.tsx` |
| `src/pages/MyPage/pages/GmHistoryPage.tsx` |
| `src/hooks/useNotifications.ts` |
| `src/hooks/useFavorites.ts` |
| `src/hooks/usePlayedScenarios.ts` |
| `src/hooks/useScheduleData.ts`（`customers` 行は要確認） |
| `src/pages/ScenarioDetailPage/components/ScenarioHero.tsx` |
| `src/pages/ScenarioDetailGlobal/index.tsx` |

---

## `check-multi-tenant.sh` の使い方（このリストとの関係）

- スクリプトは **近傍に `organization_id` の `.eq` があるか**だけを見る。**RLS や RPC 内の制約は見えない**。
- **P0 の `customers` 行**がヒットしたら、そのファイルを開き **「クライアントに organization フィルタが無い理由は RLS だけで十分か」** を判断する。
- **`reservations` / `schedule_events`** は PII が **非正規化カラム**でも載るため、P0 の `reservationApi`・`ReservationList` と合わせて見る。

---

## P0 レビュー実施ログ

### 2026-03-20（コードレビュー＋修正）

- **方針**: 同一 `user_id` に **複数 `organization_id` の `customers` 行**があり得るため、`user_id` のみ＋`.single()` の経路を **イベント／グループ／予約の `organization_id` で絞る**、更新・削除は **二重条件**（`user_id` / `organization_id`）で防御。
- **変更ファイル**:
  - `src/lib/reservationApi.ts` — `updateParticipantCount`: 予約取得後に組織スコープで `customer_id` を解決
  - `src/pages/BookingConfirmation/hooks/useBookingSubmit.ts` — 公演の `organization_id` で顧客検索・更新
  - `src/pages/PrivateBookingRequest/hooks/usePrivateBookingSubmit.ts` — 同上（`getCurrentOrganizationId`）
  - `src/pages/PrivateGroupInvite/index.tsx` — クーポン取得・電話取得・貸切申込の顧客操作を `group.organization_id` でスコープ
  - `src/pages/PrivateGroupManage/components/GroupChat.tsx` — メンバー表示名用 `customers` を `organizationId` でフィルタ
  - `src/pages/CompleteProfile.tsx` — 更新・メール紐付けに `user_id` / `user_id IS NULL` を付与
  - `src/pages/MyPage/pages/SettingsPage.tsx` — プロフィール更新・退会削除に `user_id` + `organization_id`
  - `src/pages/CustomerManagement/components/CustomerEditModal.tsx` — 更新に `organization_id` を付与
- **次の一手（未着手）**: 手動 IDOR テスト（2 アカウント・2 組織）

### 2026-03-20（P1: 予約 UI・クーポン・アンケート）

- **方針**: クーポン・当日公演一覧・マイページクーポンは **`getCurrentOrganizationId()` または予約先 `organization_id`** で `customers` を解決。`useCoupon` は **クーポン行の `customer_id` / `organization_id` と `auth` の突合**に変更。アンケートタブは **グループの `organization_id`** で `customers` をフィルタ。`ReservationList` は **`getCurrentOrganizationId() || event.organization_id`** で組織を決定し INSERT に反映。
- **変更ファイル**: `src/lib/api/couponApi.ts`, `src/pages/CouponPresent.tsx`, `src/components/schedule/modal/ReservationList.tsx`, `src/components/schedule/modal/SurveyResponsesTab.tsx`, `src/pages/PrivateBookingManagement/components/SurveyResponsesView.tsx`

---

## 更新履歴

- 2026-03-20: 初版（コードベースの `.from('customers')` 洗い出しに基づく優先度付け）
- 2026-03-20: P0 実施ログ・マルチ組織顧客行の取り違え防止パッチを追記
- 2026-03-20: P1（クーポン・ReservationList・アンケート）実施ログを追記
