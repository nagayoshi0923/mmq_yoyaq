import { describe, expect, it } from 'vitest'
import { findStoreByName, mapUrl, meetingTime, priceSummary, publicCharacters, scenarioPageUrl, yenRange } from './overviewModel'
import { toGroupScenarioInfo } from './useGroupScenarioInfo'
import { difficultyText, durationWithWeekendText, playerRangeText } from '@/components/scenario/scenarioFacts'

const costs = [
  { time_slot: 'normal', amount: 4500, type: 'fixed' as const },
  { time_slot: 'weekend', amount: 5000, type: 'fixed' as const },
]

describe('概要タブの計算', () => {
  it('作品ページの URL は組織の slug 付き。作品の slug が無ければ id', () => {
    expect(scenarioPageUrl('queens-waltz', 'kokubetsu', 'm1')).toBe('/queens-waltz/scenario/kokubetsu')
    expect(scenarioPageUrl('queens-waltz', null, 'm1')).toBe('/queens-waltz/scenario/m1')
    expect(scenarioPageUrl(null, 'kokubetsu', 'm1')).toBe('/scenario/kokubetsu')
    expect(scenarioPageUrl('qw', null, null)).toBeNull()
  })

  it('登場人物は NPC・名前なしを除き、並び順どおり。出す項目だけに絞る', () => {
    const list = publicCharacters([
      { id: 'b', name: '医師', description: '町で唯一の医者', sort_order: 2, secret: '真犯人' } as never,
      { id: 'a', name: '宿の女将', sort_order: 1, image_url: 'a.png' },
      { id: 'n', name: '語り部', is_npc: true, sort_order: 0 },
      { id: 'x', name: '  ', sort_order: 3 },
    ])
    expect(list.map(c => c.name)).toEqual(['宿の女将', '医師'])
    expect(list[1]).toEqual({ id: 'b', name: '医師', description: '町で唯一の医者', imageUrl: null, imagePosition: null, imageScale: null, backgroundColor: null })
    expect(publicCharacters(undefined)).toEqual([])
  })

  it('集合は開演の 10 分前', () => {
    expect(meetingTime('13:00:00')).toBe('12:50')
    expect(meetingTime('09:05')).toBe('08:55')
    expect(meetingTime(null)).toBeNull()
  })

  it('地図の URL は住所を符号化する', () => {
    expect(mapUrl('東京都新宿区 1-2')).toBe('https://www.google.com/maps/search/?api=1&query=%E6%9D%B1%E4%BA%AC%E9%83%BD%E6%96%B0%E5%AE%BF%E5%8C%BA%201-2')
  })

  it('店舗は正式名・略称のどちらでも見つける', () => {
    const stores = [{ id: '1', name: '高田馬場店', short_name: '馬場' }, { id: '2', name: '大久保店', short_name: null }]
    expect(findStoreByName(stores, '大久保店')?.id).toBe('2')
    expect(findStoreByName(stores, '馬場')?.id).toBe('1')
    expect(findStoreByName(stores, null)).toBeNull()
  })

  it('料金: 申込前は候補日（平日・土日）で幅を出し、定員分の合計', () => {
    const p = priceSummary({
      phase: 'pre_request', fee: 4500, costs, people: 6,
      candidates: [{ date: '2026-10-28', startTime: '13:00' }, { date: '2026-10-31', startTime: '13:00' }],
      confirmed: null, savedPerPerson: null, savedTotal: null,
    })
    expect(p).toEqual({ perPersonMin: 4500, perPersonMax: 5000, people: 6, totalMin: 27000, totalMax: 30000 })
    expect(yenRange(p!.totalMin, p!.totalMax)).toBe('¥27,000〜¥30,000')
  })

  it('料金: 候補日が無ければ通常料金、定員が分からなければ出さない', () => {
    expect(priceSummary({ phase: 'pre_request', fee: 4500, costs, people: 6, candidates: [], confirmed: null, savedPerPerson: null, savedTotal: null })?.perPersonMax).toBe(4500)
    expect(priceSummary({ phase: 'pre_request', fee: 4500, costs, people: null, candidates: [], confirmed: null, savedPerPerson: null, savedTotal: null })).toBeNull()
  })

  it('料金: 確定後は保存された金額を正とし、無ければ確定日の料金', () => {
    expect(priceSummary({ phase: 'confirmed', fee: 4500, costs, people: 6, candidates: [], confirmed: { date: '2026-10-28', startTime: '13:00' }, savedPerPerson: 4800, savedTotal: 28800 }))
      .toEqual({ perPersonMin: 4800, perPersonMax: 4800, people: 6, totalMin: 28800, totalMax: 28800 })
    expect(priceSummary({ phase: 'confirmed', fee: 4500, costs, people: 6, candidates: [{ date: '2026-10-28', startTime: '13:00' }], confirmed: { date: '2026-10-31', startTime: '13:00' }, savedPerPerson: null, savedTotal: null })?.perPersonMin).toBe(5000)
  })
})

describe('作品の公開情報の読み替え', () => {
  it('欠けた列・空の値でも落ちず、あらすじが無ければ説明を使う', () => {
    const info = toGroupScenarioInfo({ title: '告別詩', description: '説明', genre: ['感動系', ''], weekend_duration: 0, has_pre_reading: true, characters: null })
    expect(info.synopsis).toBe('説明')
    expect(info.genre).toEqual(['感動系'])
    expect(info.weekendDuration).toBeNull()
    expect(info.hasPreReading).toBe(true)
    expect(info.characters).toEqual([])
  })
})

describe('作品の基本情報の文字列', () => {
  it('人数・所要時間・難易度', () => {
    expect(playerRangeText(4, 6)).toBe('4〜6人')
    expect(playerRangeText(6, 6)).toBe('6人')
    expect(durationWithWeekendText(240, 300)).toBe('約4時間（土日祝 約5時間）')
    expect(durationWithWeekendText(270, 270)).toBe('約4時間30分')
    expect(durationWithWeekendText(null, null)).toBeNull()
    expect(difficultyText(3)).toBe('難易度 ★★★☆☆')
    expect(difficultyText(9)).toBeNull()
  })
})
