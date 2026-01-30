# SECURITY AUDIT（厳しめ） 2026-01-30

このドキュメントは **GitHub Issue を参照せず**、リポジトリのコード/SQL/Edge Functions を静的に点検して洗い出した脆弱性・リスクのまとめです。  
（この後に Issue 差分照合を行います）

---

## 監査範囲

- **フロントエンド**: `src/**`（supabase-js のクエリ、URLパラメータ利用、マルチテナント境界）
- **Edge Functions**: `supabase/functions/**`（認証/認可、Service Role、CORS、外部通信、ログ、DoS/スパム耐性）
- **DB/SQL**: `supabase/migrations/**`, `database/migrations/**`（RLS、SECURITY DEFINER、row_security=off、GRANT、クロステナント境界）

## 前提（重要）

- 本プロジェクトはマルチテナントであり、**organization_id の境界が最重要**。
- DBはRLSが主防衛だが、Edge Function や SECURITY DEFINER 関数が多く、**RLSをバイパスするコードが攻撃面になり得る**。

---

## サマリー（結論）

- **P0（即対応）**が複数あります。特に **認証なしで「Twitter投稿」や「Service Roleでシフト/スタッフ情報を外部へ送る」** ものは、悪用されると被害が大きいです。
- **P1/P2**は「RLSに依存しているが、防御層として脆い/監査上NG」「ログ/エラー応答の情報漏えい」などが中心です。
- DBのクロステナント漏えいリスクとして、**`calculate_cancellation_fee` が SECURITY DEFINER で authenticated に公開されている**点は要注意です。

---

## 重要度の定義

- **P0**: 認証回避/外部送信/破壊的操作など、即悪用・重大被害が現実的
- **P1**: 重大な情報漏えい/権限逸脱につながる、またはP0の前段
- **P2**: 防御層不足・設定不備・情報露出（RLSが正しければ即致命にはならない）
- **P3**: 改善推奨（ベストプラクティス、将来リスク）

---

## Findings 一覧（要点）

| Sev | タイトル | 影響範囲 |
|---|---|---|
| P0 | 認証なしでTwitter投稿が可能（荒らし/不正投稿） | `supabase/functions/tweet-available-seats` |
| P0 | 認証なしで Service Role を使いシフトを外部送信できる（データ流出/DoS） | `supabase/functions/sync-shifts-to-google-sheet` |
| P0 | お問い合わせFunctionが「任意の宛先へ送れる」メール中継になり得る（スパム/悪用） | `supabase/functions/send-contact-inquiry` |
| P1 | DiscordシフトInteractionが常に署名検証で失敗（機能停止） | `supabase/functions/discord-shift-interactions` |
| P1 | Twitter告知で key_visual_url を無検証 fetch（SSRF/内部到達の芽） | `supabase/functions/tweet-available-seats` |
| P1 | SECURITY DEFINER 関数が org 権限チェックなしで公開（クロステナント漏えいの芽） | `database/migrations/014_cancellation_fee_by_booking_type.sql` |
| P2 | stores 更新/削除が organization_id フィルタなし（RLS依存の脆さ） | `src/lib/api/storeApi.ts` |
| P2 | customers 取得が organization_id フィルタなし（複数組織所属時に混線） | `src/pages/MyPage/pages/SettingsPage.tsx` |
| P2 | scenarios 取得が organization_id フィルタなし（URL由来IDで横断参照の芽） | `src/pages/CustomerBookingPage.tsx` |
| P2 | CORS が「許可外 origin でも prod origin を返す」 | `supabase/functions/_shared/security.ts` |
| P2 | 一部Edge Functionが stack trace をレスポンスに含める | `supabase/functions/sync-shifts-to-google-sheet` |
| P3 | Service Role key の比較が単純比較（タイミング差） | 複数Functions |

---

## 詳細 Findings

### P0: 認証なしでTwitter投稿が可能（荒らし/不正投稿）

- **対象**: `supabase/functions/tweet-available-seats/index.ts`
- **根拠**
  - `serve(async (req) => { ... })` 内に **認証/認可チェックが存在しない**
  - `TWITTER_*` の秘密情報 + `SUPABASE_SERVICE_ROLE_KEY` を使用して公演取得・投稿を実行
