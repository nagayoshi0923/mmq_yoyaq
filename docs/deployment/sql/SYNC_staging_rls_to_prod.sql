-- ============================================================
-- Production RLS policies - complete dump
-- Generated from production schema dump
-- ============================================================

BEGIN;

-- Drop ALL existing staging policies
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Enable RLS on all tables
ALTER TABLE "public"."ai_generations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."authors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."booking_email_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."booking_notices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."business_hours_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."character_relationships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."contact_inquiries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."customer_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."daily_memos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."data_management_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."discord_notification_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."email_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."event_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."external_performance_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."game_ai_generations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."game_character_relationships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."game_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."game_online_scenarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."game_play_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."game_players" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."game_scenario_characters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."game_scenario_clues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."game_scenario_collaborators" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."game_scenario_phases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."game_scenario_purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."game_scenario_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."game_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."game_votes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."global_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."gm_availability_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."inventory_consistency_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."kit_transfer_completions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."kit_transfer_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."license_report_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."manual_external_performances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."miscellaneous_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notification_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."online_scenarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organization_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organization_scenarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organization_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."performance_cancellation_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."performance_kits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."performance_schedule_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."play_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pricing_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."private_booking_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."rate_limit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."rate_limit_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."reservation_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."reservations_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sales_report_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."scenario_characters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."scenario_clues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."scenario_collaborators" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."scenario_kit_locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."scenario_likes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."scenario_master_corrections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."scenario_masters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."scenario_parts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."scenario_phases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."scenario_purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."scenario_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."scenarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."schedule_event_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."schedule_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."shift_button_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."shift_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."shift_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."staff_scenario_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."staff_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."store_basic_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."stores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."waitlist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."waitlist_notification_queue" ENABLE ROW LEVEL SECURITY;

-- Create all production policies
CREATE POLICY "Admins and staff can view all likes" ON "public"."scenario_likes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"public"."app_role", 'staff'::"public"."app_role"]))))));

CREATE POLICY "Allow anon read active organizations" ON "public"."organizations" FOR SELECT TO "anon" USING (("is_active" = true));

CREATE POLICY "Allow anon read active stores" ON "public"."stores" FOR SELECT TO "anon" USING (("status" = 'active'::"text"));

CREATE POLICY "Allow authenticated users to insert gm_availability_responses" ON "public"."gm_availability_responses" FOR INSERT TO "authenticated" WITH CHECK (true);

CREATE POLICY "Anyone can view reviews" ON "public"."scenario_reviews" FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert waitlist" ON "public"."waitlist" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ((("customer_id" IN ( SELECT "customers"."id"
   FROM "public"."customers"
  WHERE ("customers"."user_id" = "auth"."uid"()))) AND (("customer_email")::"text" = "auth"."email"())) OR ("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"()))))));

CREATE POLICY "Block direct insert" ON "public"."user_notifications" FOR INSERT WITH CHECK (false);

CREATE POLICY "Collaborators can view their collaborations" ON "public"."scenario_collaborators" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."online_scenarios"
  WHERE (("online_scenarios"."id" = "scenario_collaborators"."scenario_id") AND ("online_scenarios"."created_by" = "auth"."uid"()))))));

CREATE POLICY "Enable insert for authenticated users" ON "public"."shift_button_states" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));

CREATE POLICY "Enable insert for authenticated users" ON "public"."shift_notifications" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));

CREATE POLICY "Enable read access for all users" ON "public"."staff_scenario_assignments" FOR SELECT USING (true);

CREATE POLICY "Enable read access for authenticated users" ON "public"."shift_button_states" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));

CREATE POLICY "Enable read access for authenticated users" ON "public"."shift_notifications" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));

CREATE POLICY "Enable update for authenticated users" ON "public"."shift_button_states" FOR UPDATE USING (("auth"."role"() = 'authenticated'::"text"));

CREATE POLICY "Hosts can delete their sessions" ON "public"."game_sessions" FOR DELETE USING (("auth"."uid"() = "host_user_id"));

CREATE POLICY "Hosts can update their sessions" ON "public"."game_sessions" FOR UPDATE USING (("auth"."uid"() = "host_user_id"));

CREATE POLICY "Players can send messages" ON "public"."game_messages" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."game_players"
  WHERE (("game_players"."id" = "game_messages"."sender_player_id") AND ("game_players"."user_id" = "auth"."uid"())))));

CREATE POLICY "Players can view messages in their sessions" ON "public"."game_messages" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."game_players"
  WHERE (("game_players"."session_id" = "game_messages"."session_id") AND ("game_players"."user_id" = "auth"."uid"())))) AND (("recipient_player_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."game_players"
  WHERE (("game_players"."id" = "game_messages"."recipient_player_id") AND ("game_players"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."game_players"
  WHERE (("game_players"."id" = "game_messages"."sender_player_id") AND ("game_players"."user_id" = "auth"."uid"())))))));

CREATE POLICY "Players can view votes in their sessions" ON "public"."game_votes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."game_players"
  WHERE (("game_players"."session_id" = "game_votes"."session_id") AND ("game_players"."user_id" = "auth"."uid"())))));

CREATE POLICY "Players can vote" ON "public"."game_votes" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."game_players"
  WHERE (("game_players"."id" = "game_votes"."voter_player_id") AND ("game_players"."user_id" = "auth"."uid"())))));

CREATE POLICY "Scenario owners can manage characters" ON "public"."scenario_characters" USING ((EXISTS ( SELECT 1
   FROM "public"."online_scenarios"
  WHERE (("online_scenarios"."id" = "scenario_characters"."scenario_id") AND ("online_scenarios"."created_by" = "auth"."uid"())))));

CREATE POLICY "Scenario owners can manage clues" ON "public"."scenario_clues" USING ((EXISTS ( SELECT 1
   FROM "public"."online_scenarios"
  WHERE (("online_scenarios"."id" = "scenario_clues"."scenario_id") AND ("online_scenarios"."created_by" = "auth"."uid"())))));

CREATE POLICY "Scenario owners can manage collaborators" ON "public"."scenario_collaborators" USING ((EXISTS ( SELECT 1
   FROM "public"."online_scenarios"
  WHERE (("online_scenarios"."id" = "scenario_collaborators"."scenario_id") AND ("online_scenarios"."created_by" = "auth"."uid"())))));

CREATE POLICY "Scenario owners can manage parts" ON "public"."scenario_parts" USING ((EXISTS ( SELECT 1
   FROM "public"."online_scenarios"
  WHERE (("online_scenarios"."id" = "scenario_parts"."scenario_id") AND ("online_scenarios"."created_by" = "auth"."uid"())))));

CREATE POLICY "Scenario owners can manage phases" ON "public"."scenario_phases" USING ((EXISTS ( SELECT 1
   FROM "public"."online_scenarios"
  WHERE (("online_scenarios"."id" = "scenario_phases"."scenario_id") AND ("online_scenarios"."created_by" = "auth"."uid"())))));

