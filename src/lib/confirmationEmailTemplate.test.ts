import { describe, expect, it } from 'vitest'
import { confirmationSourceLabel, pickConfirmationEmailTemplate } from './confirmationEmailTemplate'

describe('pickConfirmationEmailTemplate', () => {
  it('公演上書きを最優先する', () => {
    const result = pickConfirmationEmailTemplate({
      eventTemplate: '公演用',
      scenarioTemplate: '作品用',
      storeTemplate: '店舗用',
    })
    expect(result).toEqual({ template: '公演用', source: 'event' })
  })

  it('公演が空なら作品上書きを使う', () => {
    const result = pickConfirmationEmailTemplate({
      eventTemplate: '  ',
      scenarioTemplate: '作品用',
      storeTemplate: '店舗用',
    })
    expect(result).toEqual({ template: '作品用', source: 'scenario' })
  })

  it('公演・作品が未設定なら店舗テンプレを使う', () => {
    const result = pickConfirmationEmailTemplate({
      eventTemplate: null,
      scenarioTemplate: '',
      storeTemplate: '店舗用',
    })
    expect(result).toEqual({ template: '店舗用', source: 'store' })
  })

  it('どれも無いときは default', () => {
    const result = pickConfirmationEmailTemplate({
      eventTemplate: null,
      scenarioTemplate: null,
      storeTemplate: ' \n',
    })
    expect(result).toEqual({ template: null, source: 'default' })
  })

  it('店舗ラベルを貸切用に差し替えられる', () => {
    expect(confirmationSourceLabel('store', '店舗の貸切確定テンプレ')).toBe('店舗の貸切確定テンプレ')
    expect(confirmationSourceLabel('scenario', '店舗の貸切確定テンプレ')).toBe('この作品の上書き')
  })
})
