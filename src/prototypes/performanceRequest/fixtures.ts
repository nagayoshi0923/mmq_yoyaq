/**
 * 開催リクエスト試作の架空データ。星空のマリスの表示見本のみ公開作品情報を利用。
 * 受付・店舗・お客様・公演はすべて架空。試作は実 API・実 DB を使わず、ここにある値と、このブラウザの localStorage だけで動く。
 */
import type { ScheduleEvent } from '@/types/schedule'
import type { PerformanceRequest } from './model'

export interface ProtoStore {
  id: string
  name: string
  short_name: string
  region: string
}

export interface ProtoScenario {
  id: string
  title: string
  author: string
  playerMin: number
  playerMax: number
  durationMinutes: number
  fee: number
  /** 参考表示用の「いいね」数（既存の scenario_likes を将来使う案の見本） */
  likes: number
  synopsis: string
  keyVisualUrl?: string
  genre?: string[]
}

export const PROTO_ORGANIZATION = { id: 'proto-org', name: '架空の組織（試作）', slug: 'proto-org' } as const

/** 試作で「ログイン中のお客様」として扱う架空の利用者 */
export const PROTO_USER_ID = 'proto-user-1'

export const PROTO_STORES: ProtoStore[] = [
  { id: 'proto-store-a', name: '架空・渋谷店', short_name: '渋谷', region: '東京都' },
  { id: 'proto-store-b', name: '架空・新宿店', short_name: '新宿', region: '東京都' },
  { id: 'proto-store-c', name: '架空・横浜店', short_name: '横浜', region: '神奈川県' },
]

export const PROTO_SCENARIOS: ProtoScenario[] = [
  {
    id: 'proto-scn-1',
    title: '【架空】霧の館の晩餐会',
    author: '架空の作者A',
    playerMin: 5,
    playerMax: 6,
    durationMinutes: 210,
    fee: 4500,
    likes: 38,
    synopsis: '嵐の夜、招待状を受け取った6人が霧の館に集まる。晩餐の最中に主人が姿を消し……（試作用の架空のあらすじ）',
  },
  {
    id: 'proto-scn-2',
    title: '【架空】時計塔の約束',
    author: '架空の作者B',
    playerMin: 4,
    playerMax: 5,
    durationMinutes: 180,
    fee: 4000,
    likes: 21,
    synopsis: '止まった時計塔の下で交わされた約束をめぐる物語（試作用の架空のあらすじ）',
  },
  {
    id: 'proto-scn-3',
    title: '【架空】海辺のアトリエ',
    author: '架空の作者C',
    playerMin: 6,
    playerMax: 7,
    durationMinutes: 240,
    fee: 5000,
    likes: 12,
    synopsis: '海辺のアトリエで見つかった未完成の絵（試作用の架空のあらすじ）',
  },
  // 公開作品の表示見本。ID・店舗・開催希望・通知は実データと接続しない。
  {
    id: 'proto-scn-public', title: '星空のマリス', author: 'イバラユーギ',
    playerMin: 7, playerMax: 7, durationMinutes: 210, fee: 4500, likes: 0,
    keyVisualUrl: 'https://cznpcewciwywcqcxktba.supabase.co/storage/v1/object/public/key-visuals/1761046761540-9azpt.webp',
    genre: ['ロングセラー', 'シリーズもの'],
    synopsis: '「知識は罪だ」 人類が長い時間をかけ辿り着いた、たったひとつの真実。\n知る事で憎み、知る事で争い、知る事で殺し、知る事で滅んだ。\n地下に逃げた我々は、その学びを決して忘れる事なく、否、決して思い出す事なく生きていこう。 ―――。\n朝が来ると光が差し込み、やがて空が橙色に染まり、そして静かな夜が訪れる。\nこのシステムを思いつき開発した人は、きっと素晴らしい人だろう。\nだって、朝焼けを見ていると、今日も頑張ろうって思えるから。\nだって、夕暮れを見ていると、優しい気持ちになれるから。\nだって、星空を見ていると、明日を待ち望んで眠れるから。 ―――。\nこの世界は素晴らしい物で溢れている。 作り物のように美しく、気味が悪いくらいに優しい。\nそんな悲劇が似合わない世界で。 あなたたちのお話が、はじまります。',
  },

]

/** 管理画面の初期表示の月（架空データはこの月と翌月に合わせてある） */
export const PROTO_DEFAULT_MONTH = '2026-11'

