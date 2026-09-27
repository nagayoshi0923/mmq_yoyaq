import fs from 'node:fs'
import assert from 'node:assert/strict'
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite')
const db=new PGlite()
await db.exec(`CREATE SCHEMA cron;CREATE SCHEMA net;CREATE TABLE app_config(key text PRIMARY KEY,value text);
CREATE TABLE cron.job(jobid bigint GENERATED ALWAYS AS IDENTITY,jobname text UNIQUE,schedule text,command text);
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE plpgsql AS $$DECLARE result bigint;BEGIN INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3) ON CONFLICT(jobname) DO UPDATE SET schedule=excluded.schedule,command=excluded.command RETURNING jobid INTO result;RETURN result;END$$;
CREATE FUNCTION cron.unschedule(bigint) RETURNS boolean LANGUAGE plpgsql AS $$BEGIN DELETE FROM cron.job WHERE jobid=$1;RETURN true;END$$;
CREATE FUNCTION net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) RETURNS bigint LANGUAGE sql AS $$SELECT 1::bigint$$;`)
const migration=fs.readFileSync('supabase/migrations/20260927047100_private_rejection_delivery_cron.sql','utf8')
const rollback=fs.readFileSync('supabase/rollbacks/20260927047100_private_rejection_delivery_cron.sql','utf8')
await assert.rejects(db.exec(migration),/configuration missing/)
await db.exec("INSERT INTO app_config VALUES('supabase_url','https://testproject.supabase.co'),('supabase_anon_key','test-public'),('trigger_secret','test-cron')")
await db.exec(migration);await db.exec(migration)
const rows=(await db.query('SELECT * FROM cron.job')).rows;assert.equal(rows.length,1);assert.equal(rows[0].schedule,'*/5 * * * *')
assert.match(rows[0].command,/process-private-rejection-deliveries/);assert.match(rows[0].command,/trigger_secret/);assert.doesNotMatch(rows[0].command,/test-cron/)
await db.exec('EXPLAIN '+rows[0].command)
await db.exec(rollback);assert.equal((await db.query('SELECT * FROM cron.job')).rows.length,0)
await db.exec(migration);assert.equal((await db.query('SELECT * FROM cron.job')).rows.length,1)
await db.close();console.log('PASS: cron configuration guard, repeat apply, command SQL syntax, unschedule/reapply (extension functions stubbed)')