CREATE POLICY "Scenario owners can manage relationships" ON "public"."character_relationships" USING ((EXISTS ( SELECT 1
   FROM "public"."online_scenarios"
  WHERE (("online_scenarios"."id" = "character_relationships"."scenario_id") AND ("online_scenarios"."created_by" = "auth"."uid"())))));

CREATE POLICY "Users can create generations for their scenarios" ON "public"."ai_generations" FOR INSERT WITH CHECK ((("auth"."uid"() = "created_by") AND (EXISTS ( SELECT 1
   FROM "public"."online_scenarios"
  WHERE (("online_scenarios"."id" = "ai_generations"."scenario_id") AND ("online_scenarios"."created_by" = "auth"."uid"()))))));

CREATE POLICY "Users can create play history" ON "public"."play_history" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can create purchases" ON "public"."scenario_purchases" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can create scenarios" ON "public"."online_scenarios" FOR INSERT WITH CHECK (("auth"."uid"() = "created_by"));

CREATE POLICY "Users can create sessions" ON "public"."game_sessions" FOR INSERT WITH CHECK (("auth"."uid"() = "host_user_id"));

CREATE POLICY "Users can create their own likes" ON "public"."scenario_likes" FOR INSERT WITH CHECK (("auth"."uid"() IN ( SELECT "customers"."user_id"
   FROM "public"."customers"
  WHERE ("customers"."id" = "scenario_likes"."customer_id"))));

