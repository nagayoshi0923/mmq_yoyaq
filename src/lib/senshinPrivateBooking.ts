/** 戦塵のレガストリア。Discord チャンネル自動作成の対象 */
export const SENSHIN_SCENARIO_MASTER_ID = 'ebc32bc6-31b6-4866-b3a9-ae92a244a82e'

export function isSenshinPrivateBooking(input: {
  scenario_master_id?: string | null
  scenario_title?: string | null
}): boolean {
  if (input.scenario_master_id === SENSHIN_SCENARIO_MASTER_ID) return true
  return (input.scenario_title || '').includes('戦塵のレガストリア')
}