- **悪用シナリオ**
  - 攻撃者が Function URL を叩くだけで、意図しない大量投稿/連投が可能（ブランド毀損・アカウント凍結）
- **推奨対策**
  - 入口で **Service Role key 必須**（Cronのみ許可）または **verifyAuth + 管理者ロール必須**
  - **rate limit**（IP/組織単位）を追加
  - 可能なら「実行許可トークン（別secret）」を追加して二重防衛

### P0: 認証なしで Service Role を使いシフトを外部送信できる（データ流出/DoS）

- **対象**: `supabase/functions/sync-shifts-to-google-sheet/index.ts`
- **根拠**
  - 認証チェックがなく、`SUPABASE_SERVICE_ROLE_KEY` で `shift_submissions` / `staff` を取得し外部へPOST
  - 失敗時に **stack trace をレスポンスに含める**（`stack: errorStack`）
- **悪用シナリオ**
  - 第三者が繰り返し呼び出して、外部（Google Apps Script）へシフト情報を大量送信（データ流出/DoS）
  - エラーを誘発して内部情報（スタック等）を回収
- **推奨対策**
  - 入口で **Service Role key 必須**（Cron/運用者のみ）または verifyAuth（admin/owner）必須
  - `organization_id` を必須パラメータ化し、対象組織を制限（全件同期禁止）
  - エラー応答から `stack`/詳細を除去（`sanitizeErrorMessage` などへ統一）

### P0: お問い合わせFunctionが「任意の宛先へ送れる」メール中継になり得る（スパム/悪用）

- **対象**: `supabase/functions/send-contact-inquiry/index.ts`
- **根拠**
  - 認証なし（公開用）なのは意図として理解できるが、`toEmail = contactEmail || DEFAULT_CONTACT_EMAIL` で **リクエストの `contactEmail` をそのまま宛先採用**
  - レート制限/ハニーポット/CAPTCHA が実装されていない（コメントと不一致）
- **悪用シナリオ**
  - 攻撃者が `contactEmail` に任意の宛先を入れて大量送信 → **オープンメールリレー相当**
- **推奨対策**
  - **宛先をリクエストで受け取らない**（`organizationId` からDB設定で決定）
  - どうしても必要なら、宛先を **許可リスト（ドメイン/アドレス）** に限定
  - IP単位の rate limit + honeypot + CAPTCHA（Turnstile等）を追加

### P1: DiscordシフトInteractionが常に署名検証で失敗（機能停止）

- **対象**: `supabase/functions/discord-shift-interactions/index.ts`
- **根拠**
  - `verifySignature()` 内で `hexToUint8Array(DISCORD_PUBLIC_KEY)` を参照しているが、`DISCORD_PUBLIC_KEY` は定義されていない（`FALLBACK_DISCORD_PUBLIC_KEY` は存在）
  - `updateMessageButtons()` で `Authorization: Bot ${DISCORD_BOT_TOKEN}` を参照しているが、`DISCORD_BOT_TOKEN` は定義されていない（fallbackは存在）
  - 結果として `verifySignature` が例外→ `false` で **常に 401**
- **推奨対策**
  - 参照変数を fallback/組織設定に統一（`FALLBACK_DISCORD_PUBLIC_KEY` / `FALLBACK_DISCORD_BOT_TOKEN` など）
  - 併せて `shift_submissions` upsert に **organization_id を必ず含める**（insertパスでNOT NULLに抵触しうる）

### P1: Twitter告知で key_visual_url を無検証 fetch（SSRF/内部到達の芽）

- **対象**: `supabase/functions/tweet-available-seats/index.ts`
- **根拠**
  - `const imageUrl = event.scenarios?.key_visual_url` → `fetch(imageUrl)` に直結
- **悪用シナリオ**
  - もし `key_visual_url` が編集可能なら、攻撃者が内部向けURLや巨大レスポンスURLを設定し、Function経由でSSRF/DoSの踏み台に
- **推奨対策**
  - URLのスキーム/ホストを **許可リスト**で検証（`https`のみ、許可ドメインのみ）
  - private IP/metadata IP への到達を拒否（可能なら）
  - 取得サイズ/タイムアウト制限

