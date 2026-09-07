import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs'
import {execFileSync, spawnSync} from 'node:child_process'
import {tmpdir} from 'node:os'
import path from 'node:path'
const script=path.resolve('scripts/supabase-release-scope.mjs')
for (const mode of ['direct','shared','unrelated','missing-migration']) test(mode,()=>{
 const root=mkdtempSync(path.join(tmpdir(),'mmq-scope-'))
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'})
 const put=(p,s)=>{mkdirSync(path.dirname(path.join(root,p)),{recursive:true});writeFileSync(path.join(root,p),s)}
 try {
  git('init','-q');git('config','user.email','fixture@example.invalid');git('config','user.name','fixture')
  put('supabase/functions/target/index.ts',"import { value } from '../_shared/helper.ts'\n")
  put('supabase/functions/untouched/index.ts','export const n = 1;')
  put('supabase/functions/_shared/helper.ts','export const value = 1;')
  git('add','.');git('commit','-qm','initial');const before=git('rev-parse','HEAD').trim()
  if(mode==='direct')put('supabase/functions/target/index.ts','export const n = 2;')
  if(mode==='shared')put('supabase/functions/_shared/helper.ts','export const value = 2;')
  if(mode==='unrelated')put('docs/change.md','docs only')
  if(mode==='missing-migration')put('supabase/migrations/20260907090000_test.sql','select 1;')
  git('add','.');git('commit','-qm','change');const head=git('rev-parse','HEAD').trim()
  put('event.json',JSON.stringify({before}));put('mock-fetch.mjs','globalThis.fetch = async () => ({ok:true,json:async()=>[]});')
  const result=spawnSync(process.execPath,['--import',path.join(root,'mock-fetch.mjs'),script],{cwd:root,encoding:'utf8',env:{...process.env,GITHUB_EVENT_PATH:path.join(root,'event.json'),GITHUB_SHA:head,RUNNER_TEMP:root,SUPABASE_PROJECT_REF:'lavutzztfqbdndjiwluc'}})
  if(mode==='missing-migration'){assert.notEqual(result.status,0);assert.match(result.stderr,/DBへの先行適用が必要/)}
  else {assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(path.join(root,'mmq-deploy-functions.txt'),'utf8'),mode==='unrelated'?'':'target\n')}
 } finally {rmSync(root,{recursive:true,force:true})}
})
