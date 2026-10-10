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
    schedule: null, organization_id: 'org1', survey_enabled: false, members: [], handover: null, ...overrides,
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

describe('主催者の引き継ぎ（段階 3）', () => {
  const handover = { id: 'h1', fromName: 'いちこ', toName: '二郎', toMemberId: 'm2', expiresAt: '2026-10-12T12:00:00Z' }
  const build = (g: PrivateGroupSummary) =>
    buildPrivateBookingView({ groups: [g], reservations: [], scheduleEvents: {}, scenarioImages: {}, surveyPending: {}, todayYmd: TODAY })
  it('宛先のカードは「あなたの対応が必要」に上がり、確認画面へ進む', () => {
    const view = build(group({ is_organizer: false, status: 'confirmed', schedule: { date: '2026-10-25', start_time: '13:00', store_name: '本店' }, handover: { ...handover, isRecipient: true } }))
    const item = view.bySection.action[0]
    expect(item.label).toBe('主催者の引き継ぎに同意する')
    expect(item.primary).toEqual({ label: '内容を確認して同意する', href: '/group/invite/CODE1?sheet=handover' })
    expect(item.description).toContain('いちこさんからの依頼です')
    expect(item.description).toContain('申込者（店舗への連絡先・キャンセル料の負担者）')
    expect(item.description).toContain('10/12(月) 21:00')
  })
  it('依頼した主催者のカードは節はそのままで「○○さんの同意待ち」', () => {
    const view = build(group({ status: 'booking_requested', candidate_dates_count: 2, handover: { ...handover, isRecipient: false } }))
    const item = view.bySection.waiting_store[0]
    expect(item.label).toBe('二郎さんの同意待ち（主催者の引き継ぎ）')
    expect(item.description).toContain('同意されるまであなたが主催者です')
    expect(item.menu.handover?.id).toBe('h1')
  })
})

describe('グループの要約', () => {
  it('主催者かどうかはグループの organizer_id で決める（引き継ぎ後に切り替わる）', () => {
    const g = {
      id: 'g', name: null, invite_code: 'C', status: 'confirmed', reservation_id: null, created_at: '2026-10-01', organizer_id: 'u-new',
      members: [
        { id: 'old', user_id: 'u-old', guest_name: 'いちこ', is_organizer: false, status: 'joined', date_responses: [] },
        { id: 'new', user_id: 'u-new', guest_name: '二郎', is_organizer: true, status: 'joined', date_responses: [] },
      ],
      candidate_dates: [],
    } as unknown as PrivateGroup
    expect(summarizePrivateGroup(g, 'u-new', undefined, {})).toMatchObject({ is_organizer: true, organizer_name: '二郎' })
    expect(summarizePrivateGroup(g, 'u-old', undefined, {})).toMatchObject({ is_organizer: false, organizer_name: '二郎' })
  })

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
      .toEqual({ date: '2026-10-25', start_time: '13:00', store_name: '二号店', end_time: '16:00', store_id: null })
    expect(summarizePrivateGroup(base, 'u', { requested_datetime: '2026-10-26T18:00:00+09:00', store_id: 's1', store_name: null }, { s1: '本店' }).schedule)
      .toEqual({ date: '2026-10-26', start_time: '18:00', store_name: '本店', store_id: 's1' })
  })
})

describe('カードの見た目（改善案 Main.dc.html）', () => {
  const build = (groups: PrivateGroupSummary[], surveyPending: Record<string, boolean> = {}) =>
    buildPrivateBookingView({ groups, reservations: [], scheduleEvents: {}, scenarioImages: {}, surveyPending, todayYmd: TODAY })
  const schedule = { date: '2026-11-07', start_time: '14:00', store_name: '高田馬場店' }

  it('色: 要対応=紫・アンケート/確定=緑・店舗の返事待ち=琥珀・主催者の準備待ち=灰', () => {
    const view = build([
      group({ id: 'a' }),
      group({ id: 's', status: 'confirmed', schedule }),
      group({ id: 'w', status: 'booking_requested', candidate_dates_count: 2 }),
      group({ id: 'o', is_organizer: false }),
      group({ id: 'u', status: 'confirmed', schedule: { ...schedule, date: '2026-11-21' } }),
    ], { s: true })
    const tones = Object.fromEntries(Object.values(view.bySection).flat().map(i => [i.groupId, i.tone]))
    expect(tones).toEqual({ a: 'purple', s: 'green', w: 'amber', o: 'gray', u: 'green' })
  })

  it('人数は 参加/定員、確定後は日時・会場の行、確定・終了は小さいカードで進み具合を出さない', () => {
    const [upcoming] = build([group({ status: 'confirmed', member_count: 4, schedule })]).bySection.confirmed
    expect(upcoming.headcount).toBe('4/6名')
    expect(upcoming.whenWhere).toBe('2026年11月7日(土) 14:00〜 高田馬場店')
    expect(upcoming.compact).toBe(true)
    expect(upcoming.showProgress).toBe(false)
    const [gathering] = build([group({ scenario_player_count_max: null })]).bySection.action
    expect(gathering.headcount).toBe('3名')
    expect(gathering.whenWhere).toBeNull()
    expect(gathering.compact).toBe(false)
    expect(gathering.showProgress).toBe(true)
  })
})

