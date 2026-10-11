/**
 * チャット写真の容量の表示（社長決定 2026-10-11）。管理画面に「総容量と今月の増加量」を出し、
 * サイト全体が 50GB を超えたら注意を出す。数値は DB の private_group_photo_storage_usage。
 */
export interface PhotoStorageUsage {
  org_bytes: number
  org_month_bytes: number
  org_photo_count: number
  org_month_photo_count: number
  total_bytes: number
  /** 大きさが記録されていない写真の数（記録前の写真で実体が見つからないなど） */
  unknown_count: number
  month_start: string
  warn_bytes: number
}

/** 「1.2 GB」「850 MB」「12 KB」（1024 区切り。Storage の表示に合わせる） */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  const digits = value >= 100 || i <= 1 ? 0 : 1
  return `${value.toFixed(digits)} ${units[i]}`
}

export interface PhotoStorageView {
  total: string
  month: string
  count: string
  /** サイト全体（組織の合計と違うときだけ） */
  siteTotal: string | null
  /** 50GB を超えたら注意の文 */
  warning: string | null
  /** 目安に対する割合（0〜100） */
  percent: number
  limit: string
}

export function photoStorageView(usage: PhotoStorageUsage): PhotoStorageView {
  const site = Number(usage.total_bytes) || 0
  const org = Number(usage.org_bytes) || 0
  const limit = Number(usage.warn_bytes) || 50 * 1024 ** 3
  const over = site > limit
  return {
    total: formatBytes(org),
    month: `+${formatBytes(Number(usage.org_month_bytes) || 0)}`,
    count: `${(Number(usage.org_photo_count) || 0).toLocaleString()} 枚（今月 +${(Number(usage.org_month_photo_count) || 0).toLocaleString()} 枚）`,
    siteTotal: site !== org ? formatBytes(site) : null,
    warning: over
      ? `チャット写真の容量が ${formatBytes(limit)} を超えました（サイト全体 ${formatBytes(site)}）。Storage の料金が増えます。古い写真の扱い（保存期間）を決めてください。`
      : null,
    percent: Math.min(100, Math.round((site / limit) * 100)),
    limit: formatBytes(limit),
  }
}
