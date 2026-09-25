#!/usr/bin/env python3
"""Transaction-only staging checks. PGHOST/PGUSER/PGDATABASE/PGPASSWORD are supplied by the caller.
Examples: python3 scripts/test-settings-hierarchy-db.py survey judgment change
Every check ends with ROLLBACK; no customer notification endpoints are called.
"""
from pathlib import Path
import os, subprocess, re, argparse
ROOT=Path(__file__).resolve().parents[1]

def build_survey():
    from pathlib import Path
    import subprocess,os,re
    root=ROOT
    sql='BEGIN;\n'+(root/'supabase/migrations/20260925150000_operating_setting_overrides.sql').read_text()+'\n'+(root/'supabase/migrations/20260925156000_survey_setting_inheritance.sql').read_text()
    sql+='''
    CREATE TEMP TABLE gs_groups(id uuid,organization_id uuid,scenario_master_id uuid,reservation_id uuid);
    CREATE TEMP TABLE gs_scenarios(id uuid,organization_id uuid,scenario_master_id uuid,characters jsonb);
    CREATE TEMP TABLE gs_events(id uuid,organization_id uuid,date date,organization_scenario_id uuid,scenario_master_id uuid,scenario_id uuid,store_id uuid);
    CREATE TEMP TABLE gs_deadlines(group_id uuid PRIMARY KEY,organization_id uuid,deadline_at timestamptz);
    CREATE TEMP TABLE gs_messages(id uuid,group_id uuid,message text,created_at timestamptz);
    CREATE TEMP TABLE gs_reservations(id uuid,private_group_id uuid,organization_id uuid,status text,created_at timestamptz,store_id uuid,schedule_event_id uuid);
    CREATE FUNCTION pg_temp.gs_resolve(o uuid,k text,d jsonb,s uuid,c uuid,e uuid) RETURNS jsonb LANGUAGE sql AS $$
     SELECT jsonb_build_object('value',CASE WHEN k='survey_enabled' THEN to_jsonb(e IS NOT NULL) WHEN k='survey_deadline_days' THEN to_jsonb(CASE WHEN e IS NOT NULL THEN 0 ELSE 1 END) ELSE to_jsonb('https://example.com/survey'::text) END)
    $$;
    '''
    s=(root/'supabase/rpcs/get_private_group_survey_settings.sql').read_text().split('REVOKE ALL')[0].replace('public.get_private_group_survey_settings','pg_temp.gs_settings').replace('public.resolve_operating_setting','pg_temp.gs_resolve')
    for a,b in [('private_groups','gs_groups'),('organization_scenarios','gs_scenarios'),('reservations','gs_reservations'),('schedule_events','gs_events'),('private_group_survey_deadlines','gs_deadlines'),('private_group_messages','gs_messages')]:s=re.sub(r'\b'+a+r'\b','pg_temp.'+b,s)
    sql+=s+'\n'
    b=(root/'supabase/rpcs/get_private_group_survey_settings.sql').read_text().split('CREATE OR REPLACE FUNCTION public.get_private_groups_survey_settings')[1].split('REVOKE ALL')[0]
    b='CREATE OR REPLACE FUNCTION pg_temp.gs_batch'+b
    b=b.replace('public.get_private_group_survey_settings','pg_temp.gs_settings').replace('FROM private_groups','FROM pg_temp.gs_groups')
    sql+=b+'\n'

    f=(root/'supabase/rpcs/freeze_private_group_survey_deadline.sql').read_text().split('REVOKE ALL')[0].replace('public.freeze_private_group_survey_deadline','pg_temp.gs_freeze').replace('public.get_private_group_survey_settings','pg_temp.gs_settings')
    for a,b in [('private_groups','gs_groups'),('private_group_survey_deadlines','gs_deadlines')]: f=re.sub(r'\b'+a+r'\b','pg_temp.'+b,f)
    sql+=f+'\n'+(root/'supabase/tests/group_survey_settings.sql').read_text()+'\nROLLBACK;'
    return sql

