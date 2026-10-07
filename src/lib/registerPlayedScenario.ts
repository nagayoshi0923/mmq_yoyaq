import { customerPlayHistory } from './customerPlayHistory'
import { fetchPlayedReservations, resolvePlayedScenarioIds } from './playedStatus'
import { countManualPlayHistoryForCustomer, isManualPlayHistoryAtCap } from './manualPlayHistoryLimit'

/** Read all own identities before writing; every write retains the existing RPC authorization. */
export async function registerPlayedScenario(customerIds: string[], scenarioMasterId: string, title: string, playedAt: string | null, venue?: string | null): Promise<boolean> {
  const ids = [...new Set(customerIds)]
  if (!ids.length) throw new Error('顧客情報が見つかりません')
  const histories = await Promise.all(ids.map(id => customerPlayHistory.snapshot(id)))
  if (histories.some(history => !history.can_edit)) throw new Error('体験履歴を変更する権限を確認できませんでした')
  const reservations = (await Promise.all(ids.map(id => fetchPlayedReservations(id)))).flat()
  const underlyingPlayed = resolvePlayedScenarioIds(reservations, histories.flatMap(history => history.manual), []).has(scenarioMasterId)
  if (!underlyingPlayed) {
    if (isManualPlayHistoryAtCap(await countManualPlayHistoryForCustomer(ids[0]))) return false
    // Add before clearing overrides. Partial failures remain visible as failures and retries find this history.
    await customerPlayHistory.add(ids[0], { scenario_title: title, scenario_master_id: scenarioMasterId, played_at: playedAt, ...(venue === undefined ? {} : { venue }) })
  }
  for (const id of ids) await customerPlayHistory.removeOverride(id, scenarioMasterId)
  return true
}
