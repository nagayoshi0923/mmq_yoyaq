import { generateOAuthHeader } from './x-oauth.ts'
import type { RecruitmentSnapshot } from './recruitment-notice.ts'
// @ts-ignore Deno resolves the remote type; the browser build only imports testable helpers.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function recruitmentPostText(snapshot: RecruitmentSnapshot, kind: string): string {
  const title = Array.from(snapshot.scenario).slice(0, 32).join('')
  const store = Array.from(snapshot.store_name || '').slice(0, 12).join('')
  const heading = `${snapshot.date} ${snapshot.start_time.slice(0, 5)} ${title}\n${store}`
  if (kind !== 'extension') return `${kind === 'confirmed' ? '【開催決定】人数が揃いました。' : '【公演中止】人数未達のため中止となりました。'}\n${heading}\nご予約のお客様へメールでご案内します。`
  const deadline = new Date(snapshot.deadline).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return `【追加募集】あと${snapshot.missing_participants ?? 1}人\n${heading}\n${deadline}まで（日本時間）\nご予約：${snapshot.site_url}`
}

export async function sendRecruitmentXPosts(db: SupabaseClient, orgId: string, keys: string[]): Promise<void> {
  const { data: jobs, error } = await db.rpc('claim_recruitment_x_posts', { p_org: orgId })
  if (error) { console.error('X投稿キュー取得失敗'); return }
  if (!jobs?.length) return
  async function xFetch(path: string, method: string, body?: unknown) {
    const url = `https://api.twitter.com/2/${path}`
    const authorization = await generateOAuthHeader(method, url, keys[0], keys[1], keys[2], keys[3])
    return fetch(url, { method, headers: { Authorization: authorization, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) })
  }
  let accountVerified = false
  for (const job of jobs) {
    const update = async (patch: Record<string, unknown>) => {
      const { error: saveError } = await db.from('recruitment_x_posts').update({ ...patch, updated_at: new Date().toISOString(), lease_until: null }).eq('id', job.id).eq('organization_id', orgId).eq('status', 'sending')
      if (saveError) console.error('X投稿結果保存失敗（リース期限後に運営確認）')
    }
    let posting = false
    try {
      const { data: state, error: stateError } = await db.from('performance_recruitment_deadlines').select('cycle,status,deadline').eq('schedule_event_id', job.schedule_event_id).eq('organization_id', orgId).single()
      if (stateError) throw new Error('公演状態を取得できません')
      if (job.kind === 'extension' && (state.cycle !== job.cycle || state.status !== 'active' || Date.parse(state.deadline) <= Date.now())) { await update({ status: 'expired' }); continue }
      let parentId: string | undefined
      if (job.kind !== 'extension') {
        const { data: parent, error: parentError } = await db.from('recruitment_x_posts').select('tweet_id,status').eq('schedule_event_id', job.schedule_event_id).eq('organization_id', orgId).eq('cycle', job.cycle).eq('kind', 'extension').maybeSingle()
        if (parentError) throw new Error('元の告知を取得できません')
        if (!parent || parent.status === 'expired') { await update({ status: 'expired' }); continue }
        if (parent.status === 'uncertain' || (parent.status === 'failed' && job.attempts >= 10)) { await update({ status: 'uncertain', last_error: '元の追加募集投稿の確認が必要です' }); continue }
        if (!parent.tweet_id) { await update({ status: 'pending', attempts: job.attempts - 1, next_attempt_at: new Date(Date.now() + 60000).toISOString() }); continue }
        parentId = parent.tweet_id
      }
      if (keys.some(key => !key)) throw new Error('X投稿用の接続設定がありません')
      if (!accountVerified) {
        const response = await xFetch('users/me', 'GET')
        if (!response.ok) throw new Error(`Xアカウント確認失敗 HTTP ${response.status}`)
        const account = await response.json()
        if (account.data?.username?.toLowerCase() !== 'queens_waltz') throw new Error('X接続先が承認済みアカウントと異なります')
        accountVerified = true
      }
      const text = recruitmentPostText(job.snapshot, job.kind)
      posting = true
      const response = await xFetch('tweets', 'POST', { text, ...(parentId ? { reply: { in_reply_to_tweet_id: parentId } } : {}) })
      if (!response.ok) {
        // 5xx は投稿済みの可能性があるため、自動再投稿しない。
        if (response.status < 500) posting = false
        throw new Error(`X投稿失敗 HTTP ${response.status}`)
      }
      const result = await response.json()
      if (!result.data?.id) throw new Error('X投稿結果のIDを取得できません')
      await update({ status: 'sent', tweet_id: result.data.id, post_text: text, last_error: null })
    } catch (e) {
      await update({ status: posting ? 'uncertain' : 'failed', last_error: e instanceof Error ? e.message : 'X投稿処理に失敗しました', next_attempt_at: new Date(Date.now() + Math.min(600000, 60000 * job.attempts)).toISOString() })
    }
  }
}
