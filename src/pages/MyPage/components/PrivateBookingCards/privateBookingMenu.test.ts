import { describe, expect, it } from 'vitest'
import {
  buildInquiryMessage,
  buildPrivateBookingMenu,
  privateBookingConfirmText,
  privateBookingPhase,
  removeMemberConfirmText,
  type PrivateBookingMenuContext,
} from './privateBookingMenu'
import { toMemberRows } from './privateGroupSummary'
import type { PrivateGroup } from '@/types'

const base: PrivateBookingMenuContext = {
  isOrganizer: true, phase: 'pre_request', hasGroup: true, hasReservation: false, hasSurvey: false, hasUnansweredDates: false,
}
const ids = (ctx: Partial<PrivateBookingMenuContext>) => buildPrivateBookingMenu({ ...base, ...ctx }).map(i => i.id)

describe('操作メニューの出し分け', () => {
  it('主催者・申込前: 招待／候補日／希望店舗／メンバー／問い合わせ／グループを閉じる', () => {
    expect(ids({})).toEqual(['copy_invite', 'edit_dates', 'edit_store', 'manage_members', 'contact_store', 'close_group'])
  })
  it('主催者・店舗の返事待ち: 候補日・希望店舗は出さず、赤は「申込を取り下げる」', () => {
    expect(ids({ phase: 'requested', hasReservation: true })).toEqual(['copy_invite', 'manage_members', 'contact_store', 'withdraw'])
  })
  it('主催者・確定後: アンケートがあれば「アンケートを見る」、赤は「キャンセル」', () => {
    expect(ids({ phase: 'confirmed', hasReservation: true, hasSurvey: true }))
      .toEqual(['copy_invite', 'manage_members', 'view_survey', 'contact_store', 'cancel'])
    expect(ids({ phase: 'confirmed', hasReservation: true })).not.toContain('view_survey')
  })
  it('メンバー: 招待／日程に回答（未回答があるとき）／問い合わせ／グループから抜ける', () => {
    expect(ids({ isOrganizer: false, hasUnansweredDates: true })).toEqual(['copy_invite', 'answer_dates', 'contact_store', 'leave'])
    expect(ids({ isOrganizer: false })).toEqual(['copy_invite', 'contact_store', 'leave'])
    expect(ids({ isOrganizer: false, phase: 'confirmed', hasSurvey: true })).toEqual(['copy_invite', 'view_survey', 'contact_store', 'leave'])
  })
  it('メンバーには管理・閉じる・取り下げ・キャンセルを出さない', () => {
    for (const phase of ['pre_request', 'requested', 'confirmed'] as const) {
      const got = ids({ isOrganizer: false, phase, hasReservation: true })
      expect(got).not.toContain('manage_members')
      expect(got).not.toContain('close_group')
      expect(got).not.toContain('withdraw')
      expect(got).not.toContain('cancel')
    }
  })
  it('「主催者にする」は段階 3 なので出さない', () => {
    const all = [
      ...ids({}), ...ids({ phase: 'requested', hasReservation: true }), ...ids({ phase: 'confirmed', hasReservation: true }), ...ids({ isOrganizer: false }),
    ]
    expect(all.some(id => (id as string).includes('transfer'))).toBe(false)
  })
  it('赤い操作はどの組み合わせでも最後に 1 つだけ', () => {
    for (const isOrganizer of [true, false]) {
      for (const phase of ['pre_request', 'requested', 'confirmed'] as const) {
        const menu = buildPrivateBookingMenu({ ...base, isOrganizer, phase, hasReservation: true })
        const dangers = menu.filter(i => i.danger)
        expect(dangers).toHaveLength(1)
        expect(menu[menu.length - 1].danger).toBe(true)
      }
    }
  })
  it('グループの無い旧い貸切予約は問い合わせと取り下げ・キャンセルだけ', () => {
    expect(ids({ hasGroup: false, phase: 'requested', hasReservation: true })).toEqual(['contact_store', 'withdraw'])
    expect(ids({ hasGroup: false, phase: 'confirmed', hasReservation: true })).toEqual(['contact_store', 'cancel'])
  })
})

describe('段階の判定', () => {
  it('グループの状態を優先し、予約の状態で更新遅れを補う', () => {
    expect(privateBookingPhase('gathering')).toBe('pre_request')
    expect(privateBookingPhase('date_adjusting', 'cancelled')).toBe('pre_request')
    expect(privateBookingPhase('booking_requested')).toBe('requested')
    expect(privateBookingPhase('gathering', 'pending')).toBe('requested')
    expect(privateBookingPhase('booking_requested', 'confirmed')).toBe('confirmed')
    expect(privateBookingPhase(null, 'checked_in')).toBe('confirmed')
  })
})

