import { expect, it } from 'vitest'
import { reconcilePrivateBookingCandidates } from './reconcilePrivateBookingCandidates'
const candidate = { date: '2026-10-11', slot: { label: '夜', startTime: '19:30', endTime: '23:30' } }
it('fallback時刻と最新開始/終了時刻が異なれば再確認用の候補を返す', () => {
  const result = reconcilePrivateBookingCandidates([candidate], () => [{ label: '夜', startTime: '19:00', endTime: '23:00' }])
  expect(result).toEqual({ invalid: [], changed: true, updated: [{ ...candidate, slot: { label: '夜', startTime: '19:00', endTime: '23:00' } }] })
})
it('同じ時間帯でも終了時刻だけの変更を検出する', () => {
  expect(reconcilePrivateBookingCandidates([candidate], () => [{ ...candidate.slot, endTime: '22:30' }]).changed).toBe(true)
})
it('停止/競合で時間帯がなくなれば送信対象として受け付けない', () => {
  const result = reconcilePrivateBookingCandidates([candidate], () => [])
  expect(result.invalid).toEqual([candidate]); expect(result.changed).toBe(false)
})
it('再確認後は変更なしとなり同じ候補を送信できる', () => {
  const result = reconcilePrivateBookingCandidates([candidate], () => [candidate.slot])
  expect(result).toEqual({ invalid: [], changed: false, updated: [candidate] })
})
