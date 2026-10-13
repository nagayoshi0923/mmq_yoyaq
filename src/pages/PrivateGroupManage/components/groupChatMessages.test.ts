import { describe, expect, it } from 'vitest'
import { castingLine, chunkChatEntries, surveyLine, closedHandoverRequestIds, formatChatDate, groupMessagesByDate, markDeletedCandidates, noticeLine, noticeLineResolver, parseSystemMessage } from './groupChatMessages'
import type { PrivateGroupMessage } from '@/types'
import type { SystemMessage } from './groupChatMessages'

const msg = (id: string, created_at: string) => ({ id, created_at, message: 'x' }) as unknown as PrivateGroupMessage

describe('チャットのメッセージの読み方', () => {
  it('システムメッセージは文字でも物でも読み、普通の文や壊れた文は null', () => {
    expect(parseSystemMessage('{"type":"system","action":"member_joined","memberName":"A"}')).toMatchObject({ action: 'member_joined', memberName: 'A' })
    expect(parseSystemMessage({ type: 'system', action: 'group_created' })).toMatchObject({ action: 'group_created' })
    expect(parseSystemMessage('こんにちは')).toBeNull()
    expect(parseSystemMessage('{壊れた')).toBeNull()
    expect(parseSystemMessage('{"type":"user"}')).toBeNull()
    expect(parseSystemMessage(null)).toBeNull()
  })

  it('同じ日のメッセージをまとめる', () => {
    const groups = groupMessagesByDate([msg('1', '2026-10-03T01:00:00Z'), msg('2', '2026-10-03T02:00:00Z'), msg('3', '2026-10-04T12:00:00Z')])
    expect(groups.map(g => g.messages.map(m => m.id))).toEqual([['1', '2'], ['3']])
    expect(groupMessagesByDate([])).toEqual([])
  })

  it('日付の見出しは今日・昨日・○月○日', () => {
    const today = new Date('2026-10-04T12:00:00')
    expect(formatChatDate('2026-10-04T09:00:00', today)).toBe('今日')
    expect(formatChatDate('2026-10-03T09:00:00', today)).toBe('昨日')
    expect(formatChatDate('2026-09-20T03:00:00Z', today)).toBe('9月20日')
  })
})

describe('主催者の引き継ぎ依頼の終わり', () => {
  it('結果（organizer_handover）の記録がある依頼だけを終わったとみなす', () => {
    const msg = (id: string, message: string) => ({ id, group_id: 'g', member_id: null, message, created_at: '2026-10-09T00:00:00Z' }) as never
    const ids = closedHandoverRequestIds([
      msg('1', JSON.stringify({ type: 'system', action: 'individual_notice', handover_request_id: 'h1' })),
      msg('2', JSON.stringify({ type: 'system', action: 'organizer_handover', result: 'declined', handover_request_id: 'h1' })),
      msg('3', JSON.stringify({ type: 'system', action: 'individual_notice', handover_request_id: 'h2' })),
      msg('4', 'こんにちは'),
    ])
    expect([...ids]).toEqual(['h1'])
  })
})

