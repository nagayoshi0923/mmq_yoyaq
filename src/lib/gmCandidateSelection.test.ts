import { describe, expect, it } from 'vitest'
import { candidateOrdersFromIndexes, candidateIndexesFromOrders, hasUnresolvedCandidateIndexes, candidateResponseIndex } from './gmCandidateSelection'
describe('GM回答の保存位置と表示番号', () => {
  it('複数回答を読込→再保存しても候補が欠けず、位置がずれない', () => {
    const candidates = [{order:1},{order:2},{order:3}]
    expect(candidateIndexesFromOrders(candidates,candidateOrdersFromIndexes(candidates,[0,2]))).toEqual([0,2])
  })
  it('欠番や並び順が異なる候補でもDiscord・手動と同じ配列位置を保存する', () => {
    const candidates = [{order:3},{order:8},{order:2}]
    expect(candidateOrdersFromIndexes(candidates,[0,2])).toEqual([3,2])
    expect(candidateIndexesFromOrders(candidates,[3,2])).toEqual([0,2])
  })
  it('削除された候補や重複表示番号を別の日時として保存しない', () => {
    expect(()=>candidateIndexesFromOrders([{order:1}],[2])).toThrow('選び直して')
    expect(()=>candidateIndexesFromOrders([{order:1},{order:1}],[1])).toThrow('選び直して')
    expect(hasUnresolvedCandidateIndexes([{order:1}],[0,3])).toBe(true)
    expect(candidateOrdersFromIndexes([{order:1}],[0,3])).toEqual([1])
  })
})

it('管理画面の復元候補には保存位置を推測して割り当てない', () => {
  const restored = {order:1,gm_response_index:null}
  const current = {order:8,gm_response_index:2}
  expect(candidateResponseIndex(restored,[restored,current])).toBeNull()
  expect(candidateResponseIndex(current,[restored,current])).toBe(2)
  expect(candidateOrdersFromIndexes([],[0])).toEqual([])
  expect(hasUnresolvedCandidateIndexes([],[0])).toBe(true)
})
