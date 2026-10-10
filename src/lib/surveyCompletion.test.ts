import { describe, expect, it } from 'vitest'
import { characterAnswerLabel, isPastPerformanceDate, missingRequiredSurveyQuestions, stripHiddenSurveyAnswers, toggleCharacterPick } from './surveyCompletion'

const charQ = { id: 'c', question_type: 'character_selection' as const, is_required: true }
const textQ = { id: 't', question_type: 'text' as const, is_required: true }
const multiQ = { id: 'm', question_type: 'multiple_choice' as const, is_required: true }

describe('surveyCompletion', () => {
  it('配役方法が「アンケート」に変わったら、キャラクター希望が空の回答は未完了になる', () => {
    expect(missingRequiredSurveyQuestions([charQ, textQ], { t: 'なし' }, true)).toEqual([])
    expect(missingRequiredSurveyQuestions([charQ, textQ], { t: 'なし' }, false)).toEqual([charQ])
  })
  it('回答なし・空文字・空の複数選択は未回答とみなす', () => {
    expect(missingRequiredSurveyQuestions([textQ, multiQ], undefined, false)).toEqual([textQ, multiQ])
    expect(missingRequiredSurveyQuestions([textQ, multiQ], { t: '', m: [] }, false)).toEqual([textQ, multiQ])
    expect(missingRequiredSurveyQuestions([textQ, multiQ], { t: 'a', m: ['x'] }, false)).toEqual([])
  })
  it('画面に出していないキャラクター希望は送信しない', () => {
    expect(stripHiddenSurveyAnswers([charQ, textQ], { c: 'char1', t: 'a' }, true)).toEqual({ t: 'a' })
    expect(stripHiddenSurveyAnswers([charQ, textQ], { c: 'char1', t: 'a' }, false)).toEqual({ c: 'char1', t: 'a' })
  })
  it('公演日の日本時間23時59分59秒を過ぎたら終了とみなす', () => {
    expect(isPastPerformanceDate('2026-10-05', new Date('2026-10-05T14:59:58Z'))).toBe(false)
    expect(isPastPerformanceDate('2026-10-05', new Date('2026-10-05T15:00:00Z'))).toBe(true)
    expect(isPastPerformanceDate(undefined)).toBe(false)
  })
})

describe('toggleCharacterPick（事前配役アンケートの第 1・第 2 希望）', () => {
  it('押す順に第 1・第 2 希望になり、3 つ目は第 2 を入れ替える', () => {
    let p = toggleCharacterPick({ first: null, second: null }, 'a')
    expect(p).toEqual({ first: 'a', second: null })
    p = toggleCharacterPick(p, 'b')
    expect(p).toEqual({ first: 'a', second: 'b' })
    expect(toggleCharacterPick(p, 'c')).toEqual({ first: 'a', second: 'c' })
  })
  it('選んでいるカードをもう一度押すと外し、第 1 を外すと第 2 が繰り上がる', () => {
    expect(toggleCharacterPick({ first: 'a', second: 'b' }, 'a')).toEqual({ first: 'b', second: null })
    expect(toggleCharacterPick({ first: 'a', second: 'b' }, 'b')).toEqual({ first: 'a', second: null })
  })
})

describe('第 2 希望（character_second_choice）', () => {
  const chars = [{ id: 'a', name: '女将' }, { id: 'b', name: '画家' }]
  it('店舗の回答一覧は第 1・第 2 希望を併記し、おまかせも分かる', () => {
    expect(characterAnswerLabel({ c: 'a', character_second_choice: 'b' }, 'c', chars)).toBe('第 1 希望 女将／第 2 希望 画家')
    expect(characterAnswerLabel({ c: 'a' }, 'c', chars)).toBe('女将')
    expect(characterAnswerLabel({ c: 'おまかせ', character_second_choice: 'b' }, 'c', chars)).toBe('おまかせ（どのキャラクターでもよい）')
    expect(characterAnswerLabel({ character_second_choice: 'b' }, 'c', chars)).toBeNull()
  })
  it('キャラクターを出していない・第 1 希望が無い・おまかせのときは第 2 希望を送らない', () => {
    expect(stripHiddenSurveyAnswers([charQ, textQ], { c: 'a', character_second_choice: 'b', t: 'x' }, false)).toEqual({ c: 'a', character_second_choice: 'b', t: 'x' })
    expect(stripHiddenSurveyAnswers([charQ, textQ], { c: 'a', character_second_choice: 'b', t: 'x' }, true)).toEqual({ t: 'x' })
    expect(stripHiddenSurveyAnswers([charQ, textQ], { character_second_choice: 'b' }, false)).toEqual({})
    expect(stripHiddenSurveyAnswers([charQ, textQ], { c: 'おまかせ', character_second_choice: 'b' }, false)).toEqual({ c: 'おまかせ' })
  })
})