CREATE POLICY "Users can delete own or org waitlist" ON "public"."waitlist" FOR DELETE USING (((("customer_email")::"text" = "auth"."email"()) OR ("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can delete their org manual externals" ON "public"."manual_external_performances" FOR DELETE USING (("organization_id" IN ( SELECT "users"."organization_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));

CREATE POLICY "Users can delete their own likes" ON "public"."scenario_likes" FOR DELETE USING (("auth"."uid"() IN ( SELECT "customers"."user_id"
   FROM "public"."customers"
  WHERE ("customers"."id" = "scenario_likes"."customer_id"))));

CREATE POLICY "Users can delete their own notifications" ON "public"."user_notifications" FOR DELETE USING ((("user_id" = "auth"."uid"()) OR ("customer_id" IN ( SELECT "customers"."id"
   FROM "public"."customers"
  WHERE ("customers"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can delete their own scenarios" ON "public"."online_scenarios" FOR DELETE USING (("auth"."uid"() = "created_by"));

CREATE POLICY "Users can insert own organization settings" ON "public"."global_settings" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"()))));

CREATE POLICY "Users can insert their org manual externals" ON "public"."manual_external_performances" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "users"."organization_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));

CREATE POLICY "Users can join sessions" ON "public"."game_players" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can leave sessions" ON "public"."game_players" FOR DELETE USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can manage their own reviews" ON "public"."scenario_reviews" USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can read own organization settings" ON "public"."global_settings" FOR SELECT USING (("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"()))));

CREATE POLICY "Users can update own or org waitlist" ON "public"."waitlist" FOR UPDATE USING (((("customer_email")::"text" = "auth"."email"()) OR ("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can update own organization settings" ON "public"."global_settings" FOR UPDATE USING (("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"()))));

CREATE POLICY "Users can update their org manual externals" ON "public"."manual_external_performances" FOR UPDATE USING (("organization_id" IN ( SELECT "users"."organization_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));

CREATE POLICY "Users can update their own notifications" ON "public"."user_notifications" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR ("customer_id" IN ( SELECT "customers"."id"
   FROM "public"."customers"
  WHERE ("customers"."user_id" = "auth"."uid"()))))) WITH CHECK ((("user_id" = "auth"."uid"()) OR ("customer_id" IN ( SELECT "customers"."id"
   FROM "public"."customers"
  WHERE ("customers"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can update their own player record" ON "public"."game_players" FOR UPDATE USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can update their own scenarios" ON "public"."online_scenarios" FOR UPDATE USING (("auth"."uid"() = "created_by"));

CREATE POLICY "Users can view characters of accessible scenarios" ON "public"."scenario_characters" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."online_scenarios"
  WHERE (("online_scenarios"."id" = "scenario_characters"."scenario_id") AND (("online_scenarios"."is_published" = true) OR ("online_scenarios"."created_by" = "auth"."uid"()))))));

CREATE POLICY "Users can view clues of accessible scenarios" ON "public"."scenario_clues" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."online_scenarios"
  WHERE (("online_scenarios"."id" = "scenario_clues"."scenario_id") AND (("online_scenarios"."is_published" = true) OR ("online_scenarios"."created_by" = "auth"."uid"()))))));

CREATE POLICY "Users can view own or org waitlist" ON "public"."waitlist" FOR SELECT USING (((("customer_email")::"text" = "auth"."email"()) OR ("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can view parts of accessible scenarios" ON "public"."scenario_parts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."online_scenarios"
  WHERE (("online_scenarios"."id" = "scenario_parts"."scenario_id") AND (("online_scenarios"."is_published" = true) OR ("online_scenarios"."created_by" = "auth"."uid"()))))));

CREATE POLICY "Users can view phases of accessible scenarios" ON "public"."scenario_phases" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."online_scenarios"
  WHERE (("online_scenarios"."id" = "scenario_phases"."scenario_id") AND (("online_scenarios"."is_published" = true) OR ("online_scenarios"."created_by" = "auth"."uid"()))))));

CREATE POLICY "Users can view players in accessible sessions" ON "public"."game_players" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."game_sessions" "gs"
  WHERE (("gs"."id" = "game_players"."session_id") AND (((("gs"."settings" ->> 'is_private'::"text"))::boolean = false) OR ("gs"."host_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."game_players" "gp"
          WHERE (("gp"."session_id" = "gs"."id") AND ("gp"."user_id" = "auth"."uid"())))))))));

CREATE POLICY "Users can view public sessions or their sessions" ON "public"."game_sessions" FOR SELECT USING ((((("settings" ->> 'is_private'::"text"))::boolean = false) OR ("host_user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."game_players"
  WHERE (("game_players"."session_id" = "game_sessions"."id") AND ("game_players"."user_id" = "auth"."uid"()))))));

CREATE POLICY "Users can view published scenarios" ON "public"."online_scenarios" FOR SELECT USING (("is_published" = true));

CREATE POLICY "Users can view relationships of accessible scenarios" ON "public"."character_relationships" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."online_scenarios"
  WHERE (("online_scenarios"."id" = "character_relationships"."scenario_id") AND (("online_scenarios"."is_published" = true) OR ("online_scenarios"."created_by" = "auth"."uid"()))))));

CREATE POLICY "Users can view their org manual externals" ON "public"."manual_external_performances" FOR SELECT USING (("organization_id" IN ( SELECT "users"."organization_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));

CREATE POLICY "Users can view their own generations" ON "public"."ai_generations" FOR SELECT USING (("auth"."uid"() = "created_by"));

CREATE POLICY "Users can view their own likes" ON "public"."scenario_likes" FOR SELECT USING (("auth"."uid"() IN ( SELECT "customers"."user_id"
   FROM "public"."customers"
  WHERE ("customers"."id" = "scenario_likes"."customer_id"))));

CREATE POLICY "Users can view their own notifications" ON "public"."user_notifications" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("customer_id" IN ( SELECT "customers"."id"
   FROM "public"."customers"
  WHERE ("customers"."user_id" = "auth"."uid"())))));

CREATE POLICY "Users can view their own play history" ON "public"."play_history" FOR SELECT USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can view their own purchases" ON "public"."scenario_purchases" FOR SELECT USING (("auth"."uid"() = "user_id"));

CREATE POLICY "Users can view their own scenarios" ON "public"."online_scenarios" FOR SELECT USING (("auth"."uid"() = "created_by"));

CREATE POLICY "admin_full_access" ON "public"."business_hours_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"public"."app_role")))));

CREATE POLICY "anon_read_business_hours" ON "public"."business_hours_settings" FOR SELECT TO "anon" USING (true);

CREATE POLICY "audit_logs_admin_only" ON "public"."audit_logs" FOR SELECT USING (("public"."is_admin"() OR ("auth"."role"() = 'service_role'::"text")));

CREATE POLICY "authenticated_full_access" ON "public"."business_hours_settings" TO "authenticated" USING (true) WITH CHECK (true);

CREATE POLICY "authors_delete_admin" ON "public"."authors" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "authors_insert_admin" ON "public"."authors" FOR INSERT WITH CHECK ("public"."is_admin"());

CREATE POLICY "authors_select_all" ON "public"."authors" FOR SELECT USING (true);

CREATE POLICY "authors_update_admin" ON "public"."authors" FOR UPDATE USING ("public"."is_admin"());

CREATE POLICY "booking_notices_manage_own_org" ON "public"."booking_notices" USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL)))) WITH CHECK (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "booking_notices_org_policy" ON "public"."booking_notices" USING ((("organization_id" = "public"."current_organization_id"()) OR ("organization_id" IS NULL) OR ("public"."current_organization_id"() IS NULL) OR "public"."is_admin"()));

CREATE POLICY "booking_notices_select_own_org" ON "public"."booking_notices" FOR SELECT USING ((("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL)));

CREATE POLICY "booking_notices_strict" ON "public"."booking_notices" USING (
CASE
    WHEN ("public"."get_user_organization_id"() IS NOT NULL) THEN (("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"())
    ELSE true
END);

CREATE POLICY "business_hours_settings_delete_admin" ON "public"."business_hours_settings" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "business_hours_settings_insert_admin" ON "public"."business_hours_settings" FOR INSERT WITH CHECK ("public"."is_admin"());

CREATE POLICY "business_hours_settings_org_policy" ON "public"."business_hours_settings" USING ((("organization_id" = "public"."current_organization_id"()) OR ("organization_id" IS NULL) OR ("public"."current_organization_id"() IS NULL) OR "public"."is_admin"()));

CREATE POLICY "business_hours_settings_select_admin" ON "public"."business_hours_settings" FOR SELECT USING ("public"."is_admin"());

CREATE POLICY "business_hours_settings_strict" ON "public"."business_hours_settings" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "business_hours_settings_update_admin" ON "public"."business_hours_settings" FOR UPDATE USING ("public"."is_admin"());

CREATE POLICY "contact_inquiries_service_policy" ON "public"."contact_inquiries" USING (true) WITH CHECK (true);

CREATE POLICY "corrections_insert" ON "public"."scenario_master_corrections" FOR INSERT WITH CHECK ("public"."is_staff_or_admin"());

CREATE POLICY "corrections_select" ON "public"."scenario_master_corrections" FOR SELECT USING (("public"."is_license_admin"() OR ("requested_by_organization_id" = "public"."get_user_organization_id"())));

CREATE POLICY "corrections_update" ON "public"."scenario_master_corrections" FOR UPDATE USING ("public"."is_license_admin"());

CREATE POLICY "customer_settings_delete_own_org" ON "public"."customer_settings" FOR DELETE USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "customer_settings_insert_own_org" ON "public"."customer_settings" FOR INSERT WITH CHECK (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "customer_settings_org_policy" ON "public"."customer_settings" USING ((("organization_id" = "public"."current_organization_id"()) OR ("organization_id" IS NULL) OR ("public"."current_organization_id"() IS NULL) OR "public"."is_admin"()));

CREATE POLICY "customer_settings_select_own_org" ON "public"."customer_settings" FOR SELECT USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "customer_settings_strict" ON "public"."customer_settings" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "customer_settings_update_own_org" ON "public"."customer_settings" FOR UPDATE USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "customers_delete_admin" ON "public"."customers" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "customers_delete_unified" ON "public"."customers" FOR DELETE USING (("public"."is_org_admin"() AND ("organization_id" = "public"."get_user_organization_id"())));

CREATE POLICY "customers_insert_self_or_admin" ON "public"."customers" FOR INSERT WITH CHECK (("public"."is_admin"() OR ("user_id" = "auth"."uid"())));

CREATE POLICY "customers_insert_unified" ON "public"."customers" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) OR ("public"."is_staff_or_admin"() AND ("organization_id" = "public"."get_user_organization_id"()))));

CREATE POLICY "customers_select_self_or_admin" ON "public"."customers" FOR SELECT USING (("public"."is_admin"() OR ("user_id" = "auth"."uid"())));

CREATE POLICY "customers_select_unified" ON "public"."customers" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (("auth"."uid"() IS NOT NULL) AND ("organization_id" = "public"."get_user_organization_id"()))));

CREATE POLICY "customers_update_self_or_admin" ON "public"."customers" FOR UPDATE USING (("public"."is_admin"() OR ("user_id" = "auth"."uid"())));

CREATE POLICY "customers_update_unified" ON "public"."customers" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR ("public"."is_staff_or_admin"() AND ("organization_id" = "public"."get_user_organization_id"()))));

CREATE POLICY "daily_memos_admin_staff_policy" ON "public"."daily_memos" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"public"."app_role", 'staff'::"public"."app_role"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"public"."app_role", 'staff'::"public"."app_role"]))))));

CREATE POLICY "daily_memos_customer_read_policy" ON "public"."daily_memos" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'customer'::"public"."app_role")))));

CREATE POLICY "daily_memos_delete_staff_or_admin" ON "public"."daily_memos" FOR DELETE USING ("public"."is_staff_or_admin"());

CREATE POLICY "daily_memos_insert_staff_or_admin" ON "public"."daily_memos" FOR INSERT WITH CHECK ("public"."is_staff_or_admin"());

