CREATE TRIGGER sync_event_ids BEFORE INSERT OR UPDATE ON schedule_events FOR EACH ROW EXECUTE FUNCTION fn_sync_schedule_events_scenario_ids();
CREATE TRIGGER sync_reservation_ids BEFORE INSERT OR UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION fn_sync_reservations_scenario_ids();
CREATE TRIGGER deadline BEFORE INSERT OR UPDATE OF schedule_event_id,status,participant_count ON reservations FOR EACH ROW EXECUTE FUNCTION enforce_performance_recruitment_booking();
CREATE TRIGGER recalc AFTER INSERT OR DELETE OR UPDATE OF participant_count,status,schedule_event_id ON reservations FOR EACH ROW EXECUTE FUNCTION recalc_current_participants_trigger();
CREATE TRIGGER history AFTER INSERT OR UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION test_audit();
CREATE TRIGGER reservation_change_policy_snapshot BEFORE INSERT OR UPDATE ON reservations FOR EACH ROW EXECUTE FUNCTION set_reservation_change_policy_snapshot();
