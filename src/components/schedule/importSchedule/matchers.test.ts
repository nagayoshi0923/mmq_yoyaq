import { describe, expect, it } from 'vitest'
import { matchStaffName, matchScenarioName } from './matchers'

const staff = [{ name: '田中' }, { name: 'さくら' }, { name: 'Yamada' }]

describe('matchStaffName', () => {
  it('空入力は null', () => {
    expect(matchStaffName('', staff, {})).toBeNull()
  })
  it('動的マッピングの完全一致を優先する', () => {
    expect(matchStaffName('たなか', staff, { たなか: '田中' })).toBe('田中')
  })
  it('リストの完全一致', () => {
    expect(matchStaffName('田中', staff, {})).toBe('田中')
  })
  it('かな変換して一致（カタカナ入力→ひらがなスタッフ名）', () => {
    expect(matchStaffName('サクラ', staff, {})).toBe('さくら')
  })
  it('前方一致（入力がスタッフ名で始まる・2文字以上）', () => {
    expect(matchStaffName('田中さん', staff, {})).toBe('田中')
  })
  it('部分一致（スタッフ名が入力を含む方向）', () => {
    expect(matchStaffName('中', staff, {})).toBeNull() // 1文字は閾値未満
    expect(matchStaffName('元田中', staff, {})).toBe('田中') // includes・2文字以上
  })
  it('該当なしは null', () => {
    expect(matchStaffName('佐藤', staff, {})).toBeNull()
  })
})

const scenarios = [{ title: '立方館' }, { title: '季節／春の事件' }, { title: 'LOST／Remembrance' }]

describe('matchScenarioName', () => {
  it('空入力は null', () => {
    expect(matchScenarioName('', scenarios, {})).toBeNull()
  })
  it('エイリアスマップを最優先', () => {
    expect(matchScenarioName('りっぽう', scenarios, { りっぽう: '立方館' })).toBe('立方館')
  })
  it('完全一致', () => {
    expect(matchScenarioName('立方館', scenarios, {})).toBe('立方館')
  })
  it('入力がシナリオ名で始まる', () => {
    expect(matchScenarioName('立方館(13-17)', scenarios, {})).toBe('立方館')
  })
  it('シナリオ名が入力で始まる（3文字以上）', () => {
    expect(matchScenarioName('LOST／', scenarios, {})).toBe('LOST／Remembrance')
  })
  it('「季節」プレフィックス除去でリトライ', () => {
    expect(matchScenarioName('季節／春の事件', scenarios, {})).toBe('季節／春の事件') // まず完全一致
    expect(matchScenarioName('季節マーダー春の事件', scenarios, {})).toBe('季節／春の事件') // strip→includes
  })
  it('該当なしは null', () => {
    expect(matchScenarioName('未知のシナリオ', scenarios, {})).toBeNull()
  })
})