def build_judgment():
    from pathlib import Path
    import subprocess,os,re
    root=ROOT
    tables=['schedule_events','performance_recruitment_policies','organization_recruitment_settings','performance_recruitment_deadlines','organization_scenarios','scenario_masters','scenarios','stores','performance_cancellation_logs','reservations','performance_recruitment_notices','customers']
    sql='BEGIN;\n'+''.join(f'CREATE TEMP TABLE j_{t} (LIKE public.{t} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);\n' for t in tables)
    sql+="CREATE TEMP TABLE judgment_values(event_id uuid,minutes integer); CREATE FUNCTION pg_temp.resolve_operating_setting(o uuid,k text,d jsonb,s uuid,c uuid,e uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('value',COALESCE((SELECT minutes FROM judgment_values WHERE event_id=e),240)) $$;\n"
    sql+='CREATE TEMP TABLE j_performance_judgment_deadlines(schedule_event_id uuid PRIMARY KEY,organization_id uuid,deadline_at timestamptz);\n'
    h=(root/'supabase/rpcs/get_performance_judgment_deadline.sql').read_text().split('REVOKE ALL')[0].replace('public.get_performance_judgment_deadline','pg_temp.get_performance_judgment_deadline').replace('public.resolve_operating_setting','pg_temp.resolve_operating_setting')
    for table in ['performance_judgment_deadlines','schedule_events']: h=re.sub(r'\b'+table+r'\b','pg_temp.j_'+table,h)
    sql+=h+'\n'
    for file in ['check_performances_with_recruitment_deadlines','check_performances_day_before']:
     s=(root/f'supabase/rpcs/{file}.sql').read_text()
     if file=='check_performances_with_recruitment_deadlines':s=s[:s.index('REVOKE ALL')]
     s=s.replace('public.check_performances','pg_temp.check_performances').replace('public.resolve_operating_setting','pg_temp.resolve_operating_setting').replace('public.get_performance_judgment_deadline','pg_temp.get_performance_judgment_deadline')
     s=re.sub(r'\bperformance_judgment_deadlines\b','pg_temp.j_performance_judgment_deadlines',s)
     for table in sorted(tables,key=len,reverse=True):s=re.sub(r'\b(?:public\.)?'+table+r'\b','pg_temp.j_'+table,s)
     sql+=s+'\n'
    sql+=(root/'supabase/tests/judgment_inheritance.sql').read_text()+'\nROLLBACK;'
    return sql

def build_change():
    from pathlib import Path
    import re,subprocess,os
    root=ROOT
    sql='BEGIN;\n'
    for name in ['20260925150000_operating_setting_overrides.sql','20260925160000_reservation_change_policy_snapshot.sql']:
     sql+=(root/'supabase/migrations'/name).read_text()+'\n'
    sql+='''CREATE TEMP TABLE change_reservations(id uuid,organization_id uuid,store_id uuid,scenario_master_id uuid,schedule_event_id uuid,private_group_id uuid,reservation_source text,reservation_type text,requested_datetime timestamptz,participant_count integer,reservation_change_deadline_hours_snapshot integer);
    CREATE TEMP TABLE change_events(id uuid,organization_id uuid,category text,is_private_booking boolean,date date,start_time time);
    CREATE TEMP TABLE change_users(id uuid,organization_id uuid,role text);
    CREATE TEMP TABLE change_staff(user_id uuid,organization_id uuid,status text);
    CREATE TEMP TABLE change_scenarios(id uuid,organization_id uuid,scenario_master_id uuid);
    CREATE FUNCTION pg_temp.change_resolve(o uuid,k text,d jsonb,s uuid,c uuid,e uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('value',CASE WHEN k LIKE 'private_%' THEN 168 ELSE 24 END) $$;
    '''
    s=(root/'supabase/rpcs/set_reservation_change_policy_snapshot.sql').read_text().split('REVOKE ALL')[0].replace('public.set_reservation_change_policy_snapshot','pg_temp.change_snapshot').replace('public.resolve_operating_setting','pg_temp.change_resolve').replace('public.users','pg_temp.change_users')
    for a,b in [('schedule_events','change_events'),('staff','change_staff'),('organization_scenarios','change_scenarios')]:s=re.sub(r'\b'+a+r'\b','pg_temp.'+b,s)
    sql+=s+(root/'supabase/tests/reservation_change_snapshot.sql').read_text()+'\nROLLBACK;'
    return sql

