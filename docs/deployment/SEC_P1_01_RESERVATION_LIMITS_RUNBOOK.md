## SEC-P1-01（必須）: 予約制限（締切/上限/件数）検証 Runbook

目的: 予約制限が **フロント依存でfail-openにならず**、DB/RPC側で **fail-closed** に強制されていることを確認する。

### 対象

- 予約作成RPC:
  - `create_reservation_with_lock_v2`
  - `create_reservation_with_lock`（互換維持版）
- 制限ソース:
  - `schedule_events.reservation_deadline_hours`
  - `reservation_settings`（store単位）:
    - `max_participants_per_booking`
    - `advance_booking_days`
    - `same_day_booking_cutoff`
    - `max_bookings_per_customer`

### 1) 本番DBに制限強制が入っているか（必須）

Supabase SQL Editor で以下を実行し、関数定義に制限用の例外（例: `SAME_DAY_CUTOFF_PASSED` 等）が含まれることを確認する。

- `docs/deployment/sql/SEC_P1_01_ts0_check_rpc_defs.sql`

### 2) 改ざん/すり抜けを防げるか（推奨）

制限値を満たさない条件でRPCを叩き、例外コード（`P0033`〜`P0038`）で失敗することを確認する。

> 予約作成は在庫/顧客状態に依存するため、実行可能なデータが無い場合は TS-0 の確認を必須とし、TS-1 は任意。

### エラーコード（DB）

- `P0033`: `ADVANCE_BOOKING_LIMIT`
- `P0034`: `MAX_PARTICIPANTS_PER_BOOKING`
- `P0035`: `MAX_BOOKINGS_PER_CUSTOMER`
- `P0036`: `EVENT_ALREADY_STARTED`
- `P0037`: `RESERVATION_DEADLINE_PASSED`
- `P0038`: `SAME_DAY_CUTOFF_PASSED`

