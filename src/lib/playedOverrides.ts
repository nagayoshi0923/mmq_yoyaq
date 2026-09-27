/** Personal played-status overrides, shared by customer and CRM screens. */
import { customerPlayHistory } from './customerPlayHistory'

/** A read failure must not silently restore every previously excluded work. */
export async function fetchPlayedOverrideIds(customerId: string): Promise<Set<string>> {
  const snapshot = await customerPlayHistory.snapshot(customerId)
  return new Set(snapshot.overrides.map(row => row.scenario_master_id).filter(Boolean))
}
export async function addPlayedOverride(customerId: string, scenarioMasterId: string, reason?: string): Promise<void> {
  await customerPlayHistory.addOverride(customerId, scenarioMasterId, reason)
}
/** Preserve the removed/not-present distinction to prevent duplicate registration. */
export async function removePlayedOverride(customerId: string, scenarioMasterId: string): Promise<boolean> {
  return customerPlayHistory.removeOverride(customerId, scenarioMasterId)
}