describe('確定した貸切の「カレンダーに登録」「地図を開く」', () => {
  const stores = { s1: { name: '高田馬場店', address: '東京都新宿区高田馬場1-2-3' } }
  const schedule = { date: '2026-11-07', start_time: '14:00', end_time: '17:00', store_name: '高田馬場店', store_id: 's1' }
  const build = (groups: PrivateGroupSummary[], reservations: Reservation[] = []) =>
    Object.values(buildPrivateBookingView({ groups, reservations, scheduleEvents: {}, scenarioImages: {}, surveyPending: {}, todayYmd: TODAY, stores }).bySection).flat()

  it('確定・未来の貸切だけに材料を付ける（店舗の住所・予約番号・グループページ）', () => {
    const [item] = build([group({ status: 'confirmed', schedule, reservation_id: 'r1' })], [reservation({ reservation_source: 'web_private', reservation_number: 'PB-1' })])
    expect(item.calendar).toEqual({
      event: {
        scenarioTitle: '作品A', kind: 'private', date: '2026-11-07', startTime: '14:00', endTime: '17:00',
        storeName: '高田馬場店', address: '東京都新宿区高田馬場1-2-3', reservationNumber: 'PB-1', pageUrl: '/group/invite/CODE1',
      },
      address: '東京都新宿区高田馬場1-2-3',
    })
  })

  it('店舗 id が分からなければ店舗名で住所を探す', () => {
    const [item] = build([group({ status: 'confirmed', schedule: { ...schedule, store_id: null } })])
    expect(item.calendar?.address).toBe('東京都新宿区高田馬場1-2-3')
  })

  it('確定前・終了後は出さない', () => {
    expect(build([group({ candidate_dates_count: 2 })])[0].calendar).toBeNull()
    expect(build([group({ status: 'confirmed', schedule: { ...schedule, date: '2026-10-01' } })])[0].calendar).toBeNull()
  })

  it('グループの無い旧い貸切予約は予約詳細を案内する', () => {
    const [item] = build([], [reservation({ reservation_source: 'web_private', store_id: 's1', reservation_number: 'PB-9', title: '【貸切希望】作品C' })])
    expect(item.calendar?.event).toMatchObject({ scenarioTitle: '作品C', kind: 'private', date: '2026-10-20', startTime: '13:00', storeName: '高田馬場店', pageUrl: '/mypage/reservation/r1' })
  })
})

describe('主ボタンをマイページ上で開く（2026-10-09 案 3）', () => {
  const build = (groups: PrivateGroupSummary[], surveyPending: Record<string, boolean> = {}) =>
    Object.values(buildPrivateBookingView({ groups, reservations: [], scheduleEvents: {}, scenarioImages: {}, surveyPending, todayYmd: TODAY }).bySection).flat()
  it('候補日を決める・日程に回答する・アンケートはダイアログ、申込に進むはグループ画面へ', () => {
    const items = build([
      group({ id: 'pick' }),
      group({ id: 'answer', is_organizer: false, candidate_dates_count: 2, my_unanswered_count: 1 }),
      group({ id: 'survey', status: 'confirmed', schedule: { date: '2026-11-07', start_time: '14:00', store_name: '本店' } }),
      group({ id: 'book', candidate_dates_count: 2 }),
    ], { survey: true })
    const inPlace = Object.fromEntries(items.map(i => [i.groupId, i.primary?.inPlace ?? null]))
    expect(inPlace).toEqual({ pick: 'dates', answer: 'answer', survey: 'survey', book: null })
  })
})