CREATE POLICY "daily_memos_org_policy" ON "public"."daily_memos" USING ((("organization_id" = "public"."current_organization_id"()) OR ("organization_id" IS NULL) OR ("public"."current_organization_id"() IS NULL) OR "public"."is_admin"()));

CREATE POLICY "daily_memos_select_staff_or_admin" ON "public"."daily_memos" FOR SELECT USING ("public"."is_staff_or_admin"());

CREATE POLICY "daily_memos_strict" ON "public"."daily_memos" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "daily_memos_update_staff_or_admin" ON "public"."daily_memos" FOR UPDATE USING ("public"."is_staff_or_admin"());

CREATE POLICY "data_management_settings_delete_admin" ON "public"."data_management_settings" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "data_management_settings_manage_own_org" ON "public"."data_management_settings" USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "data_management_settings_org_policy" ON "public"."data_management_settings" USING ((("organization_id" = "public"."current_organization_id"()) OR ("organization_id" IS NULL) OR ("public"."current_organization_id"() IS NULL) OR "public"."is_admin"()));

CREATE POLICY "data_management_settings_select_own_org" ON "public"."data_management_settings" FOR SELECT USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "data_management_settings_strict" ON "public"."data_management_settings" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "data_management_settings_update_admin" ON "public"."data_management_settings" FOR UPDATE USING ("public"."is_admin"());

CREATE POLICY "discord_queue_admin" ON "public"."discord_notification_queue" USING ("public"."is_org_admin"());

CREATE POLICY "email_settings_delete_admin" ON "public"."email_settings" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "email_settings_insert_admin" ON "public"."email_settings" FOR INSERT WITH CHECK ("public"."is_admin"());

CREATE POLICY "email_settings_org_policy" ON "public"."email_settings" USING ((("organization_id" = "public"."current_organization_id"()) OR ("organization_id" IS NULL) OR ("public"."current_organization_id"() IS NULL) OR "public"."is_admin"()));

CREATE POLICY "email_settings_select_admin" ON "public"."email_settings" FOR SELECT USING ("public"."is_admin"());

CREATE POLICY "email_settings_strict" ON "public"."email_settings" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "email_settings_update_admin" ON "public"."email_settings" FOR UPDATE USING ("public"."is_admin"());

CREATE POLICY "event_categories_org_policy" ON "public"."event_categories" USING ((("organization_id" = "public"."current_organization_id"()) OR ("organization_id" IS NULL) OR ("public"."current_organization_id"() IS NULL) OR "public"."is_admin"()));

CREATE POLICY "external_performance_reports_strict" ON "public"."external_performance_reports" USING (
CASE
    WHEN ("public"."get_user_organization_id"() IS NOT NULL) THEN (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL) OR "public"."is_org_admin"())
    ELSE true
END);

CREATE POLICY "external_reports_org_delete" ON "public"."external_performance_reports" FOR DELETE USING (((("organization_id" = "public"."current_organization_id"()) AND ("status" = 'pending'::"text")) OR "public"."is_admin"()));

CREATE POLICY "external_reports_org_insert" ON "public"."external_performance_reports" FOR INSERT WITH CHECK (("organization_id" = "public"."current_organization_id"()));

CREATE POLICY "external_reports_org_select" ON "public"."external_performance_reports" FOR SELECT USING ((("organization_id" = "public"."current_organization_id"()) OR "public"."is_license_manager"() OR "public"."is_admin"()));

CREATE POLICY "external_reports_org_update" ON "public"."external_performance_reports" FOR UPDATE USING (((("organization_id" = "public"."current_organization_id"()) AND ("status" = 'pending'::"text")) OR "public"."is_license_manager"() OR "public"."is_admin"()));

CREATE POLICY "global_settings_delete_admin" ON "public"."global_settings" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "global_settings_insert_admin" ON "public"."global_settings" FOR INSERT WITH CHECK ("public"."is_admin"());

CREATE POLICY "global_settings_select_all" ON "public"."global_settings" FOR SELECT USING (true);

CREATE POLICY "global_settings_strict" ON "public"."global_settings" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "global_settings_update_admin" ON "public"."global_settings" FOR UPDATE USING ("public"."is_admin"());

CREATE POLICY "gm_availability_responses_delete_self_or_admin" ON "public"."gm_availability_responses" FOR DELETE USING (("public"."is_admin"() OR ("staff_id" IN ( SELECT "staff"."id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"())))));

CREATE POLICY "gm_availability_responses_insert_policy" ON "public"."gm_availability_responses" FOR INSERT WITH CHECK ((("organization_id" = "public"."current_organization_id"()) OR ("organization_id" IS NULL) OR ("public"."current_organization_id"() IS NULL) OR "public"."is_admin"() OR true));

CREATE POLICY "gm_availability_responses_insert_self_or_admin" ON "public"."gm_availability_responses" FOR INSERT WITH CHECK (("public"."is_admin"() OR ("staff_id" IN ( SELECT "staff"."id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"())))));

CREATE POLICY "gm_availability_responses_read_policy" ON "public"."gm_availability_responses" FOR SELECT USING ((("organization_id" = "public"."current_organization_id"()) OR ("organization_id" IS NULL) OR ("public"."current_organization_id"() IS NULL) OR "public"."is_admin"() OR ("staff_id" IN ( SELECT "staff"."id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"())))));

CREATE POLICY "gm_availability_responses_select_staff_or_admin" ON "public"."gm_availability_responses" FOR SELECT USING ("public"."is_staff_or_admin"());

CREATE POLICY "gm_availability_responses_strict" ON "public"."gm_availability_responses" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "gm_availability_responses_update_policy" ON "public"."gm_availability_responses" FOR UPDATE USING ((("staff_id" IN ( SELECT "staff"."id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"()))) OR "public"."is_admin"()));

CREATE POLICY "gm_availability_responses_update_self_or_admin" ON "public"."gm_availability_responses" FOR UPDATE USING (("public"."is_admin"() OR ("staff_id" IN ( SELECT "staff"."id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"())))));

CREATE POLICY "inventory_consistency_logs_admin_only" ON "public"."inventory_consistency_logs" USING ("public"."is_org_admin"());

CREATE POLICY "kit_transfer_completions_delete_policy" ON "public"."kit_transfer_completions" FOR DELETE USING (("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"()))));

CREATE POLICY "kit_transfer_completions_insert_policy" ON "public"."kit_transfer_completions" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"()))));

CREATE POLICY "kit_transfer_completions_select_policy" ON "public"."kit_transfer_completions" FOR SELECT USING (("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"()))));

CREATE POLICY "kit_transfer_completions_update_policy" ON "public"."kit_transfer_completions" FOR UPDATE USING (("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"())))) WITH CHECK (("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"()))));

