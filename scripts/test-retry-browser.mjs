// 架空送信のみ。HTTP serverはloopback、ブラウザの外部通信は拒否する。
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium } from '@playwright/test'
const bundle=await build({entryPoints:['src/lib/repeatFailureBackoff.ts'],bundle:true,write:false,format:'esm'})
const server=createServer((req,res)=>{res.setHeader('Content-Type', req.url==='/helper.js'?'text/javascript':'text/html');res.end(req.url==='/helper.js'?bundle.outputFiles[0].text:'<title>架空再送試験</title>')})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const origin=`http://127.0.0.1:${server.address().port}`
let browser
try {
 browser=await chromium.launch({headless:true})
 const context=await browser.newContext()
 await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort())
 const a=await context.newPage(),b=await context.newPage()
 await Promise.all([a.goto(origin),b.goto(origin)])
 const init=page=>page.evaluate(async()=>{window.helper=await import('/helper.js');window.sent=[];window.send=(value,failed=false)=>window.helper.withRepeatFailureBackoff('answer',async()=>{window.sent.push(value);return failed},Boolean)})
 await Promise.all([init(a),init(b)])
 const running=a.evaluate(()=>window.helper.withRepeatFailureBackoff('parallel',()=>new Promise(resolve=>{window.finish=resolve;window.started=true}),Boolean))
 await a.waitForFunction(()=>window.started)
 assert.equal(await b.evaluate(async()=>{try {await window.helper.withRepeatFailureBackoff('parallel',async()=>{window.sent.push('parallel');return false},Boolean);return 'sent'} catch{return 'blocked'}}),'blocked')
 await a.evaluate(()=>window.finish(false));await running
 assert.deepEqual(await b.evaluate(()=>window.sent),[])
 await a.evaluate(async()=>{for(let i=0;i<3;i++) await window.send('old',true)})
 assert.equal(await b.evaluate(async()=>{try{await window.send('old');return 'sent'}catch{return 'blocked'}}),'blocked')
 await a.reload();await init(a)
 assert.equal(await a.evaluate(async()=>{try{await window.send('old');return 'sent'}catch{return 'blocked'}}),'blocked')
 // 時間のみを進め、破棄した要求がタイマーで後送されないことも確認。
 await Promise.all([a.clock.install(),b.clock.install()])
 await Promise.all([a.clock.fastForward(10001),b.clock.fastForward(10001)])
 await b.evaluate(()=>window.send('latest'))
 assert.deepEqual(await b.evaluate(()=>window.sent),['latest'])
 await Promise.all([a.clock.fastForward(10001),b.clock.fastForward(10001)])
 assert.deepEqual(await b.evaluate(()=>window.sent),['latest'])
 assert.deepEqual(await a.evaluate(()=>window.sent),[])
 console.log('PASS: real Chromium Web Locks, two tabs, failure loop, reload persistence, latest-only retry, no delayed stale write; external requests blocked')
} finally {
 if(browser) await browser.close()
 await new Promise(r=>server.close(r))
}
