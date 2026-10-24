import { describe, expect, it } from 'vitest'
import { NEW_ARRIVALS_DAYS, NEW_ARRIVALS_LIMIT, elapsedDays, formatNewArrivalDate, isNewArrivalTarget, isWithinNewArrivalPeriod, matchesCategoryChips, newArrivalBasis, newArrivalDate, newArrivalDateIfNew, newArrivalDateIfTarget, newArrivalPublicKeys, pickNewArrivals, sortCatalogForNewArrivals } from './newArrivals'

const TODAY = '2026-10-24'
const item = (title: string, over: Partial<{ is_new: boolean; release_date: string | null; listed_at: string | null }> = {}) => ({
  title, is_new: false, release_date: null, listed_at: null, ...over,
})
const titles = (list: ReturnType<typeof item>[], today = TODAY) => pickNewArrivals(list, today).map((x) => x.item.title)

describe('新作一覧の日付', () => {
  it('リリース日があればそれ、無ければ掲載登録日（組織が一覧に登録した日時を JST の日付に）', () => {
    expect(newArrivalDate(item('a', { release_date: '2026-09-01', listed_at: '2026-10-13T00:00:00Z' }))).toEqual({ date: '2026-09-01', kind: 'release' })
    expect(newArrivalDate(item('b', { listed_at: '2026-10-12T18:00:00Z' }))).toEqual({ date: '2026-10-13', kind: 'listed' })
    expect(newArrivalDate(item('c'))).toBeNull()
  })

  it('JST の日付の切り替わり: UTC 14:59 は同じ日、UTC 15:00 は翌日', () => {
    expect(newArrivalDate(item('a', { listed_at: '2026-07-26T14:59:59Z' }))?.date).toBe('2026-07-26')
    expect(newArrivalDate(item('b', { listed_at: '2026-07-26T15:00:00Z' }))?.date).toBe('2026-07-27')
  })

  it('画面ではどちらの日付かを書く（掲載登録日を「公開日」とは書かない）', () => {
    expect(formatNewArrivalDate({ date: '2026-10-13', kind: 'listed' })).toBe('掲載登録日：2026.10.13')
    expect(formatNewArrivalDate({ date: '2026-10-13', kind: 'release' })).toBe('リリース日：2026.10.13')
  })
})

describe('新作の期間（基準日を 1 日目として 90 日間。2026-10-24 社長承認）', () => {
  it(`当日（経過 0）と経過 89 日は入り、経過 ${NEW_ARRIVALS_DAYS} 日と未来日は外れる`, () => {
    // 2026-10-24 から 89 日前 = 2026-07-27、90 日前 = 2026-07-26
    expect(elapsedDays('2026-10-24', TODAY)).toBe(0)
    expect(elapsedDays('2026-07-27', TODAY)).toBe(89)
    expect(elapsedDays('2026-07-26', TODAY)).toBe(90)
    expect(titles([
      item('当日', { release_date: '2026-10-24' }),
      item('経過89', { release_date: '2026-07-27' }),
      item('経過90', { release_date: '2026-07-26' }),
      item('未来', { release_date: '2026-10-25' }),
    ])).toEqual(['当日', '経過89'])
  })

  it('掲載登録日の境界は JST の日付で数える（UTC 7/26 14:59 は 7/26＝経過 90 で外、15:00 は 7/27＝経過 89 で入る）', () => {
    expect(titles([
      item('外', { listed_at: '2026-07-26T14:59:59Z' }),
      item('入', { listed_at: '2026-07-26T15:00:00Z' }),
    ])).toEqual(['入'])
  })

  it('今日が JST で変わる瞬間も同じ（今日 = 10/24 なら 7/27 は入り、10/25 になると外れる）', () => {
    const list = [item('7/27', { release_date: '2026-07-27' })]
    expect(titles(list, '2026-10-24')).toEqual(['7/27'])
    expect(titles(list, '2026-10-25')).toEqual([])
  })

  it('年をまたぐ: 2026-12-01 の作品は 2027-02-28（経過 89）まで、2027-03-01（経過 90）で外れる', () => {
    expect(isWithinNewArrivalPeriod('2026-12-01', '2027-02-28')).toBe(true)
    expect(isWithinNewArrivalPeriod('2026-12-01', '2027-03-01')).toBe(false)
  })

  it('月をまたぐ: 1/31 の作品は 4/30（経過 89）まで、5/1（経過 90）で外れる（2026 年はうるう年でない）', () => {
    expect(elapsedDays('2026-01-31', '2026-04-30')).toBe(89)
    expect(isWithinNewArrivalPeriod('2026-01-31', '2026-04-30')).toBe(true)
    expect(isWithinNewArrivalPeriod('2026-01-31', '2026-05-01')).toBe(false)
  })

  it('うるう日（2/29）をまたぐ: 2028-01-01 の作品は 2028-03-30（経過 89）まで、3/31（経過 90）で外れる', () => {
    expect(elapsedDays('2028-02-28', '2028-03-01')).toBe(2)
    expect(isWithinNewArrivalPeriod('2028-01-01', '2028-03-30')).toBe(true)
    expect(isWithinNewArrivalPeriod('2028-01-01', '2028-03-31')).toBe(false)
    expect(isWithinNewArrivalPeriod('2028-02-29', '2028-02-29')).toBe(true)
  })

  it('リリース日を優先する（掲載登録日が期間内でも、リリース日が期間外なら外れる。逆も）', () => {
    expect(titles([
      item('リリース日が古い', { release_date: '2026-01-01', listed_at: '2026-10-20T03:00:00Z' }),
      item('リリース日が新しい', { release_date: '2026-10-01', listed_at: '2025-01-01T03:00:00Z' }),
      item('リリース日なし', { listed_at: '2026-10-20T03:00:00Z' }),
    ])).toEqual(['リリース日なし', 'リリース日が新しい'])
  })
})