describe('確認文は影響を数字で見せる', () => {
  it('グループを閉じる', () => {
    const t = privateBookingConfirmText('close_group', { otherMembers: 3, candidateDates: 2 })
    expect(t.title).toBe('グループを閉じますか？')
    expect(t.message).toContain('メンバー 3 名に知らせます')
    expect(t.message).toContain('候補日 2 件')
  })
  it('申込を取り下げる', () => {
    const t = privateBookingConfirmText('withdraw', { otherMembers: 2, candidateDates: 2 })
    expect(t.message).toContain('店舗への申込を取り消し、グループも閉じます。メンバー 2 名に知らせます')
  })
  it('キャンセル（確定日を出す）', () => {
    const t = privateBookingConfirmText('cancel', { otherMembers: 1, candidateDates: 0, confirmedDate: '2026-10-25' })
    expect(t.message).toContain('10/25')
    expect(t.message).toContain('メンバー 1 名に知らせます')
  })
  it('ほかのメンバーがいないときはそう書く', () => {
    expect(privateBookingConfirmText('close_group', { otherMembers: 0, candidateDates: 0 }).message).toContain('ほかのメンバーはいません')
  })
  it('メンバーを外す: 申込前と申込済み以降で店舗への伝達の一文が変わる', () => {
    expect(removeMemberConfirmText('二郎', 'pre_request').message)
      .toBe('二郎さんをグループから外しますか？ この方の日程回答は消えます。本人にはチャットで知らせます。')
    expect(removeMemberConfirmText('二郎', 'requested').message).toContain('店舗に人数変更として伝わります')
    expect(removeMemberConfirmText('二郎', 'confirmed').message).toContain('店舗に人数変更として伝わります')
  })
  it('グループから抜ける: 申込済み以降は店舗に人数変更として伝わる', () => {
    expect(privateBookingConfirmText('leave', { otherMembers: 2, candidateDates: 0, phase: 'pre_request' }).message)
      .toBe('あなたの日程の回答は消え、このグループのチャットや日程は見られなくなります。参加メンバーは 3 名から 2 名になります。')
    expect(privateBookingConfirmText('leave', { otherMembers: 2, candidateDates: 0, phase: 'requested' }).message).toContain('店舗に人数変更として伝わります')
    expect(privateBookingConfirmText('leave', { otherMembers: 1, candidateDates: 0, phase: 'confirmed' }).message).toContain('店舗に人数変更として伝わります')
  })
})

describe('問い合わせの本文', () => {
  it('予約番号・作品名・状態・招待コードを先頭に入れる', () => {
    const msg = buildInquiryMessage({ organizationId: 'o', reservationNumber: 'PB-1', title: '作品A', statusLabel: '申込済み・店舗の返事待ち', inviteCode: 'CODE' })
    expect(msg.split('\n').slice(0, 5)).toEqual(['【予約情報】', '予約番号: PB-1', '作品: 作品A', '状態: 申込済み・店舗の返事待ち', '招待コード: CODE'])
    expect(msg).toContain('【お問い合わせ内容】')
  })
  it('申込前は予約番号の行を出さない', () => {
    expect(buildInquiryMessage({ organizationId: 'o', reservationNumber: null, title: '作品A', statusLabel: 'x', inviteCode: 'C' })).not.toContain('予約番号')
  })
})

describe('メンバー管理シートの行', () => {
  it('立場（主催者／会員／ゲスト）と回答状況を出す。退出済みは出さない', () => {
    const group = {
      candidate_dates: [
        { id: 'd1', status: 'pending', responses: [{ member_id: 'm1' }, { member_id: 'm2' }] },
        { id: 'd2', status: 'pending', responses: [{ member_id: 'm1' }] },
        { id: 'd3', status: 'rejected', responses: [] },
      ],
      members: [
        { id: 'm1', user_id: 'u1', guest_name: 'いちこ', is_organizer: true, status: 'joined', joined_at: '2026-10-01T00:00:00Z', created_at: '' },
        { id: 'm2', user_id: 'u2', guest_name: 'ニックネーム未設定', is_organizer: false, status: 'joined', joined_at: null, created_at: '2026-10-02T00:00:00Z' },
        { id: 'm3', user_id: null, guest_name: 'ゲスト三郎', is_organizer: false, status: 'joined', joined_at: null, created_at: '2026-10-03T00:00:00Z' },
        { id: 'm4', user_id: 'u4', guest_name: '抜けた人', is_organizer: false, status: 'left', joined_at: null, created_at: '' },
      ],
    } as unknown as PrivateGroup
    const rows = toMemberRows(group)
    expect(rows.map(r => [r.name, r.role, r.answered, r.total])).toEqual([
      ['いちこ', 'organizer', 2, 2],
      ['メンバー', 'member', 1, 2],
      ['ゲスト三郎', 'guest', 0, 2],
    ])
    expect(rows[1].joined_at).toBe('2026-10-02T00:00:00Z')
  })
})
