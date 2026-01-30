# 本番リリース前 セキュリティ監査（意地悪視点）リスク台帳 / ISSUE

**作成日**: 2026-01-30  
**最終更新日**: 2026-01-31 00:30  
**対象**: 予約サイト/予約システム（フロント: `src/`、DB/RLS/RPC: `database/migrations/`・`supabase/migrations/`、Edge Functions: `supabase/functions/`）  
**スタンス**:
- 既存ISSUE/既存監査を信じない（「直したつもり」を疑う）
- 悪意ある攻撃 + 普通のユーザー事故（複数タブ/通信エラー/誤操作）を両方想定
- 低頻度でも致命傷になるものは拾う

---

## 更新ルール（運用）

- **最終更新日**を更新し、下の「更新履歴」に1行追加
- 追加する項目は `SEC-Px-XX` で番号を振る
- 1項目につき必ず以下を記述:
  - **攻撃/事故シナリオ**
  - **実害**
  - **再現難易度**
  - **根拠（ファイル/関数）**
  - **推奨対策**

### 更新履歴
- 2026-01-30 15:00: 初版作成（P0/P1/P2のたたき台）
- 2026-01-30 17:00: 実装調査完了、P0-05/06追加、修正開始
- 2026-01-30 18:00: SEC-P0-01, P0-03, P0-05, P0-06 修正完了
- 2026-01-30 22:30: SEC-P0-04 貸切承認RPC化 + 本番DBでpass確認、RLS影響を排除（fail-closed）
- 2026-01-30 23:30: SEC-P1-03 監査証跡（reservations_history）を追加（DBトリガで強制）
- 2026-01-31 00:10: SEC-P0-02 予約作成RPCの料金/日時をサーバー確定に統一、本番DBで定義確認
- 2026-01-31 00:30: SEC-P2-02 障害時fail-openを削減（予約制限/営業時間チェックをfail-closed寄りに）

---

## 結論（優先度サマリ）

### P0（即死 / リリース停止判断レベル）

- **SEC-P0-01**: `reservations` の「顧客UPDATE許可」が広すぎる → **✅ 修正完了**（026マイグレーション）
  - 根拠: `database/migrations/025_allow_customer_reservation_update.sql`
  - 対策: 重要列の変更を WITH CHECK でブロック
- **SEC-P0-02**: 予約作成RPCが料金・日時をサーバー側で再計算/検証していない → **✅ 修正完了（本番DBで定義確認）**
  - 対策: 旧RPC/新RPCともに **料金・日時はサーバー側で確定**（クライアント入力を無視）
  - 本番検証: `docs/deployment/SEC_P0_02_PROD_DB_CHECK_RUNBOOK.md`
- **SEC-P0-03**: `notify-waitlist` の **bookingUrlが入力値** → **✅ 修正完了**（サーバー側生成に変更）
  - 根拠: `supabase/functions/notify-waitlist/index.ts`
  - 対策: organizations テーブルから slug/domain を取得して生成
- **SEC-P0-04**: 貸切承認が非アトミック → **✅ 修正完了（本番検証pass）**
  - 根拠: `src/pages/PrivateBookingManagement/hooks/useBookingApproval.ts`（RPC呼び出しへ置換）
  - 対策: `approve_private_booking` RPCで「予約更新 + schedule_events作成 + 紐付け」を1トランザクションで保証
  - 本番検証: `docs/deployment/SEC_P0_04_PRIVATE_BOOKING_APPROVAL_RUNBOOK.md`
- **SEC-P0-05**: `updateParticipantCount` が二重UPDATE → **✅ 修正完了**（直接UPDATE削除）
  - 根拠: `src/lib/reservationApi.ts` L335-348
  - 対策: RPC経由のみに統一
- **SEC-P0-06**: 日程変更が在庫破壊 → **✅ 修正完了**（027マイグレーション + RPC化）
  - 根拠: `src/pages/MyPage/pages/ReservationsPage.tsx` L634-650
  - 対策: `change_reservation_schedule` RPC で在庫をアトミックに調整

### P1（早期対応 / 事故・不正の温床）

- **SEC-P1-01**: 予約締切・最大予約人数などが **フロント依存**（DBで強制されない）/ さらにチェックがfail-open  
  - 根拠: `src/pages/BookingConfirmation/hooks/useBookingSubmit.ts`（`return { allowed: true }` が複数）
