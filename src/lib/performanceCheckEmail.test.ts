import { describe, expect, it } from 'vitest'
import { customTemplateToHtml, formatJudgmentDate, formatJudgmentTime, resolveRecipientEmail } from '../../supabase/functions/_shared/performance-check-email'

describe('中止判定のお客様向けメールの共通部分', () => {
  it('日付は日本時間の「年月日」、時刻は HH:MM', () => {
    expect(formatJudgmentDate('2026-10-05')).toBe('2026年10月5日')
    expect(formatJudgmentTime('19:00:00')).toBe('19:00')
  })

  it('店舗の文面は 1 行ずつ段落にし、空行は空白の段落にする', () => {
    const html = customTemplateToHtml('山田 様\n\n中止です')
    expect(html).toContain('<p style="margin: 0.5em 0;">山田 様</p>\n<p style="margin: 0.5em 0;">&nbsp;</p>\n<p style="margin: 0.5em 0;">中止です</p>')
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
  })

  it('送り先は予約のメール、無ければ名前が一致するスタッフのメール', () => {
    const staff = [{ name: '松井', display_name: 'まつい', email: 'matsui@example.invalid' }]
    expect(resolveRecipientEmail({ customer_email: 'a@example.invalid', customer_name: '松井様' }, staff)).toEqual({ email: 'a@example.invalid', fromStaff: false })
    expect(resolveRecipientEmail({ customer_email: null, customer_name: '松井様' }, staff)).toEqual({ email: 'matsui@example.invalid', fromStaff: true })
    expect(resolveRecipientEmail({ customer_email: '', customer_name: 'まつい' }, staff)).toEqual({ email: 'matsui@example.invalid', fromStaff: true })
    expect(resolveRecipientEmail({ customer_email: null, customer_name: '佐藤様' }, staff)).toEqual({ email: null, fromStaff: false })
    expect(resolveRecipientEmail({ customer_email: null, customer_name: '松井様' }, null)).toEqual({ email: null, fromStaff: false })
  })
})
