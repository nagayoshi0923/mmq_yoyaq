import { describe, expect, it } from 'vitest'
import type { PrivateGroup } from '@/types'
import { buildAnswerTable, buildGroupStatus, countUnread, defaultGroupTab, groupTabsFor, isPerformanceEnded, nextResponse, parseGroupTab, performanceLabel, resolveGroupTab, rowTally, unansweredMembers, type GroupStatusInput } from './groupPageModel'

const member = (id: string, extra: Record<string, unknown> = {}) => ({ id, group_id: 'g', user_id: `u-${id}`, guest_name: null, guest_email: null, guest_phone: null, is_organizer: false, status: 'joined', joined_at: null, created_at: '2026-10-01', users: { id: `u-${id}`, email: `${id}@x`, nickname: id }, ...extra })
const cand = (id: string, date: string, start: string, responses: Array<[string, 'ok' | 'maybe' | 'ng']>, extra: Record<string, unknown> = {}) => ({
  id, group_id: 'g', date, time_slot: '午後', start_time: start, end_time: '16:00', order_num: 1, created_at: '', ...extra,
  responses: responses.map(([m, r]) => ({ id: `${id}-${m}`, group_id: 'g', member_id: m, candidate_date_id: id, response: r, created_at: '', updated_at: '' })),
})

const group = {
  members: [member('org', { is_organizer: true }), member('jiro'), member('sabu', { user_id: null, guest_name: 'サブ', users: null })],
  candidate_dates: [
    cand('c2', '2026-10-30', '13:00', [['org', 'ok'], ['jiro', 'ok'], ['sabu', 'maybe']]),
    cand('c1', '2026-10-29', '18:00', [['org', 'maybe'], ['jiro', 'ng']]),
    cand('c3', '2026-10-23', '13:00', [['org', 'ok']]),
  ],
} as unknown as PrivateGroup

describe('タブ', () => {
  it('旧い値も受ける', () => {
    expect(parseGroupTab('schedule')).toBe('dates')
    expect(parseGroupTab('manage')).toBe('members')
    expect(parseGroupTab('survey')).toBe('survey')
    expect(parseGroupTab('xxx')).toBeNull()
    expect(parseGroupTab(null)).toBeNull()
  })
  it('初期タブは確定後だけ概要、それ以外は日程', () => {
    expect(defaultGroupTab('confirmed')).toBe('overview')
    expect(defaultGroupTab('requested')).toBe('dates')
    expect(defaultGroupTab('pre_request')).toBe('dates')
  })
})

describe('回答表', () => {
  const table = buildAnswerTable(group, 'jiro')
  it('自分の列が先頭、行は日付順、未回答は null', () => {
    expect(table.columns.map(c => c.memberId)).toEqual(['jiro', 'org', 'sabu'])
    expect(table.columns[0].isMe).toBe(true)
    expect(table.columns[2].role).toBe('guest')
    expect(table.rows.map(r => r.id)).toEqual(['c3', 'c1', 'c2'])
    expect(table.rows[0].cells.jiro).toBeNull()
  })
  it('最も集まっている行（○2点・△1点）', () => {
    expect(table.bestRowId).toBe('c2')
    expect(rowTally(table.rows[2])).toBe('○2・△1')
  })
  it('全候補日に答えた人だけ回答済み', () => {
    expect(table.respondedCount).toBe(1)
    expect(unansweredMembers(table).map(c => c.memberId)).toEqual(['sabu'])
  })
  it('却下された行は最有力にしない', () => {
    const g = { ...group, candidate_dates: [cand('r', '2026-10-01', '13:00', [['org', 'ok'], ['jiro', 'ok']], { status: 'rejected' }), cand('a', '2026-10-02', '13:00', [['org', 'maybe']])] } as unknown as PrivateGroup
    expect(buildAnswerTable(g, 'org').bestRowId).toBe('a')
  })
  it('回答が 1 つも無ければ最有力なし', () => {
    const g = { ...group, candidate_dates: [cand('a', '2026-10-02', '13:00', [])] } as unknown as PrivateGroup
    expect(buildAnswerTable(g, 'org').bestRowId).toBeNull()
  })
  it('自分のセルは ○→△→×→○', () => {
    expect(nextResponse(null)).toBe('ok')
    expect(nextResponse('ok')).toBe('maybe')
    expect(nextResponse('maybe')).toBe('ng')
    expect(nextResponse('ng')).toBe('ok')
  })
})

