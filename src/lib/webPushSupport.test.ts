// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { detectPushSupport, isAppleMobile, isPromptSnoozed, isPushServiceWorker, markPromptPending, snoozePrompt, takePromptPending } from './webPushSupport'

const base = { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', maxTouchPoints: 0, standalone: false, hasPushManager: true, hasServiceWorker: true, hasNotification: true, hasKey: true }
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'

describe('通知が使える端末か', () => {
  it('PC の Chrome は使える', () => {
    expect(detectPushSupport(base)).toBe('supported')
  })
  it('鍵が無い環境では出さない', () => {
    expect(detectPushSupport({ ...base, hasKey: false })).toBe('unsupported')
  })
  it('iPhone の Safari はホーム画面に追加の案内。追加して開けば使える', () => {
    expect(detectPushSupport({ ...base, userAgent: iphone, maxTouchPoints: 5, hasPushManager: false })).toBe('ios_needs_home_screen')
    expect(detectPushSupport({ ...base, userAgent: iphone, maxTouchPoints: 5, standalone: true })).toBe('supported')
  })
  it('iPad（Mac と名乗る）も iPhone と同じ', () => {
    expect(isAppleMobile('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 5)).toBe(true)
    expect(isAppleMobile('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 0)).toBe(false)
  })
  it('プッシュの無いブラウザは使えない', () => {
    expect(detectPushSupport({ ...base, hasPushManager: false })).toBe('unsupported')
  })
  it('残すサービスワーカーは /sw.js だけ', () => {
    expect(isPushServiceWorker('https://mmq.game/sw.js')).toBe(true)
    expect(isPushServiceWorker('https://mmq.game/service-worker.js')).toBe(false)
    expect(isPushServiceWorker('')).toBe(false)
  })
})

describe('案内カードを出す時機', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear() })
  it('「今はしない」から 30 日は出さない', () => {
    const now = Date.UTC(2026, 9, 10)
    snoozePrompt(now)
    expect(isPromptSnoozed(now + 29 * 86400000)).toBe(true)
    expect(isPromptSnoozed(now + 31 * 86400000)).toBe(false)
  })
  it('参加した直後の印は 1 回だけ読める', () => {
    markPromptPending('g1')
    expect(takePromptPending('g2')).toBe(false)
    expect(takePromptPending('g1')).toBe(true)
    expect(takePromptPending('g1')).toBe(false)
  })
})
