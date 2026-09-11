import { describe, expect, it } from 'vitest'
import { isPrivateReminder, privateReminderDefault, selectPrivateReminder } from '../../supabase/functions/_shared/reminder-kind'
import { TEMPLATE_CONFIGS } from './templateRegistry'

describe('貸切・オープンのリマインド分離', () => {
  it('保存済みの公演・予約情報から種別を判定する', () => {
    expect(isPrivateReminder({}, {category: 'open'})).toBe(false)
    expect(isPrivateReminder({}, {category: 'private'})).toBe(true)
    expect(isPrivateReminder({}, {is_private_booking: true})).toBe(true)
    expect(isPrivateReminder({}, {is_private_request: true})).toBe(true)
    expect(isPrivateReminder({private_group_id: 'group'}, null)).toBe(true)
    expect(isPrivateReminder({reservation_source: 'private_booking'}, null)).toBe(true)
    expect(isPrivateReminder({reservation_source: 'web_private'}, null)).toBe(true)
  })
  it('店舗設定を優先し、他店舗の文面へ勝手に切り替えない', () => {
    const rows = [{store_id:'a',private_reminder_template:'A貸切'}, {store_id:'b',private_reminder_template:'B貸切'}, {store_id:null,private_reminder_template:'組織貸切'}]
    expect(selectPrivateReminder(rows,'a')).toBe('A貸切')
    expect(selectPrivateReminder(rows,'c')).toBe('組織貸切')
    expect(selectPrivateReminder(rows.slice(0,2),'c')).toBeNull()
    expect(selectPrivateReminder([{store_id:'a',private_reminder_template:' '}],'a')).toBeNull()
  })
  it('専用の設定キーと貸切カテゴリを保持する', () => {
    expect(TEMPLATE_CONFIGS.find(x=>x.key==='private_reminder_template')?.category).toBe('private')
    expect(TEMPLATE_CONFIGS.find(x=>x.key==='reminder_template')?.title).toBe('オープン公演リマインドメール')
  })
  it('貸切の既定文面にはオープンの残席・開催判断を混ぜない', () => {
    const text=privateReminderDefault('会社','電話','メール')
    expect(text).toContain('貸切公演'); expect(text).toContain('{day_message}')
    expect(text).not.toMatch(/残席|募集|開催判断/)
  })
})
