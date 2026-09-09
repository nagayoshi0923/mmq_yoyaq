import { describe, it, expect } from 'vitest'
import { computeAssignmentDiff } from './assignmentDiff'

describe('computeAssignmentDiff（担当減少ガードの純粋ロジック）', () => {
  it('部分的に欠けた配列は removed を返す（減少ガードが発火する）', () => {
    const diff = computeAssignmentDiff(['a', 'b', 'c'], ['a', 'b'])
    expect(diff.existingCount).toBe(3)
    expect(diff.incomingCount).toBe(2)
    expect(diff.removed).toEqual(['c'])
    expect(diff.added).toEqual([])
  })

  it('1件でも減れば removed に出る', () => {
    const diff = computeAssignmentDiff(['a', 'b'], ['a'])
    expect(diff.removed).toEqual(['b'])
  })

  it('全件が同じなら removed も added も空（ガード非発火）', () => {
    const diff = computeAssignmentDiff(['a', 'b'], ['b', 'a'])
    expect(diff.removed).toEqual([])
    expect(diff.added).toEqual([])
  })

  it('増える分は added、減る分が無ければガードは発火しない', () => {
    const diff = computeAssignmentDiff(['a'], ['a', 'b', 'c'])
    expect(diff.removed).toEqual([])
    expect(diff.added).toEqual(['b', 'c'])
  })

  it('入れ替え（1件外して1件足す）は removed と added の両方が出る', () => {
    const diff = computeAssignmentDiff(['a', 'b'], ['a', 'c'])
    expect(diff.removed).toEqual(['b'])
    expect(diff.added).toEqual(['c'])
  })

  it('空配列での更新は既存全件が removed（全消しはガード対象）', () => {
    const diff = computeAssignmentDiff(['a', 'b', 'c'], [])
    expect(diff.existingCount).toBe(3)
    expect(diff.incomingCount).toBe(0)
    expect(diff.removed).toEqual(['a', 'b', 'c'])
    expect(diff.added).toEqual([])
  })

  it('重複を含む入力は集合として扱う', () => {
    const diff = computeAssignmentDiff(['a', 'a', 'b'], ['a', 'a'])
    expect(diff.existingCount).toBe(2)
    expect(diff.incomingCount).toBe(1)
    expect(diff.removed).toEqual(['b'])
  })

  it('既存が空なら removed は空（新規スタッフへの初回付与でガードは邪魔しない）', () => {
    const diff = computeAssignmentDiff([], ['a', 'b'])
    expect(diff.removed).toEqual([])
    expect(diff.added).toEqual(['a', 'b'])
  })
})
