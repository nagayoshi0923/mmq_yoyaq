import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
const db = new PGlite({ extensions: { pgcrypto } })
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE TABLE private_group_members(id uuid PRIMARY KEY,group_id uuid,user_id uuid,status text);
CREATE TABLE private_group_members_pii(member_id uuid PRIMARY KEY REFERENCES private_group_members(id),guest_name text,guest_email text,access_pin text,access_pin_hash text,failed_attempts integer NOT NULL DEFAULT 0,locked_until timestamptz,updated_at timestamptz);
INSERT INTO private_group_members VALUES('${id(2)}','${id(1)}',NULL,'joined'),('${id(3)}','${id(1)}',NULL,'joined'),('${id(4)}','${id(1)}','${id(10)}','joined');
INSERT INTO private_group_members_pii(member_id,guest_name,guest_email) VALUES('${id(2)}','架空ゲスト','test@example.invalid'),('${id(3)}','別ゲスト','other@example.invalid'),('${id(4)}','会員','user@example.invalid');`)
await db.exec(fs.readFileSync('supabase/migrations/20260927001000_guest_pin_attempt_limit.sql','utf8'))
const call = async (name, args) => {
  await db.exec('SET ROLE anon')
  try { return (await db.query(`SELECT * FROM ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args)).rows }
  finally { await db.exec('RESET ROLE') }
}
const auth = (pin='1234', email='test@example.invalid', group=id(1)) => call('authenticate_guest_by_pin_v2',[group,email,pin])
const state = async () => (await db.query('SELECT failed_attempts, locked_until, access_pin_hash FROM private_group_members_pii WHERE member_id=$1',[id(2)])).rows[0]
await call('save_guest_access_pin',[id(2),'1234'])
assert.equal((await auth())[0].member_id,id(2))
assert.equal((await auth('1234',' TEST@example.invalid '))[0].member_id,id(2))
assert.deepEqual(await auth('1234','missing@example.invalid'),[])
assert.deepEqual(await auth('1234','test@example.invalid',id(99)),[])
await assert.rejects(()=>call('save_guest_access_pin',[id(4),'1234']), /Guest member not found/)
await assert.rejects(()=>call('save_guest_access_pin',[id(3),'12xx']), /four digits/)
assert.deepEqual(await auth('12xx'),[])
assert.equal((await state()).failed_attempts,0)
for(let i=0;i<9;i++) assert.deepEqual(await auth('9999'),[])
assert.equal((await state()).failed_attempts,9)
assert.deepEqual(await auth('9999'),[{member_id:null,guest_name:null,guest_email:null,locked:true}])
const lockedState=await state()
assert.equal(lockedState.failed_attempts,10)
assert.ok(new Date(lockedState.locked_until).getTime()>Date.now()+14*60*1000)
assert.equal((await auth())[0].locked,true, 'correct PIN cannot bypass active lock')
assert.deepEqual(await call('authenticate_guest_by_pin',[id(1),'test@example.invalid','1234']),[], 'old RPC cannot bypass lock')
await assert.rejects(()=>call('save_guest_access_pin',[id(2),'7777']), /already configured/, 'public UUID cannot reset PIN/clear lock')
assert.equal((await state()).access_pin_hash,lockedState.access_pin_hash)
assert.equal((await state()).failed_attempts,10)
await db.query("UPDATE private_group_members_pii SET locked_until=clock_timestamp()-interval '1 second' WHERE member_id=$1",[id(2)])
assert.deepEqual(await auth('9999'),[])
assert.equal((await state()).failed_attempts,1,'expired lock starts a new attempt window')
assert.equal((await auth())[0].member_id,id(2))
assert.equal((await state()).failed_attempts,0)
assert.equal((await state()).locked_until,null)
assert.deepEqual(await call('authenticate_guest_by_pin',[id(1),'test@example.invalid','9999']),[])
assert.equal((await state()).failed_attempts,1,'old RPC shares the same counter')
await db.query("UPDATE private_group_members SET status='left' WHERE id=$1",[id(2)])
assert.deepEqual(await auth(),[])
await db.query("UPDATE private_group_members_pii SET access_pin='1234' WHERE member_id=$1",[id(3)])
assert.deepEqual(await auth('1234','other@example.invalid'),[],'plaintext fallback is not accepted')
await assert.rejects(()=>call('save_guest_access_pin',[id(3),'1234']),/already configured/)
await db.exec(fs.readFileSync('supabase/rollbacks/20260927001000_guest_pin_attempt_limit.sql','utf8'))
await db.exec(fs.readFileSync('supabase/migrations/20260927001000_guest_pin_attempt_limit.sql','utf8'))
assert.equal((await auth('9999','other@example.invalid')).length,0)
await db.close()
console.log('PASS: guest PIN lock, old entrypoint, reset bypass, isolation, expiry and rollback/reapply')