### P1: SECURITY DEFINER 関数が org 権限チェックなしで公開（クロステナント漏えいの芽）

- **対象**: `database/migrations/014_cancellation_fee_by_booking_type.sql`（`calculate_cancellation_fee(UUID)`）
- **根拠**
  - `SECURITY DEFINER` で `reservations` / `schedule_events` / `reservation_settings` を参照
  - `GRANT EXECUTE ... TO authenticated`
  - 関数内で **呼び出しユーザーの organization_id / 権限検証がない**
- **悪用シナリオ**
  - 予約ID（UUID）が何らかの経路で漏れた場合、別組織の予約に関する情報（貸切フラグ/時間差等）を取得できる
- **推奨対策**
  - `get_user_organization_id()` と `v_reservation.organization_id` の一致チェック、または is_org_admin() の条件を追加
  - 可能なら authenticated 公開をやめ、必要ロールのみに制限

### P2: stores 更新/削除が organization_id フィルタなし（RLS依存の脆さ）

- **対象**: `src/lib/api/storeApi.ts`
- **根拠**
  - `updateDisplayOrder`: `.update(...).eq('id', id)` のみ
  - `update/delete`: `.eq('id', id)` のみ
- **推奨対策**
  - defense-in-depth として `.eq('organization_id', orgId)` を追加（`getCurrentOrganizationId()` を必須化）

### P2: customers 取得が organization_id フィルタなし（複数組織所属時に混線）

- **対象**: `src/pages/MyPage/pages/SettingsPage.tsx`
- **根拠**
  - `fetchCustomerInfo()` が `customers` を `user_id` or `email` だけで検索し、`organization_id` を絞っていない
- **推奨対策**
  - `organizationId` があるときは必ず `.eq('organization_id', organizationId)`

### P2: scenarios 取得が organization_id フィルタなし（URL由来IDで横断参照の芽）

- **対象**: `src/pages/CustomerBookingPage.tsx`
- **根拠**
  - `calculateParticipationFee()` が `scenarios` を `.eq('id', scenarioId)` のみで取得
- **推奨対策**
  - 組織コンテキストがある場合は `.eq('organization_id', orgId)` を追加

### P2: CORS が「許可外 origin でも prod origin を返す」

- **対象**: `supabase/functions/_shared/security.ts`
- **根拠**
  - `allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]`
- **影響**
  - “CORSで弾く”という意味では弱い（※CORSはcurl等を止められないが、ブラウザ上の誤設定としても危険）
- **推奨対策**
  - 許可外は `Access-Control-Allow-Origin` を返さない/空にする
  - 環境変数で prod/staging を分離

### P3: Service Role key の比較が単純比較（タイミング差）

- **対象**: `supabase/functions/*` の `isServiceRoleCall` など
- **所感**
  - ネットワーク越しのタイミング攻撃は現実性が低いが、改善可能なら `timingSafeEqual` 等を検討

---

## “誤検知”として除外した/要再確認の項目

- `change_reservation_schedule` の「別組織イベントへ移せる」指摘:
  - 新イベント取得に `AND organization_id = v_org_id` が入っており、少なくともSQL上はクロステナント移動を抑止している。
  - ただし「誰が呼べるべきか（customer限定/スタッフもOK）」は要件確認が必要。

---

## 推奨アクション（最短で安全にする順）

### すぐ（P0）
1. `tweet-available-seats`: **認証追加（Cron限定）+ rate limit**
2. `sync-shifts-to-google-sheet`: **認証追加（Cron/管理者限定）+ stack除去**
3. `send-contact-inquiry`: **宛先をリクエストから受け取らない** + rate limit + CAPTCHA/ハニーポット

### 次（P1）
4. `discord-shift-interactions`: 変数参照の修正 + `organization_id` を含めた upsert
5. `tweet-available-seats`: `key_visual_url` fetch のURL検証（SSRF/DoS対策）
6. `calculate_cancellation_fee`: org/権限チェック追加 or 権限制限

### その次（P2）
7. `storeApi`/`SettingsPage`/`CustomerBookingPage`: org フィルタを統一して defense-in-depth
8. CORS方針の整理（prod/staging/localhostの扱い）