describe('新作一覧の並びと抽出', () => {
  it('新しい順。同じ日は題名順。新作タグの無い新しい作品も漏らさない。日付が分からない作品は出さない', () => {
    const list = [
      item('古い新作', { is_new: true, listed_at: '2026-08-14T03:00:00Z' }),
      item('タグなしの最新', { is_new: false, listed_at: '2026-10-20T03:00:00Z' }),
      item('い', { listed_at: '2026-10-13T03:00:00Z' }),
      item('あ', { listed_at: '2026-10-13T05:00:00Z' }),
      item('リリース日あり', { release_date: '2026-10-15', listed_at: '2026-01-22T03:00:00Z' }),
      item('日付なし'),
    ]
    expect(titles(list)).toEqual(['タグなしの最新', 'リリース日あり', 'あ', 'い', '古い新作'])
  })

  it(`期間内が多ければ最新 ${NEW_ARRIVALS_LIMIT} 件、少なければその件数、無ければ 0 件`, () => {
    const list = Array.from({ length: 20 }, (_, i) => item(`作品${i}`, { listed_at: `2026-10-${String(i + 1).padStart(2, '0')}T03:00:00Z` }))
    const picked = pickNewArrivals(list, TODAY)
    expect(picked).toHaveLength(NEW_ARRIVALS_LIMIT)
    expect(picked[0].item.title).toBe('作品19')
    expect(titles([item('a', { release_date: '2026-10-01' }), item('古い', { release_date: '2026-01-01' })])).toEqual(['a'])
    expect(titles([item('古い', { release_date: '2026-01-01' })])).toEqual([])
  })
})

