import { describe, expect, it } from 'vitest'
import { canConfirmCasting, castingHeadcountNote, castingProgressFor, castingStage, deadlineLabel, duplicatedCharacters, isCastingConfirmed, preferenceLabel, rowName, surveyUsable, type CastingMember } from './castingModel'

const members: CastingMember[] = [
  { memberId: 'a', name: 'いちこ', isMe: true, isGuest: false },
  { memberId: 'b', name: '二郎', isMe: false, isGuest: false },
  { memberId: 'c', name: '三郎', isMe: false, isGuest: true },
]
const sys = (action: string) => ({ message: JSON.stringify({ type: 'system', action }) })

describe('配役の読み方', () => {
  it('確定済みか: 最後に決め方を選び直した後の「配役が確定しました」だけを見る', () => {
    expect(isCastingConfirmed([sys('character_method_selected'), { message: 'こんにちは' }, sys('character_assignment')])).toBe(true)
    expect(isCastingConfirmed([sys('character_assignment'), sys('character_method_selected')])).toBe(false)
    expect(castingStage('self', false)).toBe('collect')
    expect(castingStage('survey', true)).toBe('confirmed')
  })
  it('重なりがある・全員分そろっていないときは確定できない', () => {
    expect(duplicatedCharacters(members, { a: 'x', b: 'x', c: 'y' })).toEqual(['x'])
    expect(canConfirmCasting(members, { a: 'x', b: 'x', c: 'y' })).toBe(false)
    expect(canConfirmCasting(members, { a: 'x', b: 'y' })).toBe(false)
    expect(canConfirmCasting(members, { a: 'x', b: 'y', c: 'z' })).toBe(true)
  })
  it('作品の最低人数に満たないときは注意だけ（確定は止めない）', () => {
    expect(castingHeadcountNote(3, { min: 5, max: 5 })).toBe('登録メンバーは 3 人です（作品は 5 人）。登録していない同行者の配役は当日店舗が決めます')
    expect(castingHeadcountNote(3, { min: 4, max: 5 })).toBe('登録メンバーは 3 人です（作品は 4〜5 人）。登録していない同行者の配役は当日店舗が決めます')
    expect(castingHeadcountNote(4, { min: 4, max: 5 })).toBeNull()
    expect(castingHeadcountNote(3, { min: null, max: 5 })).toBeNull()
  })
  it('表示名とカードの下の行', () => {
    expect(rowName(members[0])).toBe('いちこ（あなた）')
    expect(rowName(members[2])).toBe('三郎（ゲスト）')
    expect(preferenceLabel('x', members, { a: 'x' })).toBe('あなたの希望')
    expect(preferenceLabel('x', members, { b: 'x', c: 'x' })).toBe('二郎・三郎が希望')
    expect(preferenceLabel('x', members, { a: 'x', b: 'x' })).toBe('あなた・二郎が希望')
    expect(preferenceLabel('y', members, {})).toBe('まだ誰も')
    expect(deadlineLabel('2026-11-05T14:59:59.999Z')).toBe('11/5(木)')
  })
  it('アンケートが使えるか・判定入力（キャラクターがいなければ null）', () => {
    expect(surveyUsable({ survey_enabled: true, external: false, question_count: 2 })).toBe(true)
    expect(surveyUsable({ survey_enabled: true, external: true, question_count: 2 })).toBe(false)
    expect(surveyUsable({ survey_enabled: true, question_count: 0 })).toBe(false)
    const status = { survey_enabled: true, question_count: 1, casting_confirmed: false }
    expect(castingProgressFor({ method: 'self', assignments: { a: 'x', c: 'y' }, members, characterCount: 4, status }))
      .toEqual({ method: 'self', needsChoice: true, confirmed: false, myPicked: true, picked: 2, total: 3 })
    expect(castingProgressFor({ method: null, assignments: {}, members, characterCount: 0, status })).toBeNull()
  })
})
