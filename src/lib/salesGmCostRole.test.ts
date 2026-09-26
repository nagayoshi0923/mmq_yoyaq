import { expect, it } from 'vitest'
import { salesGmCostRole } from './salesGmCostRole'
it('3人目以降に個別GM報酬を使用する', () => {
  expect(salesGmCostRole(undefined, 1)).toBe('main')
  expect(salesGmCostRole('sub', 2)).toBe('sub')
  expect(salesGmCostRole('sub', 3)).toBe('gm3')
  expect(salesGmCostRole(undefined, 5)).toBe('gm5')
  expect(salesGmCostRole('reception', 3)).toBe('reception')
})
