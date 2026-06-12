-- =============================================================================
-- 20260612220000: reservations.schedule_event_id の ON DELETE CASCADE を撤廃
-- =============================================================================
-- 問題:
--   公演(schedule_events)を削除すると、外部キーの ON DELETE CASCADE により
--   紐づく申込(reservations)がDBレベルで道連れ削除されていた。
--   アプリ側で「申込はキャンセル状態で保持」に変更しても、直後の公演削除で
--   申込ごと消えてしまい、顧客との取引記録が台帳から失われていた
--   （2026-06-12 オーナー指摘: 記録の保全は業務上必須）。
--
-- 変更:
--   ON DELETE CASCADE → ON DELETE SET NULL
--   公演が消えても申込レコードは残り、公演リンク(schedule_event_id)だけ外れる。
--
-- 影響:
--   - 貸切削除: 申込が「キャンセル」状態で貸切管理に残る（意図どおり）
--   - 通常公演の削除: キャンセル済み予約もレコードとして残る（台帳保全）
--   - スタッフ自動予約(staff_entry)等も残る（孤児化するが参照は NULL で安全）
-- =============================================================================

ALTER TABLE reservations
  DROP CONSTRAINT reservations_schedule_event_id_fkey;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_schedule_event_id_fkey
    FOREIGN KEY (schedule_event_id) REFERENCES schedule_events(id) ON DELETE SET NULL;
