"""専用network-none PostgreSQLで実RPCの2接続競合。架空データ、通知・外部通信なし。"""
import json, pathlib, re, subprocess, time
root = pathlib.Path(__file__).resolve().parents[1]
container = 'mmq-retry-concurrency-isolated'
id = lambda n: f'00000000-0000-4000-a000-{n:012d}'
def docker(*args, **kwargs):
    return subprocess.run(['docker', *args], check=True, text=True, capture_output=True, **kwargs)
def sql(text):
    return docker('exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At',input=text).stdout.strip()
try:
    docker('run','--detach','--name',container,'--network','none','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17')
    for attempt in range(50):
        if subprocess.run(['docker','exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],capture_output=True).returncode==0: break
        time.sleep(.2)
    fixture=(root/'scripts/test-staff-participation-seats-db.mjs').read_text()
    setup=re.findall(r'await db.exec\(`([\s\S]*?)`\)',fixture)[:2]
    sql('\n'.join(re.sub(r'\$\{id\((\d+)\)\}',lambda m:id(int(m[1])),s) for s in setup))
    sql((root/'supabase/migrations/20260928001200_staff_participation_seats.sql').read_text())
    release=(root/'supabase/migrations/20261013130002_stale_staff_retry_compatibility.sql').read_text()
    definition=lambda text:re.search(r'CREATE OR REPLACE FUNCTION public\.sync_event_staff_participations\([\s\S]*?\$function\$\s*;',text).group()
    sql(definition(release))
    actor=f"SELECT set_config('test.actor','{id(10)}',false),set_config('test.org','{id(1)}',false);"
    entries=json.dumps([dict(staff_id=id(n),mode='included',reservation_id=id(40)) for n in [21,22]])
    expectedstaff=json.dumps(dict(gms=['A','B'],gm_roles=dict(A='staff',B='staff')))
    call=f"SELECT sync_event_staff_participations('{id(30)}','{entries}'::jsonb,'[]'::jsonb,ARRAY['A','B'],'{{\"A\":\"staff\",\"B\":\"staff\"}}'::jsonb,'{expectedstaff}'::jsonb);"
    holder=subprocess.Popen(['docker','exec','-i',container,'psql','-U','postgres','-At'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    holder.stdin.write(f"BEGIN; SELECT pg_try_advisory_xact_lock(hashtextextended('mmq-staff-write:{id(10)}:{id(30)}',0));\n");holder.stdin.flush()
    assert holder.stdout.readline().strip()=='BEGIN'
    assert holder.stdout.readline().strip()=='t'
    start=time.monotonic()
    try: sql(actor+call);raise AssertionError('parallel RPC admitted')
    except subprocess.CalledProcessError as err: assert '予約が別の操作で更新中' in err.stderr,err.stderr
    assert time.monotonic()-start<1,'parallel rejection must not wait for lock'
    holder.stdin.write('ROLLBACK;\n');holder.stdin.close();holder.wait(timeout=5)
    result=sql(actor+call).splitlines()[-1]
    assert len(json.loads(result)['entries'])==2
    stale=json.loads(sql(actor+call).splitlines()[-1])
    assert stale['success'] is False and stale['code']=='40001'
    assert stale['entries']==json.loads(result)['entries']
    # 旧RPC利用者はエラー時だけ再送する。競合はSQL例外にならず、この1件で止まる。
    assert len(stale['entries'])==2
    snapshot=sql("SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM reservations r;")
    rollback=(root/'supabase/rollbacks/20261013130002_stale_staff_retry_compatibility.sql').read_text()
    sql(definition(rollback));sql(definition(release))
    assert sql("SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM reservations r;")==snapshot
    assert sql("SELECT has_function_privilege('anon','sync_event_staff_participations(uuid,jsonb,jsonb,text[],jsonb,jsonb)','EXECUTE');")=='f'
    assert 'pg_sleep' not in definition(release)
    print('PASS: real PostgreSQL 17 two-connection RPC admission, immediate rejection, success, stale expected, anon denial, rollback/reapply preserves reservations; network none')
finally:
    subprocess.run(['docker','rm','-f',container],capture_output=True)
