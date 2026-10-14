/** 希望店舗を選んだときは、その店舗のどれかで上演できる作品だけ（available_stores が空なら全店舗） */
export function scenariosForStores<T extends { available_stores?: string[] | null }>(scenarios: readonly T[], storeIds: readonly string[]): T[] {
  if (storeIds.length === 0) return [...scenarios]
  return scenarios.filter((s) => !s.available_stores || s.available_stores.length === 0 || s.available_stores.some((id) => storeIds.includes(id)))
}
