import { describe, expect, it } from 'vitest'

import { gmRoleLabel } from './gmRoleLabel'

describe('GM回答の担当区分の表示（#827）', () => {
  it('作品の担当設定のメイン・サブを表示する', () => {
    expect(gmRoleLabel('main_only')).toBe('メイン')
    expect(gmRoleLabel('sub_only')).toBe('サブ')
    expect(gmRoleLabel('main_and_sub')).toBe('メイン・サブ')
  })
  it('担当の設定が無い人・どちらも付いていない人は「担当未設定」', () => {
    expect(gmRoleLabel('none')).toBe('担当未設定')
    expect(gmRoleLabel(undefined)).toBe('担当未設定')
  })
})
