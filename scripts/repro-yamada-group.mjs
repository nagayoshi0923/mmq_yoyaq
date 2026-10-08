import fs from 'node:fs'
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
const out='../review-evidence/withdraw-browser';fs.mkdirSync(out,{recursive:true})
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const browser=await chromium.launch({headless:true})
const results=[]
for(const config of [{width:393,count:0},{width:393,count:29},{width:1536,count:0},{width:1536,count:29},{width:393,count:29,nonOrganizer:true},{width:1536,count:29,status:'booking_requested'}]) {
 const {width,count,nonOrganizer=false,status='gathering'}=config
 const user={id:id(1),email:'organizer@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}
 const expires=Math.floor(Date.now()/1000)+86400
 const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url')
 const session={access_token:`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:id(1),exp:expires,aud:'authenticated'})}.test`,refresh_token:'local-only',expires_at:expires,expires_in:86400,token_type:'bearer',user}
 const stores=Array.from({length:4},(_,i)=>({id:id(30+i),name:`会場${i+1}`,short_name:`会場${i+1}`,organization_id:id(10),status:'active',ownership_type:'direct'}))
 const candidates=Array.from({length:count},(_,i)=>({id:id(100+i),group_id:id(2),date:i===0?'2026-12-05':`2026-11-${String(i+1).padStart(2,'0')}`,time_slot:'夜間',start_time:'19:00',end_time:'23:00',order_num:i+1,status:'active',created_at:'2026-10-03T00:00:00Z',responses:[]}))
 const members=Array.from({length:7},(_,i)=>({id:id(200+i),group_id:id(2),user_id:id(i===0?1:300+i),guest_name:`参加者${i+1}`,guest_phone:i===0?'09000000000':null,is_organizer:i===0,status:'joined',joined_at:'2026-10-01T00:00:00Z',date_responses:[]}))
 const group={id:id(2),invite_code:'local-yamada',organization_id:id(10),organizer_id:nonOrganizer?id(99):id(1),scenario_master_id:id(20),status,reservation_id:null,preferred_store_ids:stores.map(s=>s.id),candidate_dates:candidates,members,scenario_masters:{id:id(20),title:'季節のマーダーミステリー／ニィホン',player_count_min:7,player_count_max:7,effective_player_count_min:7,effective_player_count_max:7},created_at:'2026-10-03T00:00:00Z'}
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'})
 await context.addInitScript(s=>localStorage.setItem('mmq-supabase-auth',JSON.stringify(s)),session)
 const page=await context.newPage(),errors=[],failed=[],writes=[];page.setDefaultTimeout(6000);console.log('CASE',width,count)
 page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}))
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.origin==='http://127.0.0.1:5187')return route.continue()
  if(url.origin!=='http://127.0.0.1:65432')return route.abort('blockedbyclient')
  let data=[],isObject=req.headers().accept?.includes('vnd.pgrst.object')
  const table=url.pathname.split('/').at(-1),rpc=url.pathname.includes('/rpc/')
  if(url.pathname.includes('/auth/v1/user'))data=user
  else if(rpc) {
   if(table==='get_public_private_booking_scenario_timing')data={title:'架空作品',duration:240,weekend_duration:240,private_booking_time_slots:['午前','午後','夜'],private_booking_time_slots_weekend:['午前','午後','夜']}
   else if(table==='private_group_read_snapshot') data={group,access_level:nonOrganizer?'member':'organizer',current_member_id:members[0].id,linked_reservation_status:null,confirmed_by_name:null}
   else if(table==='private_group_read_messages')data=[]
   else if(table==='private_group_member_action')data={survey_enabled:false}
   else if(table==='get_public_preparation_context')data={stores:{},events:{}}
   else if(table.includes('deadline'))data=0
   else if(table==='private_group_add_candidate_dates') {const body=req.postDataJSON();writes.push(table);const added=body.p_candidates.map((d,i)=>({...d,time_slot:{morning:'午前',afternoon:'午後',evening:'夜間'}[d.time_slot],id:id(500+group.candidate_dates.length+i),group_id:group.id,order_num:i+1,status:'active',responses:[]}));group.candidate_dates.push(...added);data={success:true,candidate_ids:added.map(d=>d.id)}}
   else if(table==='private_group_withdraw_candidate') {writes.push(table);const body=req.postDataJSON();const candidate=group.candidate_dates.find(c=>c.id===body.p_candidate_id);candidate.withdrawn_at=new Date().toISOString();candidate.status='rejected';data={success:true,candidate_id:candidate.id}}
   else if(req.method()==='POST' && !table.startsWith('get_') && !table.includes('read'))writes.push(table)
  } else if(table==='users')data={id:id(1),role:'customer',is_store_representative:false}
  else if(table==='customers')data={id:id(3),user_id:id(1),name:'主催者',nickname:'主催者',phone:'09000000000'}
  else if(table==='business_hours_settings')data=stores.map(s=>({store_id:s.id,opening_hours:Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(d=>[d,{is_open:true,open_time:'09:00',close_time:'23:00',slot_start_times:{morning:'09:00',afternoon:'13:00',evening:'19:00'}}]))}))
  else if(table==='stores')data=stores
  else if(table==='organizations')data={id:id(10),slug:'queens-waltz',name:'クインズワルツ'}
  else if(table==='organization_settings')data={organization_id:id(10),custom_holidays:[]}
  else if(table==='organization_scenarios_with_master'||table==='scenario_masters')data={id:id(20),scenario_master_id:id(20),organization_id:id(10),title:group.scenario_masters.title,duration:240,weekend_duration:240,player_count_min:7,player_count_max:7,available_stores:stores.map(s=>s.id),private_booking_time_slots:['午前','午後','夜'],private_booking_time_slots_weekend:['午前','午後','夜'],characters:[]}
  else if(table==='global_settings')data={chat_enabled:true,chat_guest_allowed:true}
  else if(table==='staff')data=null
  if(!rpc&&!url.pathname.includes('/auth/'))data=isObject? (Array.isArray(data)?data[0]??null:data): (Array.isArray(data)?data:data===null?[]:[data])
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data),headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}})
 })
 await page.goto('http://127.0.0.1:5187/group/invite/local-yamada')
 await page.locator('button').filter({has:page.locator('svg.lucide-calendar')}).first().waitFor({timeout:20000}).catch(async()=>{console.log((await page.locator('body').innerText()).slice(0,2500));throw new Error('chat unavailable')})
 await page.locator('button').filter({has:page.locator('svg.lucide-calendar')}).first().click()
 await page.getByRole('heading',{name:'日程・進捗',exact:true}).waitFor()
 if(nonOrganizer||status!=='gathering'){assert.equal(await page.locator('.fixed').getByRole('button',{name:/を削除$/}).count(),0);assert.equal(await page.locator('.fixed').getByRole('button',{name:'予約リクエストを作成',exact:true,includeHidden:true}).count(),0);results.push({width,count,nonOrganizer,status,permissions:'PASS',errors,writes});await context.close();continue}
 if(count===0){
  await page.getByRole('button',{name:'候補日を追加',exact:true}).click()
  await page.getByRole('button',{name:/^2026-.* 夜$/}).first().click()
  await page.getByRole('button',{name:'候補日を保存',exact:true}).click()
  await page.locator('button').filter({has:page.locator('svg.lucide-calendar')}).first().click();await page.getByRole('heading',{name:'日程・進捗',exact:true}).waitFor();await page.getByRole('button',{name:/を削除$/}).first().waitFor()
  const saved=group.candidate_dates[0];assert.ok(saved)
  await page.getByRole('button',{name:'候補日を追加',exact:true}).click()
  const existing=page.getByRole('button',{name:`${saved.date} 夜 追加済み`,exact:true});await existing.waitFor();assert.equal(await existing.isDisabled(),true)
  await page.screenshot({path:`${out}/saved-reopen-${width}.png`})
  await page.getByRole('button',{name:'閉じる',exact:true}).last().click()
  await page.getByRole('button',{name:/を削除$/}).first().click();await page.getByRole('button',{name:'次へ',exact:true}).click();await page.getByRole('button',{name:'キャンセル',exact:true}).click()
  assert.equal(writes.filter(w=>w==='private_group_withdraw_candidate').length,0)
  await page.getByRole('button',{name:/を削除$/}).first().click();await page.getByRole('button',{name:'次へ',exact:true}).click();await page.getByRole('button',{name:'削除する',exact:true}).click()
  await page.waitForFunction(()=>!document.querySelector('button[aria-label$="を削除"]'))
  assert.ok(saved.withdrawn_at);assert.equal(writes.filter(w=>w==='private_group_withdraw_candidate').length,1)
  await page.reload();await page.getByRole('heading',{name:'日程・進捗',exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:/を削除$/}).count(),0)
  await page.screenshot({path:`${out}/deleted-reload-${width}.png`})
  await page.getByRole('button',{name:'候補日を追加',exact:true}).click();const again=page.getByRole('button',{name:`${saved.date} 夜`,exact:true});await again.waitFor();assert.equal(await again.isEnabled(),true);await again.click();await page.getByRole('button',{name:'候補日を保存',exact:true}).click();await page.getByRole('heading',{name:'日程・進捗',exact:true}).waitFor({state:'hidden'});assert.equal(group.candidate_dates.length,2);assert.notEqual(group.candidate_dates[1].id,saved.id);assert.deepEqual(group.candidate_dates[1].responses,[]);assert.deepEqual(errors,[]);results.push({width,count,saveReopenDeleteReloadReadd:'PASS',errors,writes});await context.close();continue
 }
 if(count===29){assert.equal(await page.locator('.fixed').getByRole('button',{name:/を削除$/,includeHidden:true}).count(),29)}
 if(count===0){assert.equal(await page.locator('.fixed').getByRole('button',{name:'予約リクエストを作成',exact:true,includeHidden:true}).count(),0);await page.goto('http://127.0.0.1:5187/group/invite/local-yamada?sheet=booking')}else await page.locator('.fixed').getByRole('button',{name:'予約リクエストを作成',exact:true,includeHidden:true}).click().catch(async e=>{await page.screenshot({path:`${out}/failed-${width}-${count}.png`});fs.writeFileSync(`${out}/failed-dom.json`,JSON.stringify(await page.evaluate(()=>({headings:[...document.querySelectorAll('h3')].map(e=>({text:e.textContent,rect:e.getBoundingClientRect().toJSON()})),fixed:[...document.querySelectorAll('.fixed')].map(e=>({text:e.textContent.slice(0,300),rect:e.getBoundingClientRect().toJSON(),scroll:e.scrollTop,children:[...e.children].map(d=>({rect:d.getBoundingClientRect().toJSON(),scroll:d.scrollTop}))}))})),null,2));throw e})
 console.log('booking opened',width,count);await page.getByRole('heading',{name:'予約リクエスト',exact:true}).waitFor()
 const heading=await page.getByRole('heading',{name:'予約リクエスト',exact:true}).boundingBox()
 assert.ok(heading.y>=0&&heading.y<844)
 assert.equal(await page.getByLabel('連絡先電話番号').count(),1)
 const sheet=await page.getByRole('heading',{name:'予約リクエスト',exact:true}).evaluate(e=>{const panel=e.parentElement.parentElement;return {rect:panel.getBoundingClientRect().toJSON(),text:panel.textContent,scrolls:[...panel.querySelectorAll('div')].filter(d=>getComputedStyle(d).overflowY==='auto').map(d=>({client:d.clientHeight,scroll:d.scrollHeight,top:d.scrollTop}))}})
 await page.screenshot({path:`${out}/booking-${width}-${count}.png`})
 console.log('booking inspected',width,count);await page.getByRole('button',{name:'キャンセル',exact:true}).click()
 if(!await page.getByRole('heading',{name:'日程・進捗',exact:true}).isVisible())await page.locator('button').filter({has:page.locator('svg.lucide-calendar')}).first().click()
 await page.getByRole('heading',{name:'日程・進捗',exact:true}).waitFor()
 // 戻る・開くを3回繰り返しても申込は送られない。
 for(let i=0;i<3;i++){if(count===0)await page.goto('http://127.0.0.1:5187/group/invite/local-yamada?sheet=booking');else await page.locator('.fixed').getByRole('button',{name:'予約リクエストを作成',exact:true,includeHidden:true}).click();await page.getByRole('heading',{name:'予約リクエスト',exact:true}).waitFor();await page.goBack();await page.getByRole('heading',{name:'日程・進捗',exact:true}).waitFor()}
 assert.deepEqual(writes,[])
 assert.deepEqual(errors,[])
 results.push({width,count,heading,sheet,errors,failed,writes})
 await context.close()
}
await browser.close();fs.writeFileSync(`${out}/full-app-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(({width,count,sheet,errors,writes,permissions})=>({width,count,panel:sheet?.rect,scroll:sheet?.scrolls,errors,writes,permissions})),null,2))
