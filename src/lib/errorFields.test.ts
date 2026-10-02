import { describe, expect, it } from 'vitest'
import { getErrorCode, getErrorField, getErrorMessage } from './errorFields'

describe('errorFields', () => {
  it('Error・文字列・message を持つオブジェクトからメッセージを取り、取れなければ空文字', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom')
    expect(getErrorMessage('plain')).toBe('plain')
    expect(getErrorMessage({ message: 'from object', code: '23505' })).toBe('from object')
    expect(getErrorMessage({ message: 42 })).toBe('')
    expect(getErrorMessage(null)).toBe('')
    expect(getErrorMessage(undefined)).toBe('')
  })
  it('コードは文字列のときだけ返す', () => {
    expect(getErrorCode({ code: '23505' })).toBe('23505')
    expect(getErrorCode({ code: 23505 })).toBeUndefined()
    expect(getErrorCode(new Error('x'))).toBeUndefined()
    expect(getErrorCode(null)).toBeUndefined()
  })
  it('任意の項目を取り、オブジェクトでなければ undefined', () => {
    expect(getErrorField({ status: 409 }, 'status')).toBe(409)
    expect(getErrorField('x', 'status')).toBeUndefined()
  })
})