- **SEC-P1-02**: 日程変更・人数変更・貸切承認などに **在庫ロック/整合性保証が一貫していない**（競合でUX崩壊/過剰予約誘発）  
  - 根拠: `src/pages/MyPage/pages/ReservationsPage.tsx`、`useBookingApproval.ts` ほか
- **SEC-P1-03**: 監査証跡（誰が/いつ/何を）不足 → **✅ 修正完了（DBトリガで強制）**
  - 対策: `reservations_history` + `trg_reservations_history`（INSERT/UPDATE/DELETE を記録）
  - 本番検証: `docs/deployment/SEC_P1_03_RESERVATIONS_HISTORY_RUNBOOK.md`

### P2（様子見 / 品質・運用改善）

- **SEC-P2-01**: URL由来ID参照（予約詳細）でID試行・列挙がしやすい（RLSで止まる前提だがノイズ/ログ汚染）  
  - 根拠: `src/pages/MyPage/pages/ReservationDetailPage.tsx`
- **SEC-P2-02**: エラー時に「制限しない」設計が残っており、障害時に運用ルール違反が発生し得る → **✅ 修正完了（fail-closed寄りに統一）**
  - 根拠: `src/pages/BookingConfirmation/hooks/useBookingSubmit.ts`（予約制限はfail-closed化済み）
  - 補足: `src/pages/CustomerBookingPage.tsx` の営業時間チェックも、取得/判定エラー時は表示しない（fail-closed）に変更

---

## 懸念点一覧（攻撃/事故シナリオ・実害・再現難易度つき）

### 1. 認可・権限・IDまわり

#### SEC-P0-01: `reservations` の顧客UPDATE許可が広すぎる（列制限なし）

- **攻撃/事故シナリオ**
  - 顧客がブラウザコンソール/SDKで自分の予約行を直接UPDATEし、以下を改ざん:
    - `status` を `cancelled` 相当にして在庫を戻す（トリガがある場合は特に危険）
    - `participant_count` を増減して席数を揺らす
    - `final_price` 等を任意に変更して金額表示/集計を壊す
    - `schedule_event_id` を付け替えて別公演に「移動」（日程変更機能のバイパス）
- **実害**
  - **在庫破壊（残席が嘘になる）**、過剰予約、売上/請求/集計の破壊、顧客間トラブル、現場混乱
- **再現難易度**
  - **低**（自分のJWTでAPI直叩きできれば成立）
- **根拠（ファイル/関数）**
  - `database/migrations/025_allow_customer_reservation_update.sql`  
    - `reservations_update_customer` が「自分の予約ならUPDATE可」を許可（列制限なし）
  - さらに危険増幅: `database/migrations/006_security_rpc_and_notifications.sql`（`reservations`更新で`current_participants`再計算トリガ）
- **推奨対策**
  - 方針: **顧客の直接UPDATEを原則禁止**し、許可する場合も**列単位で厳格化**する
  - 具体策（推奨順）:
    1. `reservations` テーブルの `GRANT UPDATE` を列単位に絞る（例: 顧客は `customer_notes` のみ等）
    2. 重要列（`status`, `participant_count`, `schedule_event_id`, 価格系）は **RPC専用**にしてテーブルUPDATE権限を剥奪
    3. どうしてもテーブルUPDATEするなら、DBトリガで「顧客が触れて良い列以外の変更」を拒否

---

#### SEC-P0-03: `notify-waitlist` が顧客からも呼べる + bookingUrlが入力値

- **攻撃/事故シナリオ**
  - 顧客（当該イベントの予約を1つ持つだけ）が `notify-waitlist` を繰り返し呼び出し、キャンセル待ち登録者へ大量通知を送る（運用破壊）
  - `bookingUrl` にフィッシングURLを入れ、正規の「空席通知」メールとして配布させる
  - `organizationId` を空にしてスタッフ判定をすり抜ける（スタッフ所属orgフィルタが外れる）
- **実害**
  - **フィッシング被害**、メール送信コスト増、ブランド毀損、問い合わせ/炎上、キャンセル待ち導線の破壊
- **再現難易度**
  - **中**（認証は必要だが、顧客でも条件を満たせる設計だと成立）
- **根拠（ファイル/関数）**
  - `supabase/functions/notify-waitlist/index.ts`
    - 権限確認: 「スタッフ」または「そのイベントに予約がある顧客」でもOKになっている
    - `bookingUrl` がリクエストBody由来