describe('いまの状態の箱（マイページのカードと同じラベル）', () => {
  const base = (over: Partial<GroupStatusInput> = {}): GroupStatusInput => ({
    status: 'gathering', phase: 'pre_request', isOrganizer: true, organizerName: null, memberCount: 3,
    table: buildAnswerTable(group, 'org'), myMemberId: 'org', confirmed: null, requestedAt: null, surveyPending: false,
    handover: null, canMutateSchedule: true, todayYmd: '2026-10-10', ...over,
  })
  it('主催者・候補日あり: 最有力の日で申し込む', () => {
    const v = buildGroupStatus(base())
    expect(v.chip).toBe('申込に進む')
    expect(v.sub).toBe('3人中 1人が回答済み')
    expect(v.body).toBe('候補日 3 件のうち 10/30(金) 午後 が最も集まっています（○2・△1）。')
    expect(v.primary).toEqual({ kind: 'book', label: '10/30(金) 午後 で店舗に申し込む', candidateId: 'c2' })
    expect(v.secondary.map(s => s.label)).toEqual(['候補日を編集', '招待リンクを送る'])
  })
  it('主催者・候補日なし: 候補日を追加', () => {
    const v = buildGroupStatus(base({ table: buildAnswerTable({ ...group, candidate_dates: [] } as unknown as PrivateGroup, 'org') }))
    expect(v.chip).toBe('候補日を決める')
    expect(v.primary?.label).toBe('候補日を追加')
  })
  it('メンバー・未回答あり: 日程に回答する', () => {
    const v = buildGroupStatus(base({ isOrganizer: false, organizerName: 'いちこ', table: buildAnswerTable(group, 'sabu'), myMemberId: 'sabu' }))
    expect(v.chip).toBe('日程に回答する')
    expect(v.primary).toEqual({ kind: 'answer', label: '日程に回答する' })
  })
  it('店舗の返事待ち: 申込日と申込内容を見る', () => {
    const v = buildGroupStatus(base({ status: 'booking_requested', phase: 'requested', requestedAt: '2026-10-09T03:00:00Z', canMutateSchedule: false }))
    expect(v.chip).toBe('店舗の返事待ち')
    expect(v.tone).toBe('amber')
    expect(v.sub).toBe('10/9 申込')
    expect(v.primary).toBeNull()
    expect(v.secondary[0].kind).toBe('view_booking')
  })
  it('確定・アンケート未回答', () => {
    const v = buildGroupStatus(base({ status: 'confirmed', phase: 'confirmed', confirmed: { date: '2026-11-07', start_time: '14:00:00', store_name: '高田馬場店' }, surveyPending: true, canMutateSchedule: false }))
    expect(v.chip).toBe('アンケートに回答する')
    expect(v.tone).toBe('green')
    expect(v.primary?.kind).toBe('survey')
  })
  it('公演後は灰色・本文のみ', () => {
    const v = buildGroupStatus(base({ status: 'confirmed', phase: 'confirmed', confirmed: { date: '2026-10-01', start_time: '14:00', store_name: null }, canMutateSchedule: false }))
    expect(v.chip).toBe('終了')
    expect(v.tone).toBe('gray')
    expect(v.primary).toBeNull()
    expect(v.secondary).toEqual([])
  })
  it('公演後（終了時刻を過ぎた・段階 4）は緑の「開催しました」と写真の共有', () => {
    const performance = { date: '2026-11-07', start_time: '14:00:00', store_name: '高田馬場店' }
    const v = buildGroupStatus(base({ status: 'confirmed', phase: 'confirmed', confirmed: performance, performance, canMutateSchedule: false, ended: true, canStartNext: true, todayYmd: '2026-11-07' }))
    expect(v.chip).toBe('開催しました')
    expect(v.tone).toBe('green')
    expect(v.sub).toBe('11/7(土) 14:00 高田馬場店')
    expect(v.body).toBe('ご参加ありがとうございました。記念写真をここに残すと、メンバー全員のアルバムにも入ります。')
    expect(v.primary).toEqual({ kind: 'share_photos', label: '写真を共有する' })
    expect(v.secondary.map(s => s.label)).toEqual(['感想を書く', '同じメンバーで次の貸切'])
  })
  it('公演後のゲストには「同じメンバーで次の貸切」を出さない', () => {
    const v = buildGroupStatus(base({ status: 'confirmed', phase: 'confirmed', confirmed: { date: '2026-11-07', start_time: '14:00', store_name: null }, canMutateSchedule: false, ended: true, canStartNext: false }))
    expect(v.secondary.map(s => s.kind)).toEqual(['feedback'])
  })
})