describe('カタログの「新作」チップ（トップと同じ判定）', () => {
  it('newArrivalDateIfNew は pickNewArrivals と同じ境界', () => {
    expect(newArrivalDateIfNew(item('a', { listed_at: '2026-07-26T15:00:00Z' }), TODAY)?.date).toBe('2026-07-27')
    expect(newArrivalDateIfNew(item('b', { listed_at: '2026-07-26T14:59:59Z' }), TODAY)).toBeNull()
    expect(newArrivalDateIfNew(item('c', { release_date: '2026-10-25' }), TODAY)).toBeNull()
  })
  it('チップの組み合わせは既存の規則（どれか 1 つに当てはまれば出す）。「新作」はジャンルではなく 90 日の判定', () => {
    expect(matchesCategoryChips(['SF'], [], false)).toBe(true)
    expect(matchesCategoryChips(['新作'], ['新作'], false)).toBe(false)
    expect(matchesCategoryChips([], ['新作'], true)).toBe(true)
    expect(matchesCategoryChips(['3時間以内'], ['新作', '3時間以内'], false)).toBe(true)
    expect(matchesCategoryChips(['SF'], ['新作', '3時間以内'], false)).toBe(false)
  })
  it('「新作」を選んでいるときだけ、新作をトップと同じ並びで先に、残りは元の並び', () => {
    const list = [{ title: 'い' }, { title: '古' }, { title: 'あ' }, { title: '新' }]
    const dates: Record<string, { date: string; kind: 'listed' } | null> = {
      'い': { date: '2026-10-13', kind: 'listed' }, 'あ': { date: '2026-10-13', kind: 'listed' }, '新': { date: '2026-10-20', kind: 'listed' }, '古': null,
    }
    expect(sortCatalogForNewArrivals(list, ['新作'], (x) => dates[x.title]).map((x) => x.title)).toEqual(['新', 'あ', 'い', '古'])
    expect(sortCatalogForNewArrivals(list, ['SF'], (x) => dates[x.title]).map((x) => x.title)).toEqual(['い', '古', 'あ', '新'])
  })
})

describe('新作の対象（トップ・全体カタログ・組織カタログで共通）', () => {
  const ok = { organization_id: 'o1', scenario_master_id: 'm1', status: 'available', scenario_type: 'normal', master_status: 'approved' }
  const scope = { publicKeys: new Set(['o1_m1', 'o2_m1']), activeOrganizationIds: new Set(['o1', 'o2']), organizationId: null }
  it('公開中・ガイド用でない・承認済み・稼働中の組織・公開キーに含まれる行だけ', () => {
    expect(isNewArrivalTarget(ok, scope)).toBe(true)
    expect(isNewArrivalTarget({ ...ok, scenario_type: 'gm_test' }, scope)).toBe(false)
    expect(isNewArrivalTarget({ ...ok, master_status: 'pending' }, scope)).toBe(false)
    expect(isNewArrivalTarget({ ...ok, status: 'unavailable' }, scope)).toBe(false)
    expect(isNewArrivalTarget({ ...ok, organization_id: 'o3' }, scope)).toBe(false)
    expect(isNewArrivalTarget({ ...ok, scenario_master_id: 'm9' }, scope)).toBe(false)
    expect(isNewArrivalTarget({ ...ok, organization_id: 'o2' }, { ...scope, organizationId: 'o1' })).toBe(false)
  })
  it('公開キーを読めない・空なら、既存と同じく公開キーでは絞らない', () => {
    expect(newArrivalPublicKeys([], false)).toBeNull()
    expect(newArrivalPublicKeys([{ organization_id: 'o1', scenario_master_id: 'm1' }], true)).toBeNull()
    expect(isNewArrivalTarget({ ...ok, scenario_master_id: 'm9' }, { ...scope, publicKeys: null })).toBe(true)
  })
  it('基準の掲載登録日は対象の行のうちいちばん早い日。対象が無ければ新作にしない', () => {
    expect(newArrivalBasis([
      { ...ok, created_at: '2026-10-18T03:00:00Z', organization_id: 'o2' },
      { ...ok, created_at: '2026-10-05T03:00:00Z' },
      { ...ok, created_at: '2026-01-01T03:00:00Z', scenario_type: 'gm_test' },
    ], scope)).toEqual({ target: true, listed_at: '2026-10-05T03:00:00Z' })
    expect(newArrivalBasis([{ ...ok, created_at: '2026-10-22T03:00:00Z', scenario_type: 'gm_test' }], scope)).toEqual({ target: false, listed_at: null })
    expect(newArrivalDateIfTarget({ new_arrival_target: false, release_date: '2026-10-20', listed_at: null }, TODAY)).toBeNull()
    expect(newArrivalDateIfTarget({ new_arrival_target: true, release_date: '2026-10-20', listed_at: null }, TODAY)?.date).toBe('2026-10-20')
  })
})
