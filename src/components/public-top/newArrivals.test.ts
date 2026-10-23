import { describe, expect, it } from 'vitest'
import { NEW_ARRIVALS_LIMIT, formatNewArrivalDate, newArrivalDate, pickNewArrivals } from './newArrivals'

const item = (title: string, over: Partial<{ is_new: boolean; release_date: string | null; listed_at: string | null }> = {}) => ({
  title, is_new: false, release_date: null, listed_at: null, ...over,
})

describe('新作一覧の日付', () => {
  it('リリース日があればそれ、無ければ掲載登録日（組織が一覧に登録した日時を JST の日付に）', () => {
    expect(newArrivalDate(item('a', { release_date: '2026-09-01', listed_at: '2026-10-13T00:00:00Z' }))).toEqual({ date: '2026-09-01', kind: 'release' })
    // UTC 10/12 18:00 は JST 10/13
    expect(newArrivalDate(item('b', { listed_at: '2026-10-12T18:00:00Z' }))).toEqual({ date: '2026-10-13', kind: 'listed' })
    expect(newArrivalDate(item('c'))).toBeNull()
  })

  it('画面ではどちらの日付かを書く（掲載登録日を「公開日」とは書かない）', () => {
    expect(formatNewArrivalDate({ date: '2026-10-13', kind: 'listed' })).toBe('掲載登録日：2026.10.13')
    expect(formatNewArrivalDate({ date: '2026-10-13', kind: 'release' })).toBe('リリース日：2026.10.13')
  })
})

describe('新作一覧の並びと抽出', () => {
  it('新しい順。同じ日は題名順。新作タグの無い新しい作品も漏らさない。日付が分からない作品は出さない', () => {
    const list = [
      item('古い新作', { is_new: true, listed_at: '2026-06-14T03:00:00Z' }),
      item('タグなしの最新', { is_new: false, listed_at: '2026-10-20T03:00:00Z' }),
      item('い', { listed_at: '2026-10-13T03:00:00Z' }),
      item('あ', { listed_at: '2026-10-13T05:00:00Z' }),
      item('リリース日あり', { release_date: '2026-10-15', listed_at: '2026-01-22T03:00:00Z' }),
      item('日付なし'),
    ]
    expect(pickNewArrivals(list).map((x) => x.item.title)).toEqual(['タグなしの最新', 'リリース日あり', 'あ', 'い', '古い新作'])
  })

  it('リリース日が未来でも公開中なら出す（先頭）', () => {
    const list = [item('今', { listed_at: '2026-10-20T03:00:00Z' }), item('未来', { release_date: '2026-12-01' })]
    expect(pickNewArrivals(list).map((x) => x.item.title)).toEqual(['未来', '今'])
  })

  it(`最大 ${NEW_ARRIVALS_LIMIT} 件`, () => {
    const list = Array.from({ length: 20 }, (_, i) => item(`作品${i}`, { listed_at: `2026-10-${String(i + 1).padStart(2, '0')}T03:00:00Z` }))
    const picked = pickNewArrivals(list)
    expect(picked).toHaveLength(NEW_ARRIVALS_LIMIT)
    expect(picked[0].item.title).toBe('作品19')
  })
})
