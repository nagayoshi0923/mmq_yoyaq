/** 参加・見学・受付を除いたGMの配置順で、3人目以降の個別報酬を選ぶ。 */
export function salesGmCostRole(role: string | undefined, ordinal: number): string {
  if ((!role || role === 'sub') && ordinal >= 3) return `gm${ordinal}`
  return role || (ordinal === 1 ? 'main' : 'sub')
}
