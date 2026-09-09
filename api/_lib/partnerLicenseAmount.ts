/**
 * 契約店舗が支払う既定単価。
 * 作者へ管理店舗が払う額（license_amount / franchise_license_amount）とは別。
 */
export function partnerStorePayAmount(scenario: {
  external_license_amount?: number | null
  license_amount?: number | null
}) {
  return scenario.external_license_amount || scenario.license_amount || 0
}
