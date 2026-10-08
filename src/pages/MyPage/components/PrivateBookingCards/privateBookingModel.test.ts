import { describe, expect, it } from 'vitest'
import type { PrivateGroup, Reservation } from '@/types'
import { buildPrivateBookingView, countActivePrivateBookings, decideGroupAction, isPrivateReservation } from './privateBookingModel'
import { summarizePrivateGroup, type PrivateGroupSummary } from './privateGroupSummary'

const TODAY = '2026-10-09'

function group(overrides: Partial<PrivateGroupSummary> = {}): PrivateGroupSummary {
  return {
    id: 'g1', name: null, invite_code: 'CODE1', status: 'gathering', scenario_title: '作品A', scenario_image: null,
    scenario_player_count_max: 6, member_count: 3, is_organizer: true, created_at: '2026-10-01T00:00:00Z', reservation_id: null,
    organizer_name: 'いちこ', my_member_id: 'm1', candidate_dates_count: 0, my_unanswered_count: 0, all_members_responded: false,
    schedule: null, ...overrides,
  }
}

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 'r1', title: '作品B', status: 'confirmed', reservation_source: 'web', requested_datetime: '2026-10-20T13:00:00+09:00',
    created_at: '2026-10-01T00:00:00Z', participant_count: 4, schedule_event_id: null, private_group_id: null, ...overrides,
  } as Reservation
}

const decide = (g: PrivateGroupSummary, surveyPending = false) => decideGroupAction(g, { todayYmd: TODAY, surveyPending })

describe('次にやること（ラベルの優先順）', () => {
  it('主催者・候補日 0 件は「候補日を決める」', () => {
    expect(decide(group()).action).toBe('pick_dates')
  })
  it('主催者・候補日ありは全員回答前でも「申込に進む」', () => {
    expect(decide(group({ candidate_dates_count: 2 })).action).toBe('proceed_booking')
    expect(decide(group({ candidate_dates_count: 2, all_members_responded: true })).progress.current).toBe(3)
  })
  it('メンバーで未回答があれば「日程に回答する」、回答済みなら「主催者の準備待ち」', () => {
    expect(decide(group({ is_organizer: false, candidate_dates_count: 2, my_unanswered_count: 1 })).action).toBe('answer_dates')
    expect(decide(group({ is_organizer: false, candidate_dates_count: 2, my_unanswered_count: 0 })).action).toBe('waiting_organizer')
    expect(decide(group({ is_organizer: false })).action).toBe('waiting_organizer')
  })
  it('申込済みは「店舗の返事待ち」', () => {
    expect(decide(group({ status: 'booking_requested', candidate_dates_count: 2 })).action).toBe('waiting_store')
  })
  it('確定・未来はアンケート未回答なら「アンケートに回答する」、なければ開催日', () => {
    const confirmed = group({ status: 'confirmed', schedule: { date: '2026-10-25', start_time: '13:00', store_name: '本店' } })
    expect(decide(confirmed, true).action).toBe('answer_survey')
    expect(decide(confirmed).action).toBe('upcoming')
  })
  it('確定・公演日を過ぎたら「終了」（アンケート未回答でも）', () => {
    const past = group({ status: 'confirmed', schedule: { date: '2026-10-01', start_time: '13:00', store_name: '本店' } })
    expect(decide(past, true).action).toBe('ended')
  })
  it('引き継ぎの同意待ちは最優先（段階 3 用）', () => {
    expect(decideGroupAction(group({ candidate_dates_count: 0 }), { todayYmd: TODAY, surveyPending: true, transferPending: true }).action).toBe('accept_transfer')
  })
})

describe('貸切の判定', () => {
  it('web_private・private_group_id・貸切公演は貸切', () => {
    expect(isPrivateReservation(reservation({ reservation_source: 'web_private' }), {})).toBe(true)
    expect(isPrivateReservation(reservation({ private_group_id: 'g1' }), {})).toBe(true)
    expect(isPrivateReservation(reservation({ schedule_event_id: 'e1' }), { e1: { date: TODAY, start_time: '13:00', category: 'private' } })).toBe(true)
    expect(isPrivateReservation(reservation({ schedule_event_id: 'e1' }), { e1: { date: TODAY, start_time: '13:00', category: 'open', is_private_booking: true } })).toBe(true)
    expect(isPrivateReservation(reservation({ schedule_event_id: 'e1' }), { e1: { date: TODAY, start_time: '13:00', category: 'open' } })).toBe(false)
  })
})