CREATE POLICY "kit_transfer_events_delete_policy" ON "public"."kit_transfer_events" FOR DELETE USING (("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE (("staff"."user_id" = "auth"."uid"()) AND (('admin'::"text" = ANY ("staff"."role")) OR ('owner'::"text" = ANY ("staff"."role")))))));

CREATE POLICY "kit_transfer_events_insert_policy" ON "public"."kit_transfer_events" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"()))));

CREATE POLICY "kit_transfer_events_select_policy" ON "public"."kit_transfer_events" FOR SELECT USING (("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"()))));

CREATE POLICY "kit_transfer_events_update_policy" ON "public"."kit_transfer_events" FOR UPDATE USING (("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"()))));

CREATE POLICY "license_report_history_insert" ON "public"."license_report_history" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "users"."organization_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));

CREATE POLICY "license_report_history_select" ON "public"."license_report_history" FOR SELECT USING (("organization_id" IN ( SELECT "users"."organization_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));

CREATE POLICY "license_report_history_update" ON "public"."license_report_history" FOR UPDATE USING (("organization_id" IN ( SELECT "users"."organization_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));

CREATE POLICY "miscellaneous_transactions_delete_admin" ON "public"."miscellaneous_transactions" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "miscellaneous_transactions_insert_admin" ON "public"."miscellaneous_transactions" FOR INSERT WITH CHECK ("public"."is_admin"());

CREATE POLICY "miscellaneous_transactions_select_staff_or_admin" ON "public"."miscellaneous_transactions" FOR SELECT USING ("public"."is_staff_or_admin"());

CREATE POLICY "miscellaneous_transactions_strict" ON "public"."miscellaneous_transactions" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "miscellaneous_transactions_update_admin" ON "public"."miscellaneous_transactions" FOR UPDATE USING ("public"."is_admin"());

CREATE POLICY "notification_settings_delete_own_org" ON "public"."notification_settings" FOR DELETE USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "notification_settings_insert_own_org" ON "public"."notification_settings" FOR INSERT WITH CHECK (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "notification_settings_org_policy" ON "public"."notification_settings" USING ((("organization_id" = "public"."current_organization_id"()) OR ("organization_id" IS NULL) OR ("public"."current_organization_id"() IS NULL) OR "public"."is_admin"()));

CREATE POLICY "notification_settings_select_own_org" ON "public"."notification_settings" FOR SELECT USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "notification_settings_strict" ON "public"."notification_settings" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "notification_settings_update_own_org" ON "public"."notification_settings" FOR UPDATE USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "org_scenarios_delete" ON "public"."organization_scenarios" FOR DELETE USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_license_admin"()));

CREATE POLICY "org_scenarios_insert" ON "public"."organization_scenarios" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_license_admin"()));

CREATE POLICY "org_scenarios_select" ON "public"."organization_scenarios" FOR SELECT USING (true);

CREATE POLICY "org_scenarios_update" ON "public"."organization_scenarios" FOR UPDATE USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_license_admin"()));

CREATE POLICY "organization_invitations_delete_policy" ON "public"."organization_invitations" FOR DELETE USING (("organization_id" IN ( SELECT "s"."organization_id"
   FROM ("public"."staff" "s"
     JOIN "public"."users" "u" ON (("s"."user_id" = "u"."id")))
  WHERE (("s"."user_id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"public"."app_role")))));

CREATE POLICY "organization_invitations_insert_policy" ON "public"."organization_invitations" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "s"."organization_id"
   FROM ("public"."staff" "s"
     JOIN "public"."users" "u" ON (("s"."user_id" = "u"."id")))
  WHERE (("s"."user_id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"public"."app_role")))));

CREATE POLICY "organization_invitations_select_policy" ON "public"."organization_invitations" FOR SELECT USING ((("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"()))) OR ("auth"."uid"() IS NOT NULL)));

CREATE POLICY "organization_invitations_strict" ON "public"."organization_invitations" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "organization_invitations_update_policy" ON "public"."organization_invitations" FOR UPDATE USING ((("organization_id" IN ( SELECT "s"."organization_id"
   FROM ("public"."staff" "s"
     JOIN "public"."users" "u" ON (("s"."user_id" = "u"."id")))
  WHERE (("s"."user_id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"public"."app_role")))) OR ("email" = (( SELECT "users"."email"
   FROM "auth"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text")));

CREATE POLICY "organization_settings_delete_own_org" ON "public"."organization_settings" FOR DELETE USING (("public"."is_admin"() AND ("organization_id" = "public"."get_user_organization_id"())));

CREATE POLICY "organization_settings_insert" ON "public"."organization_settings" FOR INSERT WITH CHECK ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "organization_settings_insert_own_org" ON "public"."organization_settings" FOR INSERT WITH CHECK (("public"."is_admin"() AND ("organization_id" = "public"."get_user_organization_id"())));

CREATE POLICY "organization_settings_select" ON "public"."organization_settings" FOR SELECT USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "organization_settings_select_own_org" ON "public"."organization_settings" FOR SELECT USING (("public"."is_admin"() AND ("organization_id" = "public"."get_user_organization_id"())));

CREATE POLICY "organization_settings_update" ON "public"."organization_settings" FOR UPDATE USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "organization_settings_update_own_org" ON "public"."organization_settings" FOR UPDATE USING (("public"."is_admin"() AND ("organization_id" = "public"."get_user_organization_id"())));

CREATE POLICY "organizations_admin_policy" ON "public"."organizations" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"public"."app_role")))));

CREATE POLICY "organizations_public_read_active" ON "public"."organizations" FOR SELECT USING (("is_active" = true));

CREATE POLICY "organizations_select_policy" ON "public"."organizations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));

CREATE POLICY "performance_cancellation_logs_admin" ON "public"."performance_cancellation_logs" USING ("public"."is_org_admin"());

CREATE POLICY "performance_kits_delete_admin" ON "public"."performance_kits" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "performance_kits_insert_admin" ON "public"."performance_kits" FOR INSERT WITH CHECK ("public"."is_admin"());

CREATE POLICY "performance_kits_select_staff_or_admin" ON "public"."performance_kits" FOR SELECT USING ("public"."is_staff_or_admin"());

CREATE POLICY "performance_kits_strict" ON "public"."performance_kits" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "performance_kits_update_admin" ON "public"."performance_kits" FOR UPDATE USING ("public"."is_admin"());

CREATE POLICY "performance_schedule_settings_delete_admin" ON "public"."performance_schedule_settings" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "performance_schedule_settings_manage_own_org" ON "public"."performance_schedule_settings" USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "performance_schedule_settings_org_policy" ON "public"."performance_schedule_settings" USING ((("organization_id" = "public"."current_organization_id"()) OR ("organization_id" IS NULL) OR ("public"."current_organization_id"() IS NULL) OR "public"."is_admin"()));

CREATE POLICY "performance_schedule_settings_select_own_org" ON "public"."performance_schedule_settings" FOR SELECT USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "performance_schedule_settings_strict" ON "public"."performance_schedule_settings" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "performance_schedule_settings_update_admin" ON "public"."performance_schedule_settings" FOR UPDATE USING ("public"."is_admin"());

CREATE POLICY "pricing_settings_delete_own_org" ON "public"."pricing_settings" FOR DELETE USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "pricing_settings_insert_own_org" ON "public"."pricing_settings" FOR INSERT WITH CHECK (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "pricing_settings_org_policy" ON "public"."pricing_settings" USING ((("organization_id" = "public"."current_organization_id"()) OR ("organization_id" IS NULL) OR ("public"."current_organization_id"() IS NULL) OR "public"."is_admin"()));

CREATE POLICY "pricing_settings_select_own_org" ON "public"."pricing_settings" FOR SELECT USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "pricing_settings_strict" ON "public"."pricing_settings" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "pricing_settings_update_own_org" ON "public"."pricing_settings" FOR UPDATE USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL)))) WITH CHECK (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "private_booking_requests_delete" ON "public"."private_booking_requests" FOR DELETE USING (false);

CREATE POLICY "private_booking_requests_insert" ON "public"."private_booking_requests" FOR INSERT WITH CHECK (((("auth"."uid"() IS NOT NULL) AND ("customer_email" = "auth"."email"())) OR ("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "private_booking_requests_select" ON "public"."private_booking_requests" FOR SELECT USING ((("customer_email" = "auth"."email"()) OR ("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "private_booking_requests_update" ON "public"."private_booking_requests" FOR UPDATE USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"())) WITH CHECK ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "rate_limit_service_role" ON "public"."rate_limit_records" USING (("current_setting"('role'::"text", true) = 'service_role'::"text"));

CREATE POLICY "rate_limit_service_role_only" ON "public"."rate_limit_log" USING (("auth"."role"() = 'service_role'::"text"));

CREATE POLICY "reservation_settings_delete_admin" ON "public"."reservation_settings" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "reservation_settings_insert_admin" ON "public"."reservation_settings" FOR INSERT WITH CHECK ("public"."is_admin"());

CREATE POLICY "reservation_settings_org_policy" ON "public"."reservation_settings" USING ((("organization_id" = "public"."current_organization_id"()) OR ("organization_id" IS NULL) OR ("public"."current_organization_id"() IS NULL) OR "public"."is_admin"()));

CREATE POLICY "reservation_settings_select_admin" ON "public"."reservation_settings" FOR SELECT USING ("public"."is_admin"());

CREATE POLICY "reservation_settings_strict" ON "public"."reservation_settings" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "reservation_settings_update_admin" ON "public"."reservation_settings" FOR UPDATE USING ("public"."is_admin"());

CREATE POLICY "reservations_delete_admin" ON "public"."reservations" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "reservations_delete_unified" ON "public"."reservations" FOR DELETE USING (("public"."is_org_admin"() AND ("organization_id" = "public"."get_user_organization_id"())));

CREATE POLICY "reservations_history_select_staff_or_admin" ON "public"."reservations_history" FOR SELECT USING (("public"."is_org_admin"() OR (("public"."get_user_organization_id"() IS NOT NULL) AND ("organization_id" = "public"."get_user_organization_id"()))));

CREATE POLICY "reservations_insert_self_or_admin" ON "public"."reservations" FOR INSERT WITH CHECK (("public"."is_admin"() OR ("customer_id" IN ( SELECT "customers"."id"
   FROM "public"."customers"
  WHERE ("customers"."user_id" = "auth"."uid"()))) OR ("customer_id" IS NULL)));

CREATE POLICY "reservations_insert_unified" ON "public"."reservations" FOR INSERT WITH CHECK ((("customer_id" IN ( SELECT "customers"."id"
   FROM "public"."customers"
  WHERE ("customers"."user_id" = "auth"."uid"()))) OR ("public"."is_staff_or_admin"() AND ("organization_id" = "public"."get_user_organization_id"()))));

CREATE POLICY "reservations_select_self_or_admin" ON "public"."reservations" FOR SELECT USING (("public"."is_admin"() OR ("customer_id" IN ( SELECT "customers"."id"
   FROM "public"."customers"
  WHERE ("customers"."user_id" = "auth"."uid"())))));

CREATE POLICY "reservations_select_unified" ON "public"."reservations" FOR SELECT USING ((("customer_id" IN ( SELECT "customers"."id"
   FROM "public"."customers"
  WHERE ("customers"."user_id" = "auth"."uid"()))) OR (("auth"."uid"() IS NOT NULL) AND ("organization_id" = "public"."get_user_organization_id"()))));

CREATE POLICY "reservations_update_admin" ON "public"."reservations" FOR UPDATE USING ("public"."is_admin"());

CREATE POLICY "reservations_update_customer" ON "public"."reservations" FOR UPDATE USING (("customer_id" IN ( SELECT "customers"."id"
   FROM "public"."customers"
  WHERE ("customers"."user_id" = "auth"."uid"())))) WITH CHECK (("customer_id" IN ( SELECT "customers"."id"
   FROM "public"."customers"
  WHERE ("customers"."user_id" = "auth"."uid"()))));

CREATE POLICY "reservations_update_own_org" ON "public"."reservations" FOR UPDATE USING ((("organization_id" = "public"."get_user_organization_id"()) AND ("public"."is_org_admin"() OR "public"."is_admin"()))) WITH CHECK ((("organization_id" = "public"."get_user_organization_id"()) AND ("public"."is_org_admin"() OR "public"."is_admin"())));

CREATE POLICY "reservations_update_staff" ON "public"."reservations" FOR UPDATE USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"())) WITH CHECK ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "reservations_update_unified" ON "public"."reservations" FOR UPDATE USING ((("customer_id" IN ( SELECT "customers"."id"
   FROM "public"."customers"
  WHERE ("customers"."user_id" = "auth"."uid"()))) OR ("public"."is_staff_or_admin"() AND ("organization_id" = "public"."get_user_organization_id"()))));

CREATE POLICY "salary_settings_history_strict" ON "public"."salary_settings_history" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "sales_report_settings_delete_admin" ON "public"."sales_report_settings" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "sales_report_settings_manage_own_org" ON "public"."sales_report_settings" USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "sales_report_settings_org_policy" ON "public"."sales_report_settings" USING ((("organization_id" = "public"."current_organization_id"()) OR ("organization_id" IS NULL) OR ("public"."current_organization_id"() IS NULL) OR "public"."is_admin"()));

CREATE POLICY "sales_report_settings_select_own_org" ON "public"."sales_report_settings" FOR SELECT USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "sales_report_settings_strict" ON "public"."sales_report_settings" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "sales_report_settings_update_admin" ON "public"."sales_report_settings" FOR UPDATE USING ("public"."is_admin"());

CREATE POLICY "scenario_kit_locations_delete_policy" ON "public"."scenario_kit_locations" FOR DELETE USING (("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE (("staff"."user_id" = "auth"."uid"()) AND (('admin'::"text" = ANY ("staff"."role")) OR ('owner'::"text" = ANY ("staff"."role")))))));

CREATE POLICY "scenario_kit_locations_insert_policy" ON "public"."scenario_kit_locations" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE (("staff"."user_id" = "auth"."uid"()) AND (('admin'::"text" = ANY ("staff"."role")) OR ('owner'::"text" = ANY ("staff"."role")))))));

CREATE POLICY "scenario_kit_locations_select_policy" ON "public"."scenario_kit_locations" FOR SELECT USING (("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"()))));

CREATE POLICY "scenario_kit_locations_update_policy" ON "public"."scenario_kit_locations" FOR UPDATE USING (("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE (("staff"."user_id" = "auth"."uid"()) AND (('admin'::"text" = ANY ("staff"."role")) OR ('owner'::"text" = ANY ("staff"."role")))))));

CREATE POLICY "scenario_likes_delete" ON "public"."scenario_likes" FOR DELETE USING (("customer_id" IN ( SELECT "customers"."id"
   FROM "public"."customers"
  WHERE ("customers"."user_id" = "auth"."uid"()))));

CREATE POLICY "scenario_likes_insert" ON "public"."scenario_likes" FOR INSERT WITH CHECK ((("customer_id" IN ( SELECT "customers"."id"
   FROM "public"."customers"
  WHERE ("customers"."user_id" = "auth"."uid"()))) AND ("organization_id" IS NOT NULL)));

CREATE POLICY "scenario_likes_org_policy" ON "public"."scenario_likes" USING ((("organization_id" = "public"."current_organization_id"()) OR ("organization_id" IS NULL) OR ("public"."current_organization_id"() IS NULL) OR "public"."is_admin"()));

CREATE POLICY "scenario_likes_select" ON "public"."scenario_likes" FOR SELECT USING (true);

CREATE POLICY "scenario_likes_update" ON "public"."scenario_likes" FOR UPDATE USING (false);

CREATE POLICY "scenario_masters_delete" ON "public"."scenario_masters" FOR DELETE USING ("public"."is_license_admin"());

CREATE POLICY "scenario_masters_insert" ON "public"."scenario_masters" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND "public"."is_staff_or_admin"()));

CREATE POLICY "scenario_masters_select" ON "public"."scenario_masters" FOR SELECT USING ((("master_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])) OR ("submitted_by_organization_id" = "public"."get_user_organization_id"()) OR "public"."is_license_admin"()));

CREATE POLICY "scenario_masters_update" ON "public"."scenario_masters" FOR UPDATE USING ((("submitted_by_organization_id" = "public"."get_user_organization_id"()) OR "public"."is_license_admin"()));

CREATE POLICY "scenarios_delete_admin" ON "public"."scenarios" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "scenarios_insert_admin" ON "public"."scenarios" FOR INSERT WITH CHECK ("public"."is_admin"());

CREATE POLICY "scenarios_select_org_or_anon" ON "public"."scenarios" FOR SELECT USING ((("public"."get_user_organization_id"() IS NULL) OR ("organization_id" = "public"."get_user_organization_id"()) OR ("is_shared" = true)));

CREATE POLICY "scenarios_strict" ON "public"."scenarios" USING (
CASE
    WHEN ("public"."get_user_organization_id"() IS NOT NULL) THEN (("organization_id" = "public"."get_user_organization_id"()) OR ("is_shared" = true) OR "public"."is_org_admin"())
    ELSE ("status" = 'available'::"text")
END);

CREATE POLICY "scenarios_update_admin" ON "public"."scenarios" FOR UPDATE USING ("public"."is_admin"());

CREATE POLICY "schedule_event_history_insert_policy" ON "public"."schedule_event_history" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));

CREATE POLICY "schedule_event_history_select_policy" ON "public"."schedule_event_history" FOR SELECT USING (("organization_id" IN ( SELECT "staff"."organization_id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"()))));

CREATE POLICY "schedule_events_delete_staff_or_admin" ON "public"."schedule_events" FOR DELETE USING ("public"."is_staff_or_admin"());

CREATE POLICY "schedule_events_delete_unified" ON "public"."schedule_events" FOR DELETE USING (("public"."is_org_admin"() AND ("organization_id" = "public"."get_user_organization_id"())));

CREATE POLICY "schedule_events_insert_staff_or_admin" ON "public"."schedule_events" FOR INSERT WITH CHECK ("public"."is_staff_or_admin"());

CREATE POLICY "schedule_events_insert_unified" ON "public"."schedule_events" FOR INSERT WITH CHECK (("public"."is_staff_or_admin"() AND ("organization_id" = "public"."get_user_organization_id"())));

CREATE POLICY "schedule_events_select_unified" ON "public"."schedule_events" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) OR ("is_cancelled" = false)));

CREATE POLICY "schedule_events_update_own_org" ON "public"."schedule_events" FOR UPDATE USING ((("organization_id" = "public"."get_user_organization_id"()) AND ("public"."is_org_admin"() OR "public"."is_admin"()))) WITH CHECK ((("organization_id" = "public"."get_user_organization_id"()) AND ("public"."is_org_admin"() OR "public"."is_admin"())));

CREATE POLICY "schedule_events_update_staff_or_admin" ON "public"."schedule_events" FOR UPDATE USING ("public"."is_staff_or_admin"());

CREATE POLICY "schedule_events_update_unified" ON "public"."schedule_events" FOR UPDATE USING (("public"."is_staff_or_admin"() AND ("organization_id" = "public"."get_user_organization_id"())));

CREATE POLICY "shift_button_states_org_policy" ON "public"."shift_button_states" USING ((("organization_id" = "public"."current_organization_id"()) OR "public"."is_admin"()));

CREATE POLICY "shift_notifications_org_policy" ON "public"."shift_notifications" USING ((("organization_id" = "public"."current_organization_id"()) OR "public"."is_admin"()));

CREATE POLICY "shift_submissions_delete_self_or_admin" ON "public"."shift_submissions" FOR DELETE USING (("public"."is_admin"() OR ("staff_id" IN ( SELECT "staff"."id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"())))));

CREATE POLICY "shift_submissions_improved" ON "public"."shift_submissions" USING ((("staff_id" IN ( SELECT "staff"."id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"()))) OR ("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"())) WITH CHECK ((("staff_id" IN ( SELECT "staff"."id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"()))) OR ("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "shift_submissions_insert_self_or_admin" ON "public"."shift_submissions" FOR INSERT WITH CHECK (("public"."is_admin"() OR ("staff_id" IN ( SELECT "staff"."id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"())))));

CREATE POLICY "shift_submissions_select_self_or_admin" ON "public"."shift_submissions" FOR SELECT USING (("public"."is_admin"() OR ("staff_id" IN ( SELECT "staff"."id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"())))));

CREATE POLICY "shift_submissions_update_self_or_admin" ON "public"."shift_submissions" FOR UPDATE USING (("public"."is_admin"() OR ("staff_id" IN ( SELECT "staff"."id"
   FROM "public"."staff"
  WHERE ("staff"."user_id" = "auth"."uid"())))));

CREATE POLICY "staff_delete_admin" ON "public"."staff" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "staff_delete_unified" ON "public"."staff" FOR DELETE USING (("public"."is_org_admin"() AND ("organization_id" = "public"."get_user_organization_id"())));

CREATE POLICY "staff_insert_admin" ON "public"."staff" FOR INSERT WITH CHECK ("public"."is_admin"());

CREATE POLICY "staff_insert_unified" ON "public"."staff" FOR INSERT WITH CHECK (("public"."is_org_admin"() AND ("organization_id" = "public"."get_user_organization_id"())));

CREATE POLICY "staff_scenario_assignments_delete_admin" ON "public"."staff_scenario_assignments" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "staff_scenario_assignments_insert_admin" ON "public"."staff_scenario_assignments" FOR INSERT WITH CHECK ("public"."is_admin"());

CREATE POLICY "staff_scenario_assignments_org_policy" ON "public"."staff_scenario_assignments" USING ((("organization_id" = "public"."current_organization_id"()) OR ("organization_id" IS NULL) OR ("public"."current_organization_id"() IS NULL) OR "public"."is_admin"()));

CREATE POLICY "staff_scenario_assignments_select_all" ON "public"."staff_scenario_assignments" FOR SELECT USING (true);

CREATE POLICY "staff_scenario_assignments_strict" ON "public"."staff_scenario_assignments" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "staff_scenario_assignments_update_admin" ON "public"."staff_scenario_assignments" FOR UPDATE USING ("public"."is_admin"());

CREATE POLICY "staff_select_unified" ON "public"."staff" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) OR ("status" = 'active'::"text")));

CREATE POLICY "staff_settings_delete_admin" ON "public"."staff_settings" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "staff_settings_manage_own_org" ON "public"."staff_settings" USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "staff_settings_org_policy" ON "public"."staff_settings" USING ((("organization_id" = "public"."current_organization_id"()) OR ("organization_id" IS NULL) OR ("public"."current_organization_id"() IS NULL) OR "public"."is_admin"()));

CREATE POLICY "staff_settings_select_own_org" ON "public"."staff_settings" FOR SELECT USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "staff_settings_strict" ON "public"."staff_settings" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "staff_settings_update_admin" ON "public"."staff_settings" FOR UPDATE USING ("public"."is_admin"());

CREATE POLICY "staff_update_self_or_admin" ON "public"."staff" FOR UPDATE USING (("public"."is_admin"() OR ("user_id" = "auth"."uid"())));

CREATE POLICY "staff_update_unified" ON "public"."staff" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR ("public"."is_org_admin"() AND ("organization_id" = "public"."get_user_organization_id"()))));

