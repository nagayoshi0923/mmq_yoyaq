# supabase db reset 用マイグレーション修正まとめ

## 背景

`database/` 配下の手動スクリプトで作成するテーブルと、`supabase/migrations/` が想定するスキーマが噛み合っておらず、`supabase db reset` 時にエラーが発生していた。  
本ドキュメントは実施した修正と残存リスクをまとめたもの。

---

## 実施済み修正

### 1. ブートストラップ拡張 (20250129000000)

**追加したテーブル**
- global_settings, business_hours_settings
- store_basic_settings, performance_schedule_settings, reservation_settings, pricing_settings
- schedule_event_history

**追加したヘルパー関数**
- is_org_admin(), is_staff_or_admin()

**追加したカラム（主要）**
- stores: region, is_temporary, ownership_type, fixed_costs, franchise_fee, temporary_*, transport_allowance
- scenarios: production_costs, slug, key_visual_url, scenario_type
- customers: email, email_verified, nickname, address, avatar_url
- schedule_events: reservation_deadline_hours, current_participants, max_participants, time_slot, is_reservation_enabled, reservation_notes
- reservations: schedule_event_id, display_customer_name, unit_price
- staff: avatar_url, avatar_color, discord_channel_id

### 2. 条件付き実行に変更したマイグレーション

| ファイル | 変更内容 |
|---------|---------|
| 20260101010000 | ownership_type の UPDATE を IF EXISTS でラップ |
| 20260107000000 | production_costs の UPDATE を IF EXISTS でラップ |
| 20260113000000 | schedule_event_history の ALTER を IF table exists でラップ |
| 20260131004000 | reservation_settings の ALTER を IF table exists でラップ |
| 20260130260000 | trigger_recalc_participants を IF schedule_event_id exists でラップ |
| 20260130093000 | discord_notification_queue の処理を IF table exists でラップ |
| 20260131003000 | booking_email_queue の UNIQUE INDEX を IF table exists でラップ |

### 3. 重複バージョン番号の解消

| 旧 | 新 |
|---|-----|
| 20260201100000_kit_condition.sql | 20260201100001_kit_condition.sql |
| 20260202100000_kit_transfer_completions.sql | 20260202100001_kit_transfer_completions.sql |

---

## 残存リスク（20260210000002 以降）

`20260210000002_fix_is_admin_org_boundary_all_policies.sql` は以下のテーブルにポリシーを設定する。
これらのテーブルは `database/create_settings_tables.sql` や他の手動スクリプトで作成される想定のため、ブートストラップには含めていない。

**存在しない場合にエラーになり得るテーブル**
- booking_notices, customer_settings, daily_memos, data_management_settings
- email_settings, event_categories, notification_settings, sales_report_settings
- scenario_likes, shift_button_states, shift_notifications, staff_settings, system_settings
- authors, external_performance_reports, gm_availability_responses, miscellaneous_transactions

**対処案**
- 必要に応じて上記テーブルをブートストラップに追加する
- または 20260210000002 の該当箇所を `IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'xxx')` でラップする

---

## 重複バージョン確認コマンド

```bash
# 重複するバージョン番号を検出
ls supabase/migrations/20*.sql | while read f; do basename "$f" | grep -oE '^[0-9]+'; done | sort | uniq -c | awk '$1>1{print "Duplicate:", $2}'
```

---

## 今後の開発時の注意

1. **新規マイグレーション**  
   バージョン番号が既存と重複していないか確認する。

2. **database/ のテーブル参照**  
   `ALTER TABLE` や `CREATE POLICY` を行うマイグレーションは、対象テーブルが存在しない場合の挙動（条件付き実行など）を考慮する。

3. **db reset の推奨フロー**  
   - 修正後に `supabase db reset` で検証
   - エラーが出たら、本ドキュメントの「実施済み修正」を参考に対応し、内容を追記する