describe('自動のお知らせはすべて灰色の 1 行（チャットにカードを流さない）', () => {
  const current = [
    { id: 'c1', date: '2026-10-30', time_slot: '夜間', status: 'active', responses: [{ member_id: 'm1' }] },
    { id: 'c2', date: '2026-10-31', time_slot: '午後', status: 'active', responses: [] },
  ]
  const ctx = { getMemberName: (id: string | null) => (id === 'org' ? 'いちこ' : 'メンバー'), current, myMemberId: 'm1', answering: true }
  const text = (m: SystemMessage, author: string | null = null, c: Parameters<typeof noticeLine>[2] = ctx) => noticeLine(m, author, c)

  it('外された候補日に印を付ける', () => {
    expect(markDeletedCandidates([{ date: '2026-10-30', time_slot: '夜' }, { date: '2026-10-20', time_slot: '午後' }], current))
      .toEqual([{ date: '2026-10-30', time_slot: '夜', deleted: false }, { date: '2026-10-20', time_slot: '午後', deleted: true }])
  })
  it('候補日の追加: 1 行に「日程を見る」。自分が未回答なら未読に数える', () => {
    const msg = { type: 'system', action: 'candidate_dates_added', count: 1, dates: [{ date: '2026-10-31', time_slot: '午後' }] } as SystemMessage
    expect(text(msg, 'org')).toMatchObject({ text: 'いちこさんが候補日を 1 件追加', link: { label: '日程を見る', target: 'dates' }, notable: true })
    // 申込後はリンクを出さない
    expect(text(msg, 'org', { ...ctx, answering: false }).link).toBeUndefined()
  })
  it('候補日の追加: 回答済み・削除済みは削除の数を添える（すべて削除ならリンクなし）', () => {
    const msg = { type: 'system', action: 'candidate_dates_added', count: 2, dates: [{ date: '2026-10-30', time_slot: '夜' }, { date: '2026-10-20', time_slot: '午後' }] } as SystemMessage
    expect(text(msg, 'org').text).toBe('いちこさんが候補日を 2 件追加（うち 1 件は削除済み）')
    expect(text(msg, 'org').notable).toBeUndefined()
    const gone = { ...msg, dates: [{ date: '2026-10-20', time_slot: '午後' }], count: 1 }
    expect(text(gone, 'org')).toEqual({ kind: 'candidate_dates_added', text: 'いちこさんが候補日を 1 件追加（その後削除）' })
  })
  it('参加・外れた は リンクなしの 1 行', () => {
    expect(text({ type: 'system', action: 'member_removed', memberName: '三郎' })).toEqual({ kind: 'member_removed', text: '三郎さんが外れました' })
  })
  it('店舗の確定: 日付と時間の 1 行に「概要を見る」', () => {
    expect(text({ type: 'system', action: 'schedule_confirmed', confirmedDate: '2026-11-07', confirmedTimeSlot: '14:00〜17:00', title: '日程が確定いたしました', body: '長い文' }))
      .toMatchObject({ text: '店舗が日程を確定しました 11/7(土) 14:00〜17:00', link: { label: '概要を見る', target: 'overview' }, notable: true })
  })
  it('却下は理由を開いて読める・取消は概要へ', () => {
    expect(text({ type: 'system', action: 'booking_rejected', title: '日程リクエストが却下されました', rejectionReason: '満席' }))
      .toMatchObject({ text: '日程リクエストが却下されました', link: { label: '理由を見る', target: 'expand' }, detail: '満席' })
    expect(text({ type: 'system', action: 'booking_cancelled' }).link).toEqual({ label: '概要を見る', target: 'overview' })
  })
  it('事前配役アンケート: 期限を添えて「回答する」', () => {
    expect(text({ type: 'system', action: 'survey_notice', message: '【お願い】\n\n回答期限: 11/5まで\n\nよろしく' }))
      .toMatchObject({ text: '事前配役アンケートの回答をお願いします（11/5 まで）', link: { label: '回答する', target: 'survey' } })
  })
  it('店舗からのお知らせ・事前読み込みは「読む」で本文を開く', () => {
    expect(text({ type: 'system', action: 'staff_message', title: '駐車場', body: '近くにあります' })).toMatchObject({ text: '店舗からのお知らせ「駐車場」', link: { target: 'expand', label: '読む' } })
    expect(text({ type: 'system', action: 'pre_reading_notice', message: 'https://example.com を読んでください' }, null, { ...ctx, preReadingTitle: '事前読み込みのお願い' }))
      .toMatchObject({ text: '事前読み込みのお願い', detail: 'https://example.com を読んでください' })
  })
  it('引き継ぎの依頼は宛先本人だけに「確認する」。終わったらリンクなし', () => {
    const req = { type: 'system', action: 'individual_notice', target_member_id: 'm1', handover_request_id: 'h1', title: '主催者の引き継ぎのお願い', message: 'えいきちさんから「作品」の貸切の…' } as SystemMessage
    expect(text(req)).toMatchObject({ text: 'えいきちさんから主催者の引き継ぎの依頼', personal: true, link: { label: '確認する', target: 'handover', requestId: 'h1' } })
    expect(text(req, null, { ...ctx, myMemberId: 'm2' }).hidden).toBe(true)
    expect(text(req, null, { ...ctx, myMemberId: 'm2', userId: 'u1' }).hidden).toBe(true)
    expect(text({ ...req, target_user_id: 'u1' }, null, { ...ctx, myMemberId: 'm2', userId: 'u1' }).hidden).toBeUndefined()
    const closed = text(req, null, { ...ctx, closedHandoverIds: new Set(['h1']) })
    expect(closed.text).toBe('えいきちさんから主催者の引き継ぎの依頼（終わりました）')
    expect(closed.link).toBeUndefined()
  })
  it('次の貸切のお誘いは「参加する」（招待コードの形が正しいときだけ）', () => {
    const code = 'a'.repeat(32)
    expect(text({ type: 'system', action: 'next_group_created', inviteCode: code, scenarioTitle: '作品' }).link).toEqual({ label: '参加する', target: 'invite', inviteCode: code })
    expect(text({ type: 'system', action: 'next_group_created', inviteCode: 'x' }).link).toBeUndefined()
  })
  it('配役の確定は方法が選ばれているときだけ', () => {
    expect(text({ type: 'system', action: 'character_assignment', title: '配役確定', body: 'A: 一人目' }).hidden).toBe(true)
    expect(text({ type: 'system', action: 'character_assignment', title: '配役確定', body: 'A: 一人目' }, null, { ...ctx, charAssignmentMethod: 'self' }))
      .toMatchObject({ text: '配役が確定しました', link: { label: '概要', target: 'casting' } })
  })
  it('配役の状態の 1 行: 主催者は決め方、self で未選択の人は希望（どちらも全画面シートへ）', () => {
    const base = { isOrganizer: true, needsMethodChoice: true, method: null, hasCharacters: true, confirmed: false, myPreference: null, isMember: true }
    expect(castingLine(base)).toMatchObject({ text: '配役の決め方を選んでください', link: { label: '選ぶ', target: 'casting-method' } })
    expect(castingLine({ ...base, isOrganizer: false })).toBeNull()
    expect(castingLine({ ...base, method: 'self' })).toMatchObject({ text: 'やりたいキャラクターを選んでください', link: { label: '選ぶ', target: 'casting-pick' } })
    expect(castingLine({ ...base, method: 'self', myPreference: 'a' })).toBeNull()
    expect(castingLine({ ...base, method: 'self', confirmed: true })).toBeNull()
    expect(castingLine({ ...base, method: 'survey' })).toBeNull()
  })
  it('事前配役アンケートの 1 行: 方法=アンケート、または回答できて公演前', () => {
    const base = { canOpen: true, method: 'self', available: true, past: false, deadlineText: '11月5日まで' }
    expect(surveyLine(base)).toMatchObject({ text: '事前配役アンケートの回答をお願いします（11月5日まで）', link: { label: '回答する', target: 'survey' } })
    expect(surveyLine({ ...base, past: true })).toBeNull()
    expect(surveyLine({ ...base, method: 'survey', available: false, past: true, deadlineText: null })?.text).toBe('配役のため、事前配役アンケートの回答をお願いします')
    expect(surveyLine({ ...base, canOpen: false })).toBeNull()
  })
  it('未回答の人に知らせる: 自分が未回答なら「回答する」', () => {
    const msg = { type: 'system', action: 'date_answer_reminder', names: ['二郎', '三郎'] } as SystemMessage
    expect(text(msg, 'org')).toMatchObject({ text: '二郎さん、三郎さん 日程の回答をお願いします（いちこさんから）', link: { label: '回答する', target: 'dates' } })
    const answered = current.map(c => ({ ...c, responses: [{ member_id: 'm1' }] }))
    expect(text(msg, 'org', { ...ctx, current: answered }).link).toBeUndefined()
    // 事前配役アンケート・やりたいキャラクター（#1035）。名前が挙がった本人だけに入口
    const me = { ...ctx, getMemberName: (id: string | null) => (id === 'org' ? 'いちこ' : id === 'm1' ? '三郎' : 'メンバー') }
    expect(text({ type: 'system', action: 'date_answer_reminder', kind: 'survey', names: ['三郎'] }, 'org', me))
      .toMatchObject({ text: '三郎さん 事前配役アンケートの回答をお願いします（いちこさんから）', link: { label: '回答する', target: 'survey' } })
    expect(text({ type: 'system', action: 'date_answer_reminder', kind: 'casting', names: ['三郎'] }, 'org', me))
      .toMatchObject({ text: '三郎さん やりたいキャラクターを選んでください（いちこさんから）', link: { label: '選ぶ', target: 'casting-pick' } })
    expect(text({ type: 'system', action: 'date_answer_reminder', kind: 'casting', names: ['二郎'] }, 'org', me).link).toBeUndefined()
  })
  it('続けて並ぶリンクなしの 1 行はまとめ、リンク付きは同じ種類が短時間に続いたときだけまとめる', () => {
    const at = (min: number) => new Date(Date.UTC(2026, 9, 10, 0, min)).toISOString()
    const m = (id: string, message: string, min = 0) => ({ id, group_id: 'g', member_id: null, message, created_at: at(min) }) as never
    const plain = (t: string) => ({ kind: 'member_joined', text: t })
    const linked = (t: string) => ({ kind: 'candidate_dates_added', text: t, link: { label: '日程を見る', target: 'dates' as const } })
    const lineOf = (msg: { message: string }) => (msg.message === 'c' ? null : msg.message.startsWith('L') ? linked(msg.message) : msg.message === 'h' ? { kind: 'individual_notice', text: '', hidden: true } : plain(msg.message))
    const entries = chunkChatEntries([m('1', 'a'), m('2', 'b'), m('3', 'c'), m('4', 'd'), m('5', 'h'), m('6', 'L1', 1), m('7', 'L2', 5), m('8', 'L3', 30)], lineOf as never)
    expect(entries.map(e => (e.kind === 'line' ? e.lines.map(l => l.text).join('+') : 'msg'))).toEqual(['a+b', 'msg', 'd', 'L1+L2', 'L3'])
  })
  it('削除した発言は「メッセージを削除しました」の 1 行（段階 2）', () => {
    const lineOf = noticeLineResolver({ getMemberName: () => 'x', current: null, status: 'gathering', myMemberId: 'me' })
    const deleted = { id: '1', group_id: 'g', member_id: 'a', message: '', created_at: '2026-10-10T00:00:00Z', deleted_at: '2026-10-10T01:00:00Z' } as PrivateGroupMessage
    expect(lineOf(deleted)?.text).toBe('メッセージを削除しました')
    expect(lineOf({ ...deleted, deleted_at: null, message: 'やあ' })).toBeNull()
  })
})
