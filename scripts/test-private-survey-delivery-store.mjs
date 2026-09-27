import fs from 'node:fs'
import assert from 'node:assert/strict'
import { transformSync } from 'esbuild'
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite')
const compile=path=>{const module={exports:{}};new Function('module',transformSync(fs.readFileSync(path,'utf8'),{loader:'ts',format:'cjs'}).code)(module);return module.exports}
const {surveyDeliveryStore}=compile('supabase/functions/_shared/private-survey-delivery-store.ts')
const {deliverPrivateSurveys}=compile('supabase/functions/_shared/private-survey-delivery.ts')
const db=new PGlite()
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
CREATE TABLE reservations(id uuid PRIMARY KEY,organization_id uuid,status text,schedule_event_id uuid,private_group_id uuid);
CREATE TABLE private_groups(id uuid PRIMARY KEY,organization_id uuid,reservation_id uuid,status text);
CREATE TABLE schedule_events(id uuid PRIMARY KEY,organization_id uuid,is_cancelled boolean);
CREATE TABLE email_logs(id uuid PRIMARY KEY,organization_id uuid,reservation_id uuid,to_email text,to_name text,subject text,body_html text,body_text text,email_type text,provider text,status text,provider_message_id text,sent_at timestamptz,error_message text);`)
await db.exec(fs.readFileSync('supabase/schemas/private_group_survey_deliveries.sql','utf8'))
await db.exec(fs.readFileSync('supabase/rpcs/private_survey_delivery_completion.sql','utf8'))
// DBアダプターの実SQLを通す。業務ロジックはこのビルダーに持たせない。
const ident=s=>{assert.match(s,/^[a-z_][a-z_0-9]*$/);return '"'+s+'"'}
const client={async rpc(name,values){try{assert.equal(name,'complete_private_survey_delivery');const result=await db.query('SELECT complete_private_survey_delivery($1,$2,$3,$4) AS ok',Object.values(values));return {data:result.rows[0].ok,error:null}}catch(error){return {data:null,error}}},from(table){let operation='select',values,columns='*',returning=false,filters=[],sort='',limit='',single=false
 const q={select(c='*'){columns=c;if(operation!=='select')returning=true;return q},update(v){operation='update';values=v;return q},insert(v){operation='insert';values=v;return q},
 eq(k,v){filters.push([k,'=',v]);return q},lt(k,v){filters.push([k,'<',v]);return q},lte(k,v){filters.push([k,'<=',v]);return q},in(k,v){filters.push([k,'IN',v]);return q},
 order(k,{ascending}){sort=` ORDER BY ${ident(k)} ${ascending?'ASC':'DESC'}`;return q},limit(n){limit=` LIMIT ${Number(n)}`;return q},maybeSingle(){single=true;return q},
 async then(resolve,reject){try{
  const args=[],param=v=>{args.push(v&&typeof v==='object'?JSON.stringify(v):v);return '$'+args.length}
  const projection=columns==='*'?'*':columns.split(',').map(ident).join(',')
  let statement
  if(operation==='insert')statement=`INSERT INTO ${ident(table)} (${Object.keys(values).map(ident)}) VALUES (${Object.values(values).map(param)})`
  if(operation==='update')statement=`UPDATE ${ident(table)} SET ${Object.entries(values).map(([k,v])=>`${ident(k)}=${param(v)}`).join(',')}`
  if(operation==='select')statement=`SELECT ${projection} FROM ${ident(table)}`
  if(filters.length)statement+=' WHERE '+filters.map(([k,op,v])=>op==='IN'?`${ident(k)} IN (${v.map(param).join(',')})`:`${ident(k)}${op}${param(v)}`).join(' AND ')
  if(operation==='select')statement+=sort+limit
  else if(returning)statement+=' RETURNING '+projection
  const {rows}=await db.query(statement,args)
  if(single&&rows.length>1)throw new Error('multiple_rows')
  return resolve({data:single?(rows[0]||null):rows,error:null})
 }catch(error){return resolve({data:null,error})}}
 };return q}}
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const start=Date.parse('2026-09-27T00:00:00Z');let clock=start,sends=[]
const store=surveyDeliveryStore(client)
const settings=async()=>({apiKey:'test-key',from:'MMQ <test@example.invalid>'})
const send=async(url,init)=>{sends.push({url,init});return new Response('{"id":"mail1"}',{status:200})}
const run=()=>deliverPrivateSurveys(store,settings,{send,now:()=>clock})
const reset=async()=>{
 await db.exec('DELETE FROM private_group_survey_deliveries;DELETE FROM email_logs;DELETE FROM reservations;DELETE FROM private_groups;DELETE FROM schedule_events')
 await db.query("INSERT INTO reservations VALUES($1,$2,'confirmed',$3,$4)",[id(1),id(2),id(7),id(3)])
 await db.query("INSERT INTO private_groups VALUES($1,$2,$3,'confirmed')",[id(3),id(2),id(1)])
 await db.query('INSERT INTO schedule_events VALUES($1,$2,false)',[id(7),id(2)])
 await db.query("INSERT INTO private_group_survey_deliveries(id,reservation_id,organization_id,group_id,schedule_event_id,actor_id,source,message_id,customer_email,customer_name,subject,message_body,next_attempt_at) VALUES($1,$2,$3,$5,$6,$7,'manual',$8,'saved@example.invalid','氏名','アンケート案内','本文',$4)",[id(4),id(1),id(2),new Date(start).toISOString(),id(3),id(7),id(8),id(9)])
 sends=[];clock=start
}
const row=async()=>(await db.query('SELECT * FROM private_group_survey_deliveries')).rows[0]
await reset();await Promise.all([run(),run()]);assert.equal(sends.length,1);assert.equal((await row()).status,'sent');assert.equal((await db.query('SELECT status FROM email_logs')).rows[0].status,'sent')
// 別組織・別予約リンク・異なる公演の対象を送信しない。
for(const mutation of ["UPDATE reservations SET organization_id='00000000-0000-0000-0000-000000000009'","UPDATE private_groups SET reservation_id='00000000-0000-0000-0000-000000000009'","UPDATE reservations SET schedule_event_id='00000000-0000-0000-0000-000000000099'"]){
 await reset();await db.exec(mutation);await run();assert.equal(sends.length,0);assert.equal((await row()).status,'superseded')
}
// 期限切れリースは再取得でき、以前の所有者による書換えは拒否する。
await reset();const candidate=(await store.due(new Date(clock).toISOString()))[0]
const first=await store.claim(candidate,id(5),new Date(clock).toISOString(),new Date(clock+1000).toISOString())
clock+=2000;await store.recoverExpired(new Date(clock).toISOString());const second=await store.claim(await row(),id(6),new Date(clock).toISOString(),new Date(clock+1000).toISOString())
assert.ok(second);await assert.rejects(store.save(first,id(5),{status:'sent'}),/lease_lost/)
await store.save(second,id(6),{status:'pending',lease_token:null,lease_until:null});await run();assert.equal(sends.length,1)
// メール履歴INSERTの実失敗は送信前に止まる。
await reset();await db.exec("CREATE FUNCTION reject_log() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'log failure';END$$;CREATE TRIGGER reject_log BEFORE INSERT ON email_logs FOR EACH ROW EXECUTE FUNCTION reject_log()")
await run();assert.equal(sends.length,0);assert.equal((await row()).status,'pending');await db.exec('DROP TRIGGER reject_log ON email_logs')
// ID衝突で別メールの記録を上書きしない。
await reset();await db.query("INSERT INTO email_logs(id,organization_id,reservation_id,to_email) VALUES($1,$2,$3,'other@example.invalid')",[id(4),id(9),id(9)])
await run();assert.equal(sends.length,0);assert.equal((await db.query('SELECT to_email FROM email_logs')).rows[0].to_email,'other@example.invalid')
// 受付後の履歴UPDATE失敗では配送行もsentにならず、同じキーで再確認できる。
await reset();await db.exec("CREATE TRIGGER reject_log_update BEFORE UPDATE ON email_logs FOR EACH ROW EXECUTE FUNCTION reject_log()")
await run();assert.equal(sends.length,1);assert.equal((await row()).status,'pending');assert.equal((await db.query('SELECT status FROM email_logs')).rows[0].status,'queued')
await db.exec('DROP TRIGGER reject_log_update ON email_logs');clock+=3600000;await run();assert.equal((await row()).status,'sent');assert.equal(sends[0].init.headers['Idempotency-Key'],sends[1].init.headers['Idempotency-Key']);assert.equal((await db.query('SELECT status FROM email_logs')).rows[0].status,'sent')
await reset();await deliverPrivateSurveys(store,settings,{now:()=>clock,send:async(url,init)=>{await db.exec("UPDATE email_logs SET status='delivered'");return send(url,init)}});assert.equal((await db.query('SELECT status FROM email_logs')).rows[0].status,'delivered')
// DB完了後の応答切断でも配送と履歴は揃い、次回送信しない。
await reset();const originalRpc=client.rpc;client.rpc=async(...args)=>{await originalRpc(...args);throw new Error('response lost')}
await assert.rejects(run());assert.equal((await row()).status,'sent');assert.equal((await db.query('SELECT status FROM email_logs')).rows[0].status,'sent')
client.rpc=originalRpc;await run();assert.equal(sends.length,1)
// ブラウザから配信受付を偽装できない。
await db.exec('SET ROLE authenticated');await assert.rejects(db.query('SELECT complete_private_survey_delivery($1,$2,$3,$4)',[id(4),id(5),'forged',new Date(clock).toISOString()]),e=>e.code==='42501');await db.exec('RESET ROLE')
// 不明なプロバイダー結果は成功にしない。期限を過ぎた再送も行わない。
await reset();await deliverPrivateSurveys(store,settings,{now:()=>clock,send:async()=>new Response('{}',{status:200})})
assert.equal((await row()).status,'pending');assert.ok((await row()).first_attempt_at)
clock+=24*3600000;await run();assert.equal((await row()).status,'uncertain');assert.equal(sends.length,0)
await reset();await deliverPrivateSurveys(store,settings,{now:()=>clock,send:async()=>{throw new Error('network failure')}})
const frozen=(await row()).provider_payload;clock+=3600000
await deliverPrivateSurveys(store,async()=>({apiKey:'test-key',from:'Changed <changed@example.invalid>'}),{now:()=>clock,send})
assert.deepEqual(JSON.parse(sends[0].init.body),frozen);assert.equal((await row()).status,'sent')
for(const mutation of ["UPDATE reservations SET status='cancelled'","UPDATE schedule_events SET is_cancelled=true","UPDATE schedule_events SET organization_id='00000000-0000-0000-0000-000000000099'"]) {
 await reset();await db.exec(mutation);await run();assert.equal(sends.length,0);assert.equal((await row()).status,'superseded')
}
await db.close();console.log('PASS: actual delivery store SQL, CAS double claim, expired lease fencing, exact survey reservation/event generation, tenant/group boundaries, strict log persistence')
