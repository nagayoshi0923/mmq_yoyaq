/**
 * 端末が通知を止めているとき（ブラウザの許可が「拒否」）の、端末ごとの許可の手順（点検 46）。
 * 以前は「ブラウザの設定（サイトの通知）から許可してください」だけで、どこを開けばよいか分からなかった。
 */
import { isAppleMobile } from '@/lib/webPushSupport'

export type PushHelpDevice = 'iphone' | 'android' | 'pc'

export const PUSH_HELP_DEVICES: ReadonlyArray<{ id: PushHelpDevice; label: string }> = [
  { id: 'iphone', label: 'iPhone' },
  { id: 'android', label: 'Android' },
  { id: 'pc', label: 'パソコン' },
]

export function detectPushHelpDevice(userAgent: string, maxTouchPoints: number): PushHelpDevice {
  if (isAppleMobile(userAgent, maxTouchPoints)) return 'iphone'
  if (/Android/i.test(userAgent)) return 'android'
  return 'pc'
}

export const PUSH_BLOCKED_STEPS: Record<PushHelpDevice, string[]> = {
  iphone: [
    'ホーム画面の「設定」アプリを開く',
    '「通知」→ 一覧から「MMQ」を選ぶ',
    '「通知を許可」をオンにする',
    'ホーム画面の MMQ から開き直し、右上の ⋮ で「通知」をオンにする',
  ],
  android: [
    'Chrome のアドレスバーの左にあるマーク（鍵や設定のマーク）を押す',
    '「権限」または「通知」を押す',
    '「許可」にする（見当たらないときは Chrome の ⋮ →「設定」→「サイトの設定」→「通知」）',
    'このページを開き直し、右上の ⋮ で「通知」をオンにする',
  ],
  pc: [
    'アドレスバーの左にあるマーク（鍵や設定のマーク）を押す',
    '「通知」を「許可」にする',
    'このページを再読み込みし、右上の ⋮ で「通知」をオンにする',
  ],
}
