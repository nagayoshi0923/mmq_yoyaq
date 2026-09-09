import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderSeoShell, hasPublicStore } from '../../api/_lib/seoShell'
import routes from '../../vercel.json'
const { query, results } = vi.hoisted(() => ({ query: {} as Record<string, any>, results: [] as any[] }))
vi.mock('../../api/_lib/db.js', () => ({ db: { from: () => query } }))
vi.mock('node:fs', () => ({ copyFileSync: vi.fn(), unlinkSync: vi.fn(), readFileSync: () => '<html><head><title>old</title><link rel="canonical" href="https://mmq.game/"><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>' }))
import handler from '../../api/seo'
beforeEach(() => {
  results.length = 0
  for (const method of ['select', 'eq', 'not', 'order', 'limit']) query[method] = vi.fn(() => query)
  query.maybeSingle = vi.fn(async () => results.shift())
  query.then = (resolve: any) => Promise.resolve(results.shift()).then(resolve)
})
function response() {
  const r: any = { code: 0, html: '', headers: {} }
  r.setHeader = (k: string,v: string) => { r.headers[k] = v }
  r.status = (s: number) => { r.code=s; return r }
  r.send = (s: string) => { r.html=s; return r }
  r.end = () => r
  return r
}
describe('公開SEO', () => {
  it('同じアプリJSを残し、本文を初期HTMLに入れ、メタ情報を一重にする', () => {
    const html=renderSeoShell('<head><title>old</title><meta name="description" content="old"><link rel="canonical" href="/"><script src="/app.js"></script></head><div id="root"></div>', {title:'作品 <a>', description:'"説明"',canonical:'https://mmq.game/scenario/a',body:'<h1>作品</h1>'})
    expect(html.match(/<title>/g)).toHaveLength(1)
    expect(html.match(/rel="canonical"/g)).toHaveLength(1)
    expect(html).toContain('作品 &lt;a&gt;')
    expect(html).toContain('<h1>作品</h1>')
    expect(html).toContain('src="/app.js"')
  })
  it('通常アクセスとbotで配信経路を分けない', () => {
    for(const route of routes.rewrites.filter(r=>r.destination.startsWith('/api/seo'))) expect(route).not.toHaveProperty('has')
    expect(routes.rewrites.some(r=>r.source==='/:org/scenario/:slug')).toBe(true)
  })
  it('既存の静的ページを組織の404へ変えない', async () => {
    for(const slug of ['terms','privacy','about','contact','cancel-policy']) {
      const res=response();await handler({method:'GET',query:{kind:'org',slug}} as any,res);expect(res.code).toBe(200)
    }
  })
  it('検索入口と公開店舗一覧を維持し、事務所を公開一覧に載せない', async () => {
    expect(hasPublicStore([{status:'active',ownership_type:'office'}])).toBe(false)
    expect(hasPublicStore([{status:'active',ownership_type:'company'}])).toBe(true)
    results.push({data:[{title:'作品',slug:'work'}],error:null})
    const res=response(); await handler({method:'GET',query:{kind:'org',slug:'scenario'}} as any,res)
    expect(res.code).toBe(200); expect(res.html).toContain('/scenario/work')
  })
  it('存在しない作品は200ではなく404を返す', async () => {
    results.push({data:null,error:null});const res=response()
    await handler({method:'GET',query:{kind:'scenario',slug:'absent'}} as any,res)
    expect(res.code).toBe(404);expect(res.headers['X-Robots-Tag']).toBe('noindex')
  })
  it('DBエラーを不存在と誤認せず503、キャッシュなしにする', async () => {
    results.push({data:null,error:{message:'outage'}});const res=response()
    await handler({method:'GET',query:{kind:'scenario',slug:'work'}} as any,res)
    expect(res.code).toBe(503);expect(res.headers['Cache-Control']).toBe('no-store')
  })
  it('組織作品は組織IDで絞り込み、個別canonicalと本文を返す', async () => {
    results.push({data:{id:'org-a'},error:null},{data:{title:'作品',description:'公開のあらすじ',author:'作者',player_count_min:5,player_count_max:5,duration:120},error:null})
    const res=response(); await handler({method:'GET',query:{kind:'scenario',org:'shop',slug:'work'}} as any,res)
    expect(res.code).toBe(200);expect(query.eq).toHaveBeenCalledWith('organization_id','org-a')
    expect(res.html).toContain('https://mmq.game/shop/scenario/work');expect(res.html).toContain('参加人数：5人')
    expect(res.html).toContain('/assets/app.js')
  })
  it('認証・クーポン等の既存入口をDBに依存させない', async () => {
    const res=response();await handler({method:'GET',query:{kind:'org',slug:'coupon-claim'}} as any,res)
    expect(res.code).toBe(200);expect(res.headers['X-Robots-Tag']).toBe('noindex');expect(query.eq).not.toHaveBeenCalled()
  })
})
