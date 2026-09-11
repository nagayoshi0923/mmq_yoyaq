import fs from 'node:fs';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const sql=fs.readFileSync('supabase/migrations/20260911100000_separate_private_reminder.sql','utf8');
const old=fs.readFileSync('supabase/tests/fixtures/reminder_legacy.txt','utf8');
for(const changed of [false,true,'staging']){
 const db=new PGlite();await db.exec(`CREATE TABLE organizations(id uuid PRIMARY KEY,slug text); CREATE TABLE email_settings(organization_id uuid,reminder_template text);INSERT INTO organizations VALUES ('00000000-0000-0000-0000-000000000001','queens-waltz'),('00000000-0000-0000-0000-000000000002','other');`);
 await db.query('INSERT INTO email_settings VALUES ($1,$2),($1,NULL),($3,$4)',['00000000-0000-0000-0000-000000000001',changed==='staging'?old.replace('大塚・大久保店以外','大塚店以外'):changed?old+'編集':old,'00000000-0000-0000-0000-000000000002','他社独自文面']);
 if(changed===true){await assert.rejects(db.exec(sql),/Reminder text changed/)}else{
 await db.exec(sql);const rows=(await db.query('SELECT * FROM email_settings ORDER BY organization_id,reminder_template NULLS LAST')).rows;
 assert.match(rows[0].reminder_template,/開催判断/);assert.doesNotMatch(rows[0].reminder_template,/貸切公演は30日前/);
 assert.doesNotMatch(rows[0].private_reminder_template,/残席|48時間|24時間|不成立/);
 assert.match(rows[0].private_reminder_template,/貸切公演は30日前/);assert.match(rows[0].private_reminder_template,/予約時の案内/);
 if(changed==='staging') {assert.match(rows[0].private_reminder_template,/大塚店以外/);assert.doesNotMatch(rows[0].reminder_template,/大塚・大久保店以外/);}
 assert.equal(rows[1].private_reminder_template,changed==='staging'?rows[0].private_reminder_template.replace('大塚店以外','大塚・大久保店以外'):rows[0].private_reminder_template);
 assert.equal(rows[2].reminder_template,'他社独自文面');assert.equal(rows[2].private_reminder_template,null);
 }
 await db.close();
}
console.log('PASS: split contents, shared guidance retained, tenant isolation, null row seeding, concurrent-edit guard');