describe('1 貸切 = 1 カード', () => {
  it('グループと予約を結合して 1 枚にし、節に振り分ける', () => {
    const view = buildPrivateBookingView({
      groups: [
        group({ id: 'gather' }),
        group({ id: 'requested', status: 'booking_requested', reservation_id: 'r-req', candidate_dates_count: 2 }),
        group({ id: 'confirmed', status: 'confirmed', reservation_id: null, schedule: { date: '2026-10-25', start_time: '13:00', store_name: '二号店' } }),
      ],
      reservations: [
        reservation({ id: 'r-req', status: 'pending', reservation_source: 'web_private' }),
        reservation({ id: 'r-conf', status: 'confirmed', reservation_source: 'web_private', private_group_id: 'confirmed' }),
        reservation({ id: 'r-open', status: 'confirmed' }),
      ],
      scheduleEvents: {}, scenarioImages: {}, surveyPending: {}, todayYmd: TODAY,
    })
    expect(view.bySection.action.map(i => i.groupId)).toEqual(['gather'])
    expect(view.bySection.waiting_store.map(i => i.key)).toEqual(['group:requested'])
    expect(view.bySection.waiting_store[0].description).toBe('候補日 2 件で申込中。店舗が日程を確定すると連絡が届きます')
    expect(view.bySection.confirmed.map(i => i.key)).toEqual(['group:confirmed'])
    expect(view.bySection.confirmed[0].label).toBe('10/25(日) 開催')
    expect(countActivePrivateBookings(view)).toBe(3)
  })

  it('グループの無い旧い貸切予約は予約だけで 1 枚（予約詳細へ）', () => {
    const view = buildPrivateBookingView({
      groups: [],
      reservations: [reservation({ id: 'legacy', status: 'pending', reservation_source: 'web_private', candidate_datetimes: { candidates: [{}, {}, {}] } } as Partial<Reservation>)],
      scheduleEvents: {}, scenarioImages: {}, surveyPending: {}, todayYmd: TODAY,
    })
    expect(view.bySection.waiting_store).toHaveLength(1)
    expect(view.bySection.waiting_store[0].href).toBe('/mypage/reservation/legacy')
    expect(view.bySection.waiting_store[0].description).toContain('候補日 3 件で申込中')
  })

  it('確定は日付の近い順、取り下げ・キャンセルは件数だけ数える', () => {
    const view = buildPrivateBookingView({
      groups: [
        group({ id: 'late', status: 'confirmed', schedule: { date: '2026-11-30', start_time: null, store_name: null } }),
        group({ id: 'soon', status: 'confirmed', schedule: { date: '2026-10-12', start_time: null, store_name: null } }),
      ],
      reservations: [reservation({ id: 'w', status: 'cancelled', reservation_source: 'web_private' })],
      scheduleEvents: {}, scenarioImages: {}, surveyPending: { late: true }, todayYmd: TODAY,
    })
    expect(view.bySection.confirmed.map(i => i.groupId)).toEqual(['soon'])
    expect(view.bySection.action.map(i => i.groupId)).toEqual(['late'])
    expect(view.bySection.action[0].primary?.href).toBe('/group/invite/CODE1?tab=survey')
    expect(view.cancelledCount).toBe(1)
  })
})

describe('グループの要約', () => {
  it('自分の未回答数・全員回答・主催者名を数える（却下した候補日は除く）', () => {
    const g = {
      id: 'g', name: null, invite_code: 'C', status: 'date_adjusting', reservation_id: null, created_at: '2026-10-01',
      scenario_masters: { id: 's', title: '作品', key_visual_url: null, player_count_max: 6 },
      members: [
        { id: 'org', user_id: 'u-org', guest_name: 'いちこ', is_organizer: true, status: 'joined', date_responses: [{ candidate_date_id: 'd1' }, { candidate_date_id: 'd2' }] },
        { id: 'me', user_id: 'u-me', guest_name: 'ニックネーム未設定', is_organizer: false, status: 'joined', date_responses: [{ candidate_date_id: 'd1' }] },
        { id: 'left', user_id: 'u-left', guest_name: 'x', is_organizer: false, status: 'declined', date_responses: [] },
      ],
      candidate_dates: [{ id: 'd1', status: 'active' }, { id: 'd2', status: 'active' }, { id: 'd3', status: 'rejected' }],
    } as unknown as PrivateGroup
    const me = summarizePrivateGroup(g, 'u-me', undefined, {})
    expect(me).toMatchObject({ is_organizer: false, my_member_id: 'me', candidate_dates_count: 2, my_unanswered_count: 1, all_members_responded: false, organizer_name: 'いちこ', member_count: 2 })
    const organizer = summarizePrivateGroup({ ...g, members: g.members!.map(m => m.id === 'me' ? { ...m, date_responses: [...m.date_responses!, { candidate_date_id: 'd2' }] } : m) } as PrivateGroup, 'u-org', undefined, {})
    expect(organizer).toMatchObject({ is_organizer: true, all_members_responded: true, my_unanswered_count: 0 })
  })

  it('確定済みは確定公演、無ければ予約の日時を使う', () => {
    const base = { id: 'g', status: 'confirmed', members: [], candidate_dates: [] } as unknown as PrivateGroup
    expect(summarizePrivateGroup({ ...base, confirmed_performance: { id: 'e', date: '2026-10-25', start_time: '13:00:00', end_time: '16:00:00', store_name: '二号店' } }, 'u', undefined, {}).schedule)
      .toEqual({ date: '2026-10-25', start_time: '13:00', store_name: '二号店' })
    expect(summarizePrivateGroup(base, 'u', { requested_datetime: '2026-10-26T18:00:00+09:00', store_id: 's1', store_name: null }, { s1: '本店' }).schedule)
      .toEqual({ date: '2026-10-26', start_time: '18:00', store_name: '本店' })
  })
})