/** 架空の「お客様から届いた開催リクエスト」 */
export const PROTO_REQUESTS: PerformanceRequest[] = [
  {
    id: 'proto-req-1', userId: 'proto-other-1', scenarioId: 'proto-scn-1', storeIds: ['proto-store-a', 'proto-store-b'],
    participants: 2, period: { kind: 'months', months: ['2026-11'] }, weekdays: [6, 0], dates: [],
    createdAt: '2026-10-20T10:00:00+09:00',
  },
  {
    id: 'proto-req-2', userId: 'proto-other-2', scenarioId: 'proto-scn-1', storeIds: ['proto-store-a'],
    participants: 1, period: { kind: 'months', months: ['2026-11', '2026-12'] }, weekdays: [6], dates: ['2026-11-21'],
    createdAt: '2026-10-21T12:30:00+09:00',
  },
  {
    id: 'proto-req-3', userId: 'proto-other-3', scenarioId: 'proto-scn-1', storeIds: ['proto-store-a'],
    participants: 3, period: { kind: 'anytime' }, weekdays: [], dates: [],
    createdAt: '2026-10-22T09:15:00+09:00',
  },
  {
    id: 'proto-req-4', userId: 'proto-other-4', scenarioId: 'proto-scn-2', storeIds: ['proto-store-b'],
    participants: 2, period: { kind: 'months', months: ['2026-11'] }, weekdays: [5], dates: [],
    createdAt: '2026-10-22T18:40:00+09:00',
  },
  {
    id: 'proto-req-5', userId: 'proto-other-5', scenarioId: 'proto-scn-2', storeIds: ['proto-store-a', 'proto-store-b'],
    participants: 4, period: { kind: 'months', months: ['2026-11'] }, weekdays: [], dates: ['2026-11-14', '2026-11-15'],
    createdAt: '2026-10-23T08:05:00+09:00',
  },
  {
    id: 'proto-req-6', userId: 'proto-other-6', scenarioId: 'proto-scn-3', storeIds: ['proto-store-c'],
    participants: 2, period: { kind: 'months', months: ['2026-12'] }, weekdays: [0], dates: [],
    createdAt: '2026-10-23T21:00:00+09:00',
  },
]

function protoEvent(partial: Partial<ScheduleEvent> & Pick<ScheduleEvent, 'id' | 'date' | 'venue' | 'scenario' | 'start_time' | 'end_time'>): ScheduleEvent {
  return {
    gms: ['架空GM'],
    is_cancelled: false,
    category: 'open',
    current_participants: 0,
    max_participants: 6,
    is_reservation_enabled: true,
    organization_id: PROTO_ORGANIZATION.id,
    store_id: partial.venue,
    gm_roles: {},
    ...partial,
    scenarios: { id: `scn-${partial.id}`, title: partial.scenario, player_count_max: partial.max_participants ?? 6 },
  }
}

/** 架空の「確定している公演」（スケジュール表の見本）。開催リクエストはここに混ぜない */
export const PROTO_EVENTS: ScheduleEvent[] = [
  protoEvent({ id: 'proto-ev-1', date: '2026-11-07', venue: 'proto-store-a', scenario: '【架空】時計塔の約束', start_time: '13:00', end_time: '16:00', current_participants: 3, max_participants: 5 }),
  protoEvent({ id: 'proto-ev-2', date: '2026-11-08', venue: 'proto-store-b', scenario: '【架空】霧の館の晩餐会', start_time: '18:00', end_time: '21:30', current_participants: 5, max_participants: 6 }),
  protoEvent({ id: 'proto-ev-3', date: '2026-11-14', venue: 'proto-store-a', scenario: '【架空】海辺のアトリエ', start_time: '10:00', end_time: '14:00', current_participants: 2, max_participants: 7 }),
  protoEvent({ id: 'proto-ev-4', date: '2026-11-22', venue: 'proto-store-c', scenario: '【架空】霧の館の晩餐会', start_time: '14:00', end_time: '17:30', current_participants: 0, max_participants: 6, category: 'private' }),
  protoEvent({ id: 'proto-ev-5', date: '2026-12-05', venue: 'proto-store-b', scenario: '【架空】時計塔の約束', start_time: '19:00', end_time: '22:00', current_participants: 1, max_participants: 5 }),
]

/**
 * 通知の模擬に使う「これから公開される公演」の架空データ。
 * 通知を出すのは「公開され、かつ予約受付できる」状態になったときだけ（model.ts の isNotifiablePerformance）。
 */
export interface ProtoPerformance {
  id: string
  scenarioId: string
  storeId: string
  date: string
  startTime: string
  /** 公開済み（お客様に見える） */
  isPublished: boolean
  /** 予約受付中 */
  isReservationEnabled: boolean
  isCancelled: boolean
  category: 'open' | 'private'
}

export const PROTO_SIMULATED_PERFORMANCES: Record<'matching' | 'notMatching' | 'draft' | 'otherWork', ProtoPerformance> = {
  // 霧の館・渋谷・11/21(土) → 下の購読・リクエスト（渋谷・土曜）の条件に合う
  matching: { id: 'proto-new-1', scenarioId: 'proto-scn-1', storeId: 'proto-store-a', date: '2026-11-21', startTime: '13:00', isPublished: true, isReservationEnabled: true, isCancelled: false, category: 'open' },
  // 霧の館・新宿・11/25(水) → ベルの対象だが、リクエストの条件（渋谷・土曜）には合わない
  notMatching: { id: 'proto-new-2', scenarioId: 'proto-scn-1', storeId: 'proto-store-b', date: '2026-11-25', startTime: '19:00', isPublished: true, isReservationEnabled: true, isCancelled: false, category: 'open' },
  // 下書き（非公開）→ 通知しない
  draft: { id: 'proto-new-3', scenarioId: 'proto-scn-1', storeId: 'proto-store-a', date: '2026-11-28', startTime: '13:00', isPublished: false, isReservationEnabled: false, isCancelled: false, category: 'open' },
  // ベルもリクエストもしていない作品 → 通知しない
  otherWork: { id: 'proto-new-4', scenarioId: 'proto-scn-3', storeId: 'proto-store-a', date: '2026-11-29', startTime: '10:00', isPublished: true, isReservationEnabled: true, isCancelled: false, category: 'open' },
}

export function findProtoScenario(id: string): ProtoScenario | undefined {
  return PROTO_SCENARIOS.find((s) => s.id === id)
}

export function findProtoStore(id: string): ProtoStore | undefined {
  return PROTO_STORES.find((s) => s.id === id)
}
