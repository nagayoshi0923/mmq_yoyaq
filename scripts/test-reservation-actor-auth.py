#!/usr/bin/env python3
"""専用・外部ネットワークなしのPostgreSQLコンテナだけで認可契約を検証する。"""
import os, json, subprocess, time, concurrent.futures, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
FIXTURE=ROOT/'supabase/tests/fixtures/reservation_actor_auth'
DOCKER=os.environ.get('MMQ_TEST_DOCKER','docker')
CONTAINER=os.environ.get('MMQ_RPC_TEST_CONTAINER','mmq-reservation-auth-20261001')
UP=(ROOT/'supabase/migrations/20261001090000_reservation_actor_auth.sql').read_text()
DOWN=(ROOT/'supabase/rollbacks/20261001090000_reservation_actor_auth.sql').read_text()
assert CONTAINER.startswith('mmq-reservation-auth-'), '専用コンテナ以外は使用しない'
network=subprocess.check_output([DOCKER,'inspect','--format','{{.HostConfig.NetworkMode}}',CONTAINER],text=True).strip()
assert network=='none', '外部ネットワークは遮断必須'
RESULTS=[]
def psql(sql, database='postgres', check=True):
 p=subprocess.run([DOCKER,'exec','-i',CONTAINER,'psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],input=sql,text=True,capture_output=True,timeout=25)
 if check and p.returncode:raise AssertionError(p.stderr)
 return p
def uid(n):return f'00000000-0000-4000-8000-{n:012d}'
def lit(n):return "'"+uid(n)+"'"
def actor(n,sql,role='authenticated'):
 return f"BEGIN; SET LOCAL ROLE {role}; SELECT set_config('request.jwt.claim.sub','{uid(n) if n else ''}',true); {sql}; COMMIT;"
def create(customer=5,count=1,key='fixture',event=7,legacy=False):
 name='create_reservation_with_lock' if legacy else 'create_reservation_with_lock_v2'
 args=f"{lit(event)},{count},{'NULL' if customer is None else lit(customer)},'fixture',NULL,NULL,NULL,NULL,'{key}'"
 return f'SELECT public.{name}({args})'
def update(customer=5,count=1,reservation=50):
 return f"SELECT public.update_reservation_participants({lit(reservation)},{count},{'NULL' if customer is None else lit(customer)})"
def run_case(name,fn):
 fn();RESULTS.append({'case':name,'status':'成功'});print('成功:',name,flush=True)
roles=' '.join(f"DO $$BEGIN CREATE ROLE {r};EXCEPTION WHEN duplicate_object THEN NULL;END$$;" for r in ['anon','authenticated','service_role'])
def server_ready():
 # 公式イメージは初期化中に一時サーバーを起動し、初期化後に一度止めて本サーバーを起動する。
 # 一時サーバーにも pg_isready は応答するため、初期化完了（または初期化スキップ）のログを併せて待つ。
 if subprocess.run([DOCKER,'exec',CONTAINER,'pg_isready','-U','postgres'],capture_output=True).returncode:return False
 logs=subprocess.run([DOCKER,'logs',CONTAINER],capture_output=True,text=True)
 out=logs.stdout+logs.stderr
 return 'PostgreSQL init process complete' in out or 'Skipping initialization' in out
for attempt in range(600):
 if server_ready():break
 time.sleep(.1)
else:raise AssertionError('隔離PostgreSQLが起動しませんでした')
psql(roles)
for environment in ['prod','staging']:
 database=f'mmq_rpc_auth_{os.getpid()}_{environment}'
 psql(f'CREATE DATABASE {database};')
 def sql(s,check=True):return psql(s,database,check)
 def scalar(s):return sql(s).stdout.strip().splitlines()[-1]
 def snapshot():return scalar("SELECT json_build_object('reservations',(SELECT coalesce(json_agg(t ORDER BY id),'[]') FROM reservations t),'events',(SELECT coalesce(json_agg(t ORDER BY id),'[]') FROM schedule_events t),'history',(SELECT coalesce(json_agg(t),'[]') FROM test_history t),'coupon',(SELECT coalesce(json_agg(t),'[]') FROM coupon_usages t));")
 def expect_error(s,code):
  before=snapshot();p=sql(s,False)
  assert p.returncode and re.search(r'ERROR:\s+'+re.escape(code)+':',p.stderr),(code,p.stdout,p.stderr)
  assert snapshot()==before,'拒否した操作で予約・金額・cache・履歴が変わった'
 def fixture(cap=8,guest=False):
  sql(f"""TRUNCATE reservations,schedule_events,coupon_usages,test_history;
  UPDATE customers SET user_id={lit(6)},organization_id=NULL WHERE id={lit(5)};
  INSERT INTO schedule_events(id,organization_id,scenario_master_id,organization_scenario_id,date,start_time,end_time,max_participants,capacity) VALUES({lit(7)},{lit(1)},{lit(2)},{lit(4)},'2099-10-15','14:00','16:00',{cap},{cap});
  INSERT INTO reservations(id,schedule_event_id,customer_id,participant_count,unit_price,base_price,total_price,discount_amount,final_price,status,organization_id,reservation_number) VALUES({lit(50)},{lit(7)},{'NULL' if guest else lit(5)},2,1000,2000,2000,0,2000,'confirmed',{lit(1)},'existing');
  TRUNCATE test_history;""")
 def empty(cap=8):
  fixture(cap=max(cap,2));sql(f'TRUNCATE reservations,test_history; UPDATE schedule_events SET current_participants=0,max_participants={cap},capacity={cap};')
 def expect_update(actor_id,customer=5,role='authenticated'):
  fixture();sql(actor(actor_id,update(customer),role));assert scalar('SELECT participant_count FROM reservations')=='1'
 def expect_create(actor_id,customer=5,role='authenticated',legacy=False):
  empty();sql(actor(actor_id,create(customer,legacy=legacy),role));assert scalar('SELECT count(*) FROM reservations')=='1'
 try:
  sql((FIXTURE/'schema.sql').read_text())
  for name in ['get_user_organization_id','is_org_admin','is_admin','create_reservation_with_lock_v2','create_reservation_with_lock','update_reservation_participants','cancel_reservation_with_lock']:
   for file in (list(FIXTURE.glob(environment+'__'+name+'-*.sql')) or list(FIXTURE.glob('prod__'+name+'-*.sql'))):sql(file.read_text()+';')
  sql((FIXTURE/'prod__change_reservation_schedule.sql').read_text()+';')
  for file in FIXTURE.glob('*.sql'):
   if '__' not in file.name and file.name not in ['schema.sql','triggers.sql']:sql(file.read_text()+';')
  sql((FIXTURE/'triggers.sql').read_text())
  sql('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC,anon,authenticated,service_role;')
  sql(f"INSERT INTO scenario_masters VALUES({lit(2)},'fixture',120); INSERT INTO organization_scenarios(id,organization_id,scenario_master_id,participation_fee,participation_costs) VALUES({lit(4)},{lit(1)},{lit(2)},1000,'[]'); INSERT INTO customers VALUES({lit(5)},{lit(6)},NULL),({lit(15)},NULL,{lit(1)}),({lit(16)},NULL,{lit(9)}),({lit(17)},{lit(18)},{lit(9)});")
  profiles=[(6,'customer',None,None),(18,'customer',9,None),(20,'staff',1,'active'),(21,'staff',9,'active'),(22,'admin',1,'active'),(23,'admin',9,'active'),(24,'staff',1,'resigned'),(25,'admin',1,'resigned'),(26,'staff',1,'on-leave'),(27,'admin',1,'on-leave'),(28,'admin',1,None),(29,'license_admin',1,None),(30,'license_admin',1,'active'),(31,'admin',1,None),(32,'staff',1,'inactive')]
  for ident,role,org,status in profiles:
   sql(f"INSERT INTO users VALUES({lit(ident)},'{role}',{'NULL' if org is None else lit(org)});")
   if status:sql(f"INSERT INTO staff(user_id,organization_id,status) VALUES({lit(ident)},{lit(org)},'{status}');")
  sql(f'INSERT INTO staff_account_access VALUES({lit(31)});')
  def move_fixture(guest=False):
   fixture(guest=guest)
   sql(f"INSERT INTO schedule_events(id,organization_id,date,start_time,end_time,max_participants,capacity) VALUES({lit(8)},{lit(1)},'2099-10-16','14:00','16:00',8,8);")
  def move(customer=5):return f"SELECT change_reservation_schedule({lit(50)},{lit(8)},{'NULL' if customer is None else lit(customer)})"
  move_fixture(True);sql(actor(None,move(None),'anon'));assert scalar('SELECT schedule_event_id FROM reservations')==uid(8)
  move_fixture();sql(actor(23,move()));assert scalar('SELECT schedule_event_id FROM reservations')==uid(8)
  run_case(environment+' / 旧日程RPCの匿名NULL・別組織管理者の欠陥を再現',lambda:None)
  # 修正前に確認済みの3認可欠陥を同じ人工データで再現。
  fixture();sql(actor(None,update(),role='anon'));assert scalar('SELECT participant_count FROM reservations')=='1'
  fixture();sql(actor(18,update()));assert scalar('SELECT participant_count FROM reservations')=='1'
  empty();sql(actor(None,create(15),role='anon'));assert scalar('SELECT count(*) FROM reservations')=='1'
  run_case(environment+' / 修正前の3認可欠陥を再現',lambda:None)
  sql("CREATE VIEW test_public_schedule AS SELECT id,date,start_time,current_participants FROM schedule_events WHERE published=true;GRANT SELECT ON test_public_schedule TO anon;CREATE FUNCTION test_public_schedule_count() RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$SELECT count(*) FROM test_public_schedule$$;GRANT EXECUTE ON FUNCTION test_public_schedule_count() TO anon;")
  public_metadata="SELECT json_build_object('table_acl',(SELECT json_agg(json_build_array(oid,relacl::text,relrowsecurity) ORDER BY oid) FROM pg_class WHERE relnamespace='public'::regnamespace),'policies',(SELECT json_agg(json_build_array(oid,polqual::text,polwithcheck::text) ORDER BY oid) FROM pg_policy),'read_acl',(SELECT proacl::text FROM pg_proc WHERE oid='test_public_schedule_count()'::regprocedure))"
  public_before=scalar(public_metadata)
  before=snapshot();sql(UP);sql(UP);assert snapshot()==before
  assert scalar(public_metadata)==public_before
  run_case(environment+' / 既存表ACL・RLS・公開read RPCの実行権限は全て不変',lambda:None)
  sql(actor(None,'SELECT * FROM test_public_schedule; SELECT test_public_schedule_count()',role='anon'))
  run_case(environment+' / 匿名の公開日程・残席SELECTと公開RPCが適用後も成功',lambda:None)

  run_case(environment+' / upと再適用',lambda:None)
  for role in ['anon','authenticated','service_role']:
   targets="'create_reservation_with_lock','create_reservation_with_lock_v2','update_reservation_participants','change_reservation_schedule'"
   assert scalar(f"SELECT bool_and(has_function_privilege('{role}',p.oid,'EXECUTE')={'false' if role=='anon' else 'true'}) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname IN ({targets});")=='t'
  run_case(environment+' / 実効ACLと非公開ヘルパー',lambda:expect_error(actor(6,f'SELECT reservation_actor_is_org_operator({lit(1)})'),'42501'))
  for role,ident,code in [('anon',None,'42501'),('authenticated',None,'P0011'),('service_role',None,'P0011'),('authenticated',18,'P0011'),('authenticated',21,'P0011'),('authenticated',23,'P0011'),('authenticated',24,'P0011'),('authenticated',25,'P0011'),('authenticated',26,'P0011'),('authenticated',29,'P0011'),('authenticated',31,'P0011'),('authenticated',32,'P0011')]:
   def reject(role=role,ident=ident,code=code):fixture();expect_error(actor(ident,update(),role),code)
   run_case(f'{environment} / 人数変更拒否 role={role} actor={ident}',reject)
  for ident in [6,20,22,27,28,30]:run_case(f'{environment} / 正規人数変更 actor={ident}',lambda ident=ident:expect_update(ident))
  run_case(environment+' / 本人の旧省略引数',lambda:expect_update(6,None))
  run_case(environment+' / サービス権限でも本人文脈で成功',lambda:expect_update(6,role='service_role'))
  run_case(environment+' / サービス権限の同組織管理者も成功',lambda:expect_update(22,role='service_role'))
  fixture();expect_error(actor(6,update(15)),'P0010');run_case(environment+' / 誤った旧customer引数は拒否',lambda:None)
  fixture(guest=True);expect_error(actor(6,update()),'P0010');expect_error(actor(6,update(None)),'P0011');sql(actor(20,update(None)));run_case(environment+' / 顧客未紐付け予約は組織業務のみ',lambda:None)
  for role,ident,customer,code in [('anon',None,15,'42501'),('authenticated',None,15,'P0011'),('authenticated',18,5,'P0011'),('authenticated',6,15,'P0011'),('authenticated',21,15,'P0011'),('authenticated',23,15,'P0011'),('authenticated',25,None,'P0013'),('service_role',None,None,'P0011'),('authenticated',20,16,'P0012')]:
   def reject(role=role,ident=ident,customer=customer,code=code):empty();expect_error(actor(ident,create(customer),role),code)
   run_case(f'{environment} / 作成拒否 role={role} actor={ident} customer={customer}',reject)
  for ident,customer in [(6,5),(18,17),(20,15),(22,15),(28,None),(20,None),(30,15)]:run_case(f'{environment} / 正規作成 actor={ident} customer={customer}',lambda ident=ident,customer=customer:expect_create(ident,customer))
  run_case(environment+' / 旧作成wrapperは本人成功',lambda:expect_create(6,legacy=True))
  empty();expect_error(actor(None,create(15,legacy=True),'anon'),'42501');run_case(environment+' / 旧作成wrapperも匿名拒否',lambda:None)
  # ACLを誤って緩めても本文が拒否する。GRANTは局所transaction内だけ。
  for name,args in [('update_reservation_participants','uuid,integer,uuid'),('create_reservation_with_lock_v2','uuid,integer,uuid,text,text,text,text,text,text,uuid')]:
   fixture();call=update() if name.startswith('update') else create(15)
   expect_error(f"BEGIN;GRANT EXECUTE ON FUNCTION public.{name}({args}) TO anon;SET LOCAL ROLE anon;SELECT set_config('request.jwt.claim.sub','',true);{call};COMMIT;",'P0011')
  run_case(environment+' / ACL以外にも匿名拒否がある',lambda:None)
  # 本人顧客の旧orgが異なっても、本人としては利用を保つ。
  fixture();sql(f'UPDATE customers SET organization_id={lit(9)} WHERE id={lit(5)};');sql(actor(6,update()));run_case(environment+' / 旧org付き本人の人数変更',lambda:None)
  for ident,role,guest,code in [(None,'anon',True,'42501'),(None,'authenticated',True,'P0011'),(23,'authenticated',False,'P0010'),(25,'authenticated',False,'P0010'),(18,'authenticated',False,'P0010')]:
   move_fixture(guest);expect_error(actor(ident,move(None if guest else 5),role),code)
  run_case(environment+' / 旧日程RPCの認可拒否',lambda:None)
  for ident,guest in [(6,False),(22,False),(28,True)]:
   move_fixture(guest);sql(actor(ident,move(None if guest else 5)));assert scalar('SELECT schedule_event_id FROM reservations')==uid(8)
  run_case(environment+' / 旧日程RPCの本人・組織管理者成功',lambda:None)
  fixture();sql(f'UPDATE customers SET user_id={lit(24)} WHERE id={lit(5)};');sql(actor(24,update()));run_case(environment+' / 退職者も自分の顧客予約は変更できる',lambda:None)
  fixture();sql(f'UPDATE customers SET user_id={lit(21)} WHERE id={lit(5)};');sql(actor(21,update()));run_case(environment+' / 他組織staffも自分の顧客予約は変更できる',lambda:None)
  # 実際の期限triggerを載せ、正常な本人操作でも業務期限は維持する。
  fixture();sql("SET test.change_deadline='48';"+f"UPDATE schedule_events SET date=current_date,start_time='00:00'; ALTER TABLE reservations DISABLE TRIGGER reservation_change_policy_snapshot; UPDATE reservations SET reservation_change_deadline_hours_snapshot=48; ALTER TABLE reservations ENABLE TRIGGER reservation_change_policy_snapshot;")
  expect_error(actor(6,update()),'P0050');sql(actor(20,update()));run_case(environment+' / 顧客期限と店舗の既存例外を保持',lambda:None)
  # 後段の履歴失敗でも予約・cacheを部分保存しない。
  fixture();sql("CREATE OR REPLACE FUNCTION test_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture_history_failure' USING ERRCODE='XX999';END$$;")
  expect_error(actor(6,update()),'XX999')
  sql("CREATE OR REPLACE FUNCTION test_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN INSERT INTO test_history VALUES(NEW.id,TG_OP,NEW.participant_count); RETURN NEW; END$$;")
  run_case(environment+' / 後段履歴失敗で予約・cache全体をrollback',lambda:None)
  # 募集停止の環境固有差分は保持。
  empty();paused="SELECT set_config('test.recruitment_paused','true',true);"+create()
  if environment=='staging':expect_error(actor(6,paused),'P0046')
  else:sql(actor(6,paused))
  run_case(environment+' / 既存募集停止判定を保持',lambda:None)
  # 実際にロック待ちを確認してから2接続の結果を回収する。
  def race(command_a,command_b,code_b=None):
   def session(label,ident,command,hold=False):
    return sql(actor(ident,f"SET LOCAL application_name='{label}';{command}"+(';SELECT pg_sleep(0.7)' if hold else '')),False)
   with concurrent.futures.ThreadPoolExecutor(2) as pool:
    a=pool.submit(session,'auth_race_a',6,command_a,True)
    deadline=time.monotonic()+8
    while scalar("SELECT count(*) FROM pg_stat_activity WHERE application_name='auth_race_a' AND wait_event='PgSleep';")!='1':
     assert time.monotonic()<deadline,'先行接続のロック保持待ち失敗';time.sleep(.02)
    b=pool.submit(session,'auth_race_b',18,command_b)
    waited=False
    while not a.done():
     if scalar("SELECT count(*) FROM pg_stat_activity WHERE application_name='auth_race_b' AND wait_event_type='Lock';")=='1':waited=True;break
    ra,rb=a.result(),b.result();assert waited,'後続接続がDBロックで待たなかった';assert ra.returncode==0,ra.stderr
    if code_b:assert rb.returncode and re.search(r'ERROR:\s+'+code_b+':',rb.stderr),rb.stderr
    else:assert rb.returncode==0,rb.stderr
  empty(1);race(create(key='race-a'),create(17,key='race-b'),'P0003');assert scalar('SELECT count(*) FROM reservations')=='1';assert scalar('SELECT current_participants FROM schedule_events')=='1';run_case(environment+' / 2接続の最後の1席は1件だけ保存',lambda:None)
  fixture(4);sql(f'UPDATE customers SET user_id={lit(6)} WHERE id={lit(17)};')
  # 同じ本人の二重実行。第二接続は専用ラッパー内で同じ認証UIDへ設定。
  race(update(count=3),f"SELECT set_config('request.jwt.claim.sub','{uid(6)}',true);"+update(count=3));assert scalar('SELECT participant_count FROM reservations')=='3';assert scalar('SELECT current_participants FROM schedule_events')=='3';run_case(environment+' / 2接続の人数変更二重実行は加算されない',lambda:None)
  sql(f'UPDATE customers SET user_id={lit(18)} WHERE id={lit(17)};')
  fixture();sql(f'UPDATE reservations SET discount_amount=500,final_price=1500 WHERE id={lit(50)};');sql(actor(6,update(count=3)));assert scalar('SELECT final_price=total_price AND discount_amount=500 FROM reservations')=='t';run_case(environment+' / 残件3：割引保持は未修正と確認',lambda:None)
  empty();sql(actor(6,create(key='one')));sql(actor(6,create(key='two')));sql('UPDATE schedule_events SET current_participants=1;');assert scalar('SELECT current_participants FROM schedule_events')=='1';run_case(environment+' / 残件4：古いcache手動上書きは未修正と確認',lambda:None)
  empty(1);sql(actor(6,create(key='same')));expect_error(actor(6,create(key='same')),'P0003');run_case(environment+' / 残件5：満席後の同番号再試行は未修正と確認',lambda:None)
  empty();sql('UPDATE schedule_events SET published=false,is_reservation_enabled=false;');sql(actor(6,create()));run_case(environment+' / 残件6：公開受付条件は未修正と確認',lambda:None)
  empty();sql(f"INSERT INTO scenario_masters VALUES({lit(3)},'other-fixture',120) ON CONFLICT DO NOTHING; INSERT INTO schedule_events(id,organization_id,scenario_id,scenario_master_id,date,start_time) VALUES({lit(8)},{lit(1)},{lit(2)},{lit(3)},'2099-10-16','14:00');");assert scalar(f'SELECT scenario_id<>scenario_master_id FROM schedule_events WHERE id={lit(8)}')=='t';run_case(environment+' / 残件7：作品互換列の不一致は未修正と確認',lambda:None)
  empty();sql(actor(6,"SET LOCAL TIME ZONE 'UTC';"+create()));assert scalar("SELECT (extract(epoch FROM(r.requested_datetime-((e.date+e.start_time) AT TIME ZONE 'Asia/Tokyo')))/3600)::int FROM reservations r JOIN schedule_events e ON e.id=r.schedule_event_id")=='9';run_case(environment+' / 残件8：接続TZ依存は未修正と確認',lambda:None)
  fixture(3);sql(f"UPDATE reservations SET participant_count=1 WHERE id={lit(50)}; INSERT INTO reservations(id,schedule_event_id,customer_id,participant_count,unit_price,status,organization_id) VALUES({lit(51)},{lit(7)},{lit(17)},1,1000,'confirmed',{lit(1)});")
  race(update(count=2),update(customer=17,count=2,reservation=51),'P0008');assert scalar('SELECT sum(participant_count) FROM reservations')=='3';assert scalar('SELECT current_participants FROM schedule_events')=='3';run_case(environment+' / 2接続の増員競合も定員を超えない',lambda:None)
  # 安全互換downは認可境界を維持し、旧org制約だけ戻す。
  sql(DOWN);fixture();expect_error(actor(18,update()),'P0011');expect_error(actor(None,update(),'anon'),'42501');sql(actor(6,update()))
  empty();expect_error(actor(18,create(17)),'P0012');sql(UP);sql(actor(18,create(17)));run_case(environment+' / 安全downとupで拒否・本人成功を保持',lambda:None)
  # 未取得変更の混入はmigration全体をrollbackする。
  definition=scalar("SELECT replace(pg_get_functiondef('public.update_reservation_participants(uuid,integer,uuid)'::regprocedure),E'\\n','<LF>');").replace('<LF>','\n')
  sql(definition.replace('  v_event_id UUID;','  v_event_id UUID; -- unknown change')+';')
  before=scalar("SELECT md5(pg_get_functiondef('public.update_reservation_participants(uuid,integer,uuid)'::regprocedure));")
  p=sql(UP,False);assert p.returncode and '55000' in p.stderr
  assert scalar("SELECT md5(pg_get_functiondef('public.update_reservation_participants(uuid,integer,uuid)'::regprocedure));")==before
  run_case(environment+' / 未取得の本文変更は上書きせず全体停止',lambda:None)
 finally:psql(f'DROP DATABASE {database} WITH (FORCE);')
output=Path(os.environ.get('MMQ_RPC_TEST_RESULT','/tmp/mmq-reservation-actor-auth-results.json'))
output.write_text(json.dumps({'scope':'外部ネットワークなしPostgreSQL17・取得済み実関数・人工データ。UIDはSQLの認証スタブ。実Auth/全trigger/通知は未検証。','results':RESULTS},ensure_ascii=False,indent=2))
print(f'{len(RESULTS)}件成功。試験DBは削除済み。',flush=True)
