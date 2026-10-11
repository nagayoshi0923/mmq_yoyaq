import { describe, expect, it } from 'vitest'
import { PUSH_BLOCKED_STEPS, detectPushHelpDevice } from './pushBlockedHelp'

describe('通知が止められているときの手順（点検 46）', () => {
  it('端末を見分ける', () => {
    expect(detectPushHelpDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe('iphone')
    expect(detectPushHelpDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('iphone')
    expect(detectPushHelpDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5)).toBe('android')
    expect(detectPushHelpDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0)).toBe('pc')
  })
  it('iPhone は設定アプリ、Android は Chrome のサイトの設定', () => {
    expect(PUSH_BLOCKED_STEPS.iphone.join('')).toContain('「設定」アプリ')
    expect(PUSH_BLOCKED_STEPS.android.join('')).toContain('サイトの設定')
  })
})
