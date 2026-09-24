import { describe, expect, it } from 'vitest'
import { scenarioEffectiveFields, scenarioSourcePayload } from './scenarioSettingSources'

describe('作品の設定元を保持した保存', () => {
  const initial = { title: '共通タイトル', author: '共通作者', duration: 120, genre: [], difficulty: 0 }
  const state = { stored: { override_title: null, override_author: '共通作者', duration: null, override_genre: [], override_difficulty: '0' }, baseline: initial }
  it('別項目の保存で共通参照を固定値に変えず、共通と同値の明示上書きも保持する', () => {
    const result = scenarioSourcePayload({ ...initial, participation_fee: 4000 }, state, {})
    expect(result.override_title).toBeNull()
    expect(result.duration).toBeNull()
    expect(result.override_author).toBe('共通作者')
    expect(result.override_genre).toEqual([])
    expect(result.override_difficulty).toBe('0')
  })
  it('共通情報に戻すと固定コピーではなくnullを保存する', () => {
    const result = scenarioSourcePayload(initial, state, { author: '共通作者' })
    expect(result.override_author).toBeNull()
  })
  it('戻した後に入力を変えた場合は新しい自社設定を保存する', () => {
    const result = scenarioSourcePayload({ ...initial, author: '自社表記' }, state, { author: '共通作者' })
    expect(result.override_author).toBe('自社表記')
  })
  it('空文字や空配列の明示変更を未設定と混同しない', () => {
    const result = scenarioSourcePayload({ ...initial, title: '' }, state, {})
    expect(result.override_title).toBe('')
    expect(result.override_genre).toEqual([])
  })
})

it('共通と自社の実効値はnullだけを継承し、空文字・空配列・0は保持する', () => {
  expect(scenarioEffectiveFields({ override_title: '', override_genre: [], override_difficulty: '0', custom_caution: null }, { title: '共通', genre: ['推理'], difficulty: '3', caution: '共通の注意' })).toMatchObject({ title: '', genre: [], difficulty: 0, caution: '共通の注意' })
})

it('新規作品のマスタ選択後、未編集項目は共通参照し変更した項目だけ固定する', () => {
  const baseline = scenarioEffectiveFields({}, { title: '共通作品', official_duration: 180, player_count_min: 5, player_count_max: 6, caution: '共通の注意', sensitive_tags: ['暴力表現'] })
  expect(baseline.sensitive_tags).toEqual(['暴力表現'])
  const state = { stored: {}, baseline }
  expect(Object.values(scenarioSourcePayload(baseline, state, {})).every(value => value === null)).toBe(true)
  expect(scenarioSourcePayload({ ...baseline, title: '自社表記' }, state, {})).toMatchObject({ override_title: '自社表記', duration: null, override_player_count_min: null, custom_caution: null })
})