CREATE POLICY "store_basic_settings_delete_admin" ON "public"."store_basic_settings" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "store_basic_settings_insert_admin" ON "public"."store_basic_settings" FOR INSERT WITH CHECK ("public"."is_admin"());

CREATE POLICY "store_basic_settings_org_policy" ON "public"."store_basic_settings" USING ((("organization_id" = "public"."current_organization_id"()) OR ("organization_id" IS NULL) OR ("public"."current_organization_id"() IS NULL) OR "public"."is_admin"()));

CREATE POLICY "store_basic_settings_select_admin" ON "public"."store_basic_settings" FOR SELECT USING ("public"."is_admin"());

CREATE POLICY "store_basic_settings_update_admin" ON "public"."store_basic_settings" FOR UPDATE USING ("public"."is_admin"());

CREATE POLICY "stores_delete_admin" ON "public"."stores" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "stores_insert_admin" ON "public"."stores" FOR INSERT WITH CHECK ("public"."is_admin"());

CREATE POLICY "stores_public_read" ON "public"."stores" FOR SELECT USING (true);

CREATE POLICY "stores_select_org_or_anon" ON "public"."stores" FOR SELECT USING ((("public"."get_user_organization_id"() IS NULL) OR ("organization_id" = "public"."get_user_organization_id"())));

