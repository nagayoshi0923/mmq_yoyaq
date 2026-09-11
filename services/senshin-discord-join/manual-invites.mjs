// MMQ予約に紐付かない単発公演の招待。Flyの環境設定でのみ追加する。
export function withManualInvites(bookingMap, raw = '') {
  if (!raw.trim()) return bookingMap
  const entries = JSON.parse(raw)
  if (!Array.isArray(entries) || entries.length > 20) throw new Error('manual invites must be an array of at most 20 entries')
  const out = { ...bookingMap }
  for (const entry of entries) {
    if (!entry || !/^[A-Za-z0-9_-]{2,100}$/.test(entry.code || '') ||
        !/^\d{17,22}$/.test(entry.channelId || '') ||
        typeof entry.label !== 'string' || !entry.label.trim() || entry.label.length > 120) {
      throw new Error('invalid manual invite')
    }
    if (Object.hasOwn(out, entry.code)) throw new Error('duplicate manual invite code')
    Object.defineProperty(out, entry.code, {
      value: { channelId: entry.channelId, label: entry.label },
      enumerable: true, writable: true, configurable: true,
    })
  }
  return out
}