- **推奨対策**
  - `notify-waitlist` の呼び出し権限を **スタッフ/管理者に限定**（顧客起動を禁止）
  - `bookingUrl` は **サーバー側で生成**（org slug + 固定パス）し、入力値を無視
  - `organizationId` を必須化し、staff判定で必ず `organization_id = data.organizationId` を要求
  - 監査ログ（誰が何回叩いたか）を残す

---

#### SEC-P2-01: URL由来のreservationId参照（ID試行が容易）

- **攻撃/事故シナリオ**
  - `/mypage/reservation/{id}` を総当りして「存在確認」「タイミング差」「エラー差」を観測する（ID列挙ノイズ）
- **実害**
  - 直接漏洩はRLS次第だが、**監視ログ汚染/負荷**・ヒント漏洩の温床
- **再現難易度**
  - **低**
- **根拠**
  - `src/pages/MyPage/pages/ReservationDetailPage.tsx`（パス末尾をそのまま `.eq('id', reservationId)`）
- **推奨対策**
  - エラーを「存在しない/権限なし」で分岐せず統一
  - 可能なら「自分の予約一覧からのみ遷移（直リンクを無効）」などのUX対策

---

### 2. 予約・キャンセル競合（同時操作）

#### SEC-P1-02: 貸切承認がTOCTOU（確認→確定が非原子）

- **攻撃/事故シナリオ**
  - スタッフAが「空き確認」後、スタッフBが同枠に公演を作成 → Aが承認確定 → ダブルブッキング
- **実害**
  - **ダブルブッキング**、当日現場破綻、顧客補償
- **再現難易度**
  - **中**（複数スタッフ運用で現実的）
- **根拠**
  - `src/pages/PrivateBookingManagement/hooks/useBookingApproval.ts`
    - `schedule_events` の既存チェックはあるが、DB一意制約/ロックで防いでいない
- **推奨対策**
  - DB側で一意制約（例: `date + store_id + time_slot + organization_id`）を設ける or 承認処理をRPC化して `FOR UPDATE` で原子化

---

### 3. フロント依存の危険（JS無効化/直叩き）

#### SEC-P1-01: 予約制限チェックがfail-open（エラー時に「制限しない」）

- **攻撃/事故シナリオ**
  - 通信エラー/一時的RLS/設定取得エラーが起きると、フロントが `allowed: true` を返し、以後のDB側強制が無い制約が素通りする
  - 直叩きでそもそもフロントチェックを通らない
- **実害**
  - 締切超過予約、店舗ルール違反、運用事故、顧客対応コスト増
- **再現難易度**
  - **低〜中**（障害時に自然発生、攻撃なら意図的に誘発も可能）
- **根拠**
  - `src/pages/BookingConfirmation/hooks/useBookingSubmit.ts`
    - `checkReservationLimits` 内でエラー時 `return { allowed: true }`
- **推奨対策**
  - **fail-closed**（エラー時は予約不可）に寄せる
  - 重要制約（締切、最大人数/回数）はDB/RPC側で強制

---

#### SEC-P0-02: 料金・requested_datetimeがクライアント入力（DBで検証不足の疑い）

- **攻撃/事故シナリオ**
  - API直叩きで `p_total_price` / `p_unit_price` / `p_requested_datetime` を改ざんして予約を作成
  - `requested_datetime` を未来/過去にずらして「キャンセル可否/表示/レポート/通知」を壊す
- **実害**
  - 金額・会計・帳票の破壊、キャンセル規約の抜け道、顧客トラブル
- **再現難易度**
  - **中**（RPCパラメータを理解して叩ければ成立）
- **根拠**
  - `src/lib/reservationApi.ts` が `create_reservation_with_lock` に価格/日時を渡す設計
  - DB関数側で「イベント日時・料金の再計算」「p_requested_datetimeとeventの整合」チェックが見当たらない（※最終的に“本番DBに適用されている定義”の確認が必要）
- **推奨対策**
  - DB側で `schedule_events` から **日時を確定**し、`requested_datetime` は入力値を無視
  - 価格はDB側で `scenarios`/`reservation_settings` から再計算（少なくとも範囲/整合チェック）
  - 予約番号生成・価格計算はサーバー側起点（冪等性キーも導入）
  - ✅ 実施済み:
    - `create_reservation_with_lock`（互換維持版）を **料金/日時サーバー確定**に安全化
    - `create_reservation_with_lock_v2` を追加し、フロントは v2 優先 + 旧RPCフォールバック
    - 本番DB確認Runbook（SQLファイル含む）で「改ざんしても反映されない」ことを確認

