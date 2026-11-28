// 届かないと決まっている宛先（予約用の名前のドメイン）。
// デモ参加者（demo@example.com）などへリマインドを送ろうとすると、送信サービスが 422 で断り
// 「送れなかった通知」として数えられる。存在しない宛先へは送らない（2026-11-28）。
const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org']
const RESERVED_TLDS = ['example', 'invalid', 'test', 'localhost']

export function isUndeliverableEmail(value: unknown): boolean {
  if (typeof value !== 'string') return true
  const address = value.trim().toLowerCase()
  const at = address.lastIndexOf('@')
  if (at <= 0 || at === address.length - 1) return true
  const domain = address.slice(at + 1)
  if (RESERVED_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`))) return true
  const tld = domain.split('.').pop() ?? ''
  return RESERVED_TLDS.includes(tld)
}
