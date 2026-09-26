import { resolveSetting, type SettingLayers } from './settings-inheritance.ts'
export interface PreparationSettings {
  organization: number | null
  stores: Record<string, number | null>
  scenarios: Record<string, number | null>
  performances: Record<string, number | null>
}
export interface PreparationContext { storeId?: string | null; scenarioId?: string | null; scenarioMasterId?: string | null; eventId?: string | null }
export function resolvePreparationMinutes(data: PreparationSettings, context: PreparationContext): number {
  const scenario = context.scenarioId && Object.prototype.hasOwnProperty.call(data.scenarios, context.scenarioId) ? context.scenarioId : context.scenarioMasterId
  const layers: SettingLayers = {
    organization: { preparation_minutes: data.organization },
    store: { preparation_minutes: context.storeId ? data.stores[context.storeId] : null },
    scenario: { preparation_minutes: scenario ? data.scenarios[scenario] : null },
    performance: { preparation_minutes: context.eventId ? data.performances[context.eventId] : null },
  }
  return Number(resolveSetting('preparation_minutes', 60, layers).value)
}