CREATE POLICY "stores_strict" ON "public"."stores" USING (
CASE
    WHEN ("public"."get_user_organization_id"() IS NOT NULL) THEN (("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"())
    ELSE ("status" = 'active'::"text")
END);

CREATE POLICY "stores_update_admin" ON "public"."stores" FOR UPDATE USING ("public"."is_admin"());

CREATE POLICY "system_settings_delete_admin" ON "public"."system_settings" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "system_settings_manage_own_org" ON "public"."system_settings" USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "system_settings_org_policy" ON "public"."system_settings" USING ((("organization_id" = "public"."current_organization_id"()) OR ("organization_id" IS NULL) OR ("public"."current_organization_id"() IS NULL) OR "public"."is_admin"()));

CREATE POLICY "system_settings_select_own_org" ON "public"."system_settings" FOR SELECT USING (("public"."is_admin"() AND (("organization_id" = "public"."get_user_organization_id"()) OR ("organization_id" IS NULL))));

CREATE POLICY "system_settings_strict" ON "public"."system_settings" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

CREATE POLICY "system_settings_update_admin" ON "public"."system_settings" FOR UPDATE USING ("public"."is_admin"());

CREATE POLICY "users_all_policy" ON "public"."users" USING (("auth"."uid"() IS NOT NULL));

CREATE POLICY "users_delete_admin" ON "public"."users" FOR DELETE USING ("public"."is_admin"());

CREATE POLICY "users_delete_policy" ON "public"."users" FOR DELETE USING (("auth"."uid"() = "id"));

CREATE POLICY "users_insert_policy" ON "public"."users" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));

CREATE POLICY "users_insert_trigger" ON "public"."users" FOR INSERT WITH CHECK (true);

CREATE POLICY "users_select_policy" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));

CREATE POLICY "users_select_self" ON "public"."users" FOR SELECT USING (("id" = "auth"."uid"()));

CREATE POLICY "users_select_self_or_admin" ON "public"."users" FOR SELECT USING (("public"."is_admin"() OR ("id" = "auth"."uid"())));

CREATE POLICY "users_service_role_policy" ON "public"."users" USING (((("current_setting"('request.jwt.claims'::"text", true))::json ->> 'role'::"text") = 'service_role'::"text"));

CREATE POLICY "users_update_policy" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));

CREATE POLICY "users_update_self_or_admin" ON "public"."users" FOR UPDATE USING ((("id" = "auth"."uid"()) OR "public"."is_staff_or_admin"() OR ("auth"."role"() = 'service_role'::"text")));

CREATE POLICY "waitlist_notification_queue_org_policy" ON "public"."waitlist_notification_queue" USING ((("organization_id" = "public"."get_user_organization_id"()) OR "public"."is_org_admin"()));

COMMIT;