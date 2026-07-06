# yoyaq ドメイン知識（正）

MMQ（マーダーミステリー店舗）の予約管理システムのドメイン要点。
企画相談・仕様ドラフト・実装時の共通前提。スキーマの正は `supabase/schemas/`、型の正は `src/types/`。

## エンティティ相関（ざっくり）

```
organizations（テナント境界・最上位）
 ├─ stores（店舗。kit_group_id で拠点グループ化）
 ├─ staff（role配列: admin/owner/gm…。user_id で auth.users に紐づく）
 ├─ customers（user_id は未登録なら NULL）
 ├─ organization_scenarios（org がシナリオを「導入」した版。料金・GMコスト・kit_count）
 │    └─ scenario_masters（全org共有のシナリオ原本・グローバルレジストリ）
 ├─ schedule_events（公演枠）── reservations（予約）── coupon_usages
 └─ private_groups（貸切グループ）→ 確定で reservation に紐づく
```

## 主要概念

### シナリオの二層構造
- **scenario_masters** = 原本（タイトル・作者・人数・公式尺）。org間で共有
- **organization_scenarios** = org 導入版（参加費・GMコスト・kit_count・配役方式）
- 公演・予約は両方参照できる。**scenario_master_id が NULL だと給与計算・キット需要から黙って脱落する**（本番273件再リンクの実績あり）

### 公演枠（schedule_events）
- `category`: open / private / gmtest / testplay / offsite / venue_rental(+free) / package / mtg
- 定員 = max_participants、current_participants はトリガー自動計算
- GM = `gms`（staff id 配列）+ `gm_roles`（JSONB: main/sub/staff）
- **重複禁止**: UNIQUE (date, store_id, time_slot, organization_id) WHERE is_cancelled=false
- 60分インターバル: 貸切は<60分ハードブロック。60がハードコード4箇所（負債）

### 予約（reservations）
- status: `pending → confirmed → checked_in → completed` ＋ `cancelled` / `no_show` / `gm_confirmed`
- **アクティブ扱い** = `ACTIVE_RESERVATION_STATUSES = ['pending','confirmed','gm_confirmed','checked_in']`（src/lib/constants.ts。DBトリガーと一致）
- `reservation_source` は必ず constants.ts の定数: web / web_private / phone / walk_in / external / staff_entry / staff_participation / demo_auto / demo
- payment_status: pending / paid / refunded / cancelled

### 貸切（private_groups）
- status: gathering → date_adjusting → booking_requested → confirmed（/cancelled）
- メンバー・候補日・日程回答は別テーブル（private_group_members / _candidate_dates / _date_responses）
- 配役方式 character_assignment_method: 'survey'（アンケート）or 'self'（自己選択）

### 体験済み判定（ネタバレ防止の根幹）
```
played = reservations(過去・非cancelled/no_show) ∪ manual_play_history − customer_played_overrides
```
- override 行がある = 「未体験扱いに戻す」。**非表示 ≠ 未体験**（別概念）

### クーポン
- coupon_campaigns（trigger_type: registration=登録時自動 / manual）
- customer_coupons（status: active / fully_used / expired / revoked、uses_remaining）
- coupon_usages が reservation に紐づく

### キット
- scenario_kit_locations = キット現在位置（org × scenario × kit_number、is_fixed で固定）
- kit_transfer_events（pending/completed/cancelled）+ kit_transfer_completions（実績）
- 移動計画の設計は `docs/design/kit-transfer-planning.md`

### 人の特殊パターン
- **platform customer**: role='customer' で customers.organization_id=NULL。予約は org 横断可能であるべき
- **退職GM**: staff テーブルに残り users.role='customer'。勝手に staff に戻さない
- **temp-ID 予約者**: 編集で400/500の既知バグ（改善計画B1）

### ライセンス
- store_scenario_license_contracts（billing_status: billable / not_billable / exempt / pending_confirmation）
- 報告金額は送信時スナップショットが正。表示とのズレは⚠️バッジで可視化

## 環境

- 本番 Supabase=`cznpcewciwywcqcxktba` / staging=`lavutzztfqbdndjiwluc`
- staging は本番の実データミラー（id保持）。auth.users 非ミラーのため顧客ログインに orphan 罠
- 日付は `src/utils/jstDate.ts` 経由（TZ事故防止）

## さらに詳しく

- 機能一覧: `docs/features.md` / ページ一覧: `docs/pages.md` / 全体像: `docs/system-overview.md`
- 貸切ルール詳細: `docs/private-booking-rules.md`
- マルチテナント: `docs/MULTI_TENANT_ISSUES.md`