---

### 4. 状態遷移の穴（境界条件）

#### SEC-P0-04: 貸切承認フローが部分成功し得る（非アトミック）

- **攻撃/事故シナリオ**
  - `reservations` を `confirmed` に更新した後、`schedule_events` insertに失敗
  - `schedule_events` は作れたが `reservations.schedule_event_id` の紐付けに失敗
  - これが再試行/二重クリック/通信断で起きる
- **実害**
  - 「確定したはずがどこにも出ない」「二重で公演が作られる」「予約と公演が不整合」等の事故
- **再現難易度**
  - **中**（通信断/同時操作で現実的）
- **根拠**
  - `src/pages/PrivateBookingManagement/hooks/useBookingApproval.ts` が複数のDB操作を順に実行（トランザクション化されていない）
- **推奨対策**
  - ✅ 実施済み: 承認処理を **DB RPC（1関数）**に寄せて原子化（`approve_private_booking`）
  - ✅ 実施済み: RLS/FORCE RLS の影響で予約更新が0件になり得るため、関数に `SET row_security = off` を付与し、更新0件は例外で **fail-closed**（`P0024`）
  - ✅ 本番検証: `docs/deployment/SEC_P0_04_PRIVATE_BOOKING_APPROVAL_RUNBOOK.md` の TS-0/TS-1 で `pass=true` を確認

---

### 5. エラー時の安全性（通信エラー/リトライ）

#### SEC-P1-XX: 二重送信/再送時の冪等性（予約番号・メール・状態更新）

- **攻撃/事故シナリオ**
  - 予約作成後にネットワークエラー → ユーザーが再送 → 「成功してるのに失敗表示」「二重予約/二重メール」
- **実害**
  - 顧客不信・問い合わせ増・現場混乱
- **再現難易度**
  - **中**（モバイル回線で自然発生）
- **根拠**
  - 予約作成・メール送信が分離され、冪等キーが見当たらない（要最終確認）
- **推奨対策**
  - `idempotency_key`（クライアント生成UUID等）を導入し、DB側で重複を防ぐ
  - メール送信はキュー化して再送（すでに`booking_email_queue`があるなら統一）

---

### 6. ログ・追跡性（監査証跡）

#### SEC-P1-03: 予約の状態変更履歴（誰が/いつ/何を）が不足

- **事故シナリオ**
  - 「予約が勝手にキャンセルされた」「人数が変わった」「金額が変わった」が起きても追えない
- **実害**
  - 再現不能事故、責任分界不明、内部不正の検知不能
- **再現難易度**
  - **高**（“起きてから困る”タイプ）
- **根拠**
  - `schedule_event_history`等はあるが、`reservations`の更新差分・更新者の永続ログが不足している（別途追加調査で確定させる）
- **推奨対策**
  - ✅ 実施済み: `reservations_history`（変更差分・実行者）テーブル + INSERT/UPDATE/DELETEトリガ
  - Edge Function起点の操作も `action_logs` に集約（IP/UA/リクエストID）

---

## 優先度分類（一覧）

### P0（即死）
- SEC-P0-01: `reservations` 顧客UPDATE許可の危険（列制限なし）
- SEC-P0-02: 料金/日時のクライアント入力をDBで検証しない疑い
- SEC-P0-03: `notify-waitlist` 権限/URL注入の問題
- SEC-P0-04: 貸切承認フローの非アトミック（部分成功）

### P1（早期）
- SEC-P1-01: 予約制限チェックfail-open + DB強制不足
- SEC-P1-02: 競合制御の一貫性不足（TOCTOU）
- SEC-P1-03: 監査証跡不足
- SEC-P1-XX: 冪等性（再送/二重処理）

### P2（様子見）
- SEC-P2-01: URL由来ID参照の列挙ノイズ
- SEC-P2-02: 障害時fail-openの残存
  - ✅ 対応済み（予約制限/営業時間チェックのエラー時挙動をfail-closed寄りに）

---

## 参考（既存ドキュメント）

- `docs/SECURITY_VULNERABILITY_AUDIT_2026-01-28.md`
- `docs/RESERVATION_SYSTEM_AUDIT_2026-01-28.md`
- `docs/CRITICAL_FIXES_PLAN.md`