def build_email_parity():
    from pathlib import Path
    import re,subprocess,os
    root=ROOT
    m=(root/'supabase/migrations/20260925152000_preserve_effective_email_settings.sql').read_text()
    keys=re.search(r'legacy_keys constant text\[\] := (ARRAY\[.*?\]);',m,re.S).group(1)
    sql='BEGIN;\n'+(root/'supabase/migrations/20260925150000_operating_setting_overrides.sql').read_text()
    sql+=f'''\nCREATE TEMP TABLE email_before AS
    SELECT o.id organization_id,s.id store_id,k.key,
     COALESCE(NULLIF(btrim(own.row_data->>k.key),''),fallback.value) expected
    FROM organizations o
    LEFT JOIN stores s ON s.organization_id=o.id
    CROSS JOIN unnest({keys}) AS k(key)
    LEFT JOIN LATERAL (SELECT to_jsonb(e) row_data FROM email_settings e WHERE e.store_id=s.id AND e.organization_id=o.id LIMIT 1) own ON true
    LEFT JOIN LATERAL (SELECT NULLIF(btrim(rows.row_data->>k.key),'') value FROM
     (SELECT to_jsonb(e) row_data FROM email_settings e WHERE e.organization_id=o.id LIMIT 20) rows
     WHERE (rows.row_data->>'store_id' IS DISTINCT FROM s.id::text) AND NULLIF(btrim(rows.row_data->>k.key),'') IS NOT NULL LIMIT 1) fallback ON true;
    '''
    sql+=m
    sql+='''\nCREATE TEMP TABLE email_parity AS SELECT b.*,NULLIF(btrim(public.resolve_operating_setting(organization_id,key,'null'::jsonb,store_id,NULL,NULL)->>'value'),'') actual FROM email_before b;
    SELECT count(*) checked_values, count(*) FILTER(WHERE expected IS DISTINCT FROM actual) differences FROM email_parity;
    DO $$ BEGIN IF EXISTS(SELECT 1 FROM email_parity WHERE expected IS DISTINCT FROM actual) THEN RAISE EXCEPTION 'EMAIL_PARITY_MISMATCH'; END IF; END $$;
    ROLLBACK;'''
    return sql

def build_rollback():
    from pathlib import Path
    import subprocess,os,re
    r=ROOT;m=list(sorted((r/'supabase/migrations').glob('202609251[56]*00_*.sql')))
    sql='BEGIN;\n'+''.join(p.read_text()+'\n' for p in m)
    rollback=(r/'docs/rollback/qw-20260924-004-settings-hierarchy.sql').read_text();rollback=re.sub(r'^BEGIN;\s*$','',rollback,flags=re.M);rollback=re.sub(r'^COMMIT;\s*$','',rollback,flags=re.M)
    sql+=rollback+'\nROLLBACK;'
    return sql

def build_preparation():
    migrations=['20260925150000_operating_setting_overrides.sql','20260925151000_cancellation_setting_inheritance.sql','20260925157000_preparation_setting_inheritance.sql','20260925158000_public_preparation_context.sql','20260925159000_preparation_cross_day.sql','20260925165000_public_preparation_visibility.sql']
    tests=['operating_setting_overrides.sql','preparation_setting_inheritance.sql','public_preparation_context.sql']
    return 'BEGIN;\n'+''.join((ROOT/'supabase/migrations'/p).read_text()+'\n' for p in migrations)+''.join(re.sub(r'^(BEGIN|ROLLBACK);\s*$', '', (ROOT/'supabase/tests'/p).read_text(), flags=re.M)+'\n' for p in tests)+'ROLLBACK;'

def build_reminders():
    sql='BEGIN;\n'+(ROOT/'supabase/migrations/20260925153000_scheduled_reminder_deliveries.sql').read_text()
    fixture=(ROOT/'supabase/tests/scheduled_reminder_claim.sql').read_text()
    function=(ROOT/'supabase/rpcs/claim_scheduled_reminder.sql').read_text().split('REVOKE ALL')[0].replace('public.claim_scheduled_reminder','pg_temp.claim_reminder_fixture')
    for source,target in [('reservations','reminder_reservation_fixture'),('schedule_events','reminder_event_fixture'),('scheduled_reminder_deliveries','reminder_delivery_fixture')]:
        function=function.replace('public.'+source,'pg_temp.'+target)
    return sql+fixture.replace('-- CLAIM_FUNCTION',function)+'\nROLLBACK;'

if __name__=='__main__':
    checks={'preparation':build_preparation,'reminders':build_reminders,'survey':build_survey,'judgment':build_judgment,'change':build_change,'email-parity':build_email_parity,'rollback':build_rollback}
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('checks',nargs='+',choices=list(checks))
    args=parser.parse_args()
    if not os.environ.get('PGHOST') or not os.environ.get('PGPASSWORD'):
        parser.error('PGHOST and PGPASSWORD are required; use the staging database')
    psql=os.environ.get('PSQL','psql')
    for name in args.checks:
        sql=checks[name]()
        result=subprocess.run([psql,'-v','ON_ERROR_STOP=1'],input=sql,env={**os.environ,'PGSSLMODE':os.environ.get('PGSSLMODE','require'),'PGCONNECT_TIMEOUT':'10'},capture_output=True,text=True)
        if result.returncode:
            print(name, 'FAILED',result.stderr[-2000:])
            raise SystemExit(result.returncode)
        print(name,'PASS (rolled back)')