describe('公演後（段階 4）', () => {
  const perf = { date: '2026-11-07', start_time: '14:00:00', end_time: '17:00:00' }
  it('終了時刻（日本時間）を過ぎたら公演後', () => {
    expect(isPerformanceEnded(perf, 'confirmed', new Date('2026-11-07T07:59:00Z'))).toBe(false)
    expect(isPerformanceEnded(perf, 'confirmed', new Date('2026-11-07T08:00:00Z'))).toBe(true)
  })
  it('終了時刻が無ければ開始時刻、完了扱いならすぐ公演後', () => {
    expect(isPerformanceEnded({ date: '2026-11-07', start_time: '14:00' }, 'confirmed', new Date('2026-11-07T05:00:00Z'))).toBe(true)
    expect(isPerformanceEnded(perf, 'completed', new Date('2026-11-01T00:00:00Z'))).toBe(true)
    expect(isPerformanceEnded(null, 'completed', new Date())).toBe(false)
  })
  it('タブは 思い出／メンバー／チャット、初期は思い出', () => {
    expect(groupTabsFor(true).map(t => t.label)).toEqual(['思い出', 'メンバー', 'チャット'])
    expect(groupTabsFor(false).map(t => t.id)).toEqual(['overview', 'dates', 'members', 'chat'])
    expect(defaultGroupTab('confirmed', true)).toBe('memories')
    expect(parseGroupTab('memories')).toBe('memories')
  })
  it('公演後は概要・日程を思い出に、公演前は思い出を初期タブに読み替える', () => {
    expect(resolveGroupTab('dates', 'confirmed', true)).toBe('memories')
    expect(resolveGroupTab('overview', 'confirmed', true)).toBe('memories')
    expect(resolveGroupTab('chat', 'confirmed', true)).toBe('chat')
    expect(resolveGroupTab(null, 'confirmed', true)).toBe('memories')
    expect(resolveGroupTab('memories', 'confirmed', false)).toBe('overview')
    expect(resolveGroupTab('memories', 'pre_request', false)).toBe('dates')
  })
  it('開催の表示', () => {
    expect(performanceLabel({ date: '2026-11-07', start_time: '14:00:00', store_name: '高田馬場店' })).toBe('11/7(土) 14:00 高田馬場店')
    expect(performanceLabel({ date: '2026-11-07', start_time: null, store_name: null })).toBe('11/7(土)')
  })
})

describe('未読', () => {
  const msgs = [
    { created_at: '2026-10-10T01:00:00Z', member_id: 'a' },
    { created_at: '2026-10-10T02:00:00Z', member_id: 'me' },
    { created_at: '2026-10-10T03:00:00Z', member_id: 'b' },
  ]
  it('見た時刻より新しい、自分以外の数', () => {
    expect(countUnread(msgs, 'me', '2026-10-10T00:30:00Z')).toBe(2)
    expect(countUnread(msgs, 'me', '2026-10-10T02:30:00Z')).toBe(1)
  })
  it('見た記録が無ければ 0', () => {
    expect(countUnread(msgs, 'me', null)).toBe(0)
  })
  it('灰色の 1 行のお知らせは数えない', () => {
    const withLine = [...msgs, { created_at: '2026-10-10T04:00:00Z', member_id: null, line: true }, { created_at: '2026-10-10T05:00:00Z', member_id: null, line: false }]
    expect(countUnread(withLine, 'me', '2026-10-10T02:30:00Z', m => Boolean((m as { line?: boolean }).line))).toBe(2)
  })
})
