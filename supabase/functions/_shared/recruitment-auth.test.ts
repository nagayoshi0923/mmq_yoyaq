import { isRecruitmentSchedulerCall } from './recruitment-auth.ts'
Deno.test('追加募集認証: 専用キー・共通キー・空値・誤キー', () => {
  const names=['RECRUITMENT_CRON_SECRET','CRON_SECRET','EDGE_FUNCTION_CRON_SECRET']
  const prior=names.map(name=>Deno.env.get(name))
  const call=(value?:string)=>isRecruitmentSchedulerCall(new Request('https://fixture.invalid',{headers:value ? {'x-recruitment-cron-secret':value}: {}}))
  const assert=(value:boolean,message:string)=>{if(!value)throw new Error(message)}
  try {
    names.forEach(name=>Deno.env.delete(name))
    assert(!call('fixture-only'), '未設定は拒否')
    Deno.env.set('CRON_SECRET','fixture-only')
    assert(call('fixture-only'), '共通キーで旧ヘッダーを認証')
    assert(!call('wrong')&&!call(), '不一致と欠落は拒否')
    Deno.env.set('RECRUITMENT_CRON_SECRET','dedicated-only')
    assert(call('dedicated-only')&&!call('fixture-only'), '専用キーがあれば専用ヘッダーでは優先')
    Deno.env.set('RECRUITMENT_CRON_SECRET',' ')
    assert(call('fixture-only'), '空白専用キーは共通へ継承')
    Deno.env.delete('CRON_SECRET');Deno.env.set('EDGE_FUNCTION_CRON_SECRET','edge-only')
    assert(call('edge-only'), '旧共通キー名を保持')
  } finally { names.forEach((name,i)=>prior[i]===undefined?Deno.env.delete(name):Deno.env.set(name,prior[i]!)) }
})
