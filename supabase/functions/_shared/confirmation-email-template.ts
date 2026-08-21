/**
 * 予約確定 / 貸切確定メール本文の解決。src/lib/confirmationEmailTemplate.ts と同じ優先順。
 * 優先: 公演上書き → 作品上書き → 店舗テンプレ。空文字は未設定。
 */

export type ConfirmationTemplateSource = 'event' | 'scenario' | 'store' | 'default'

export type OverrideTemplateKind = 'reservation' | 'private'

function isSet(value?: string | null): boolean {
  return Boolean(value?.trim())
}

export function pickConfirmationEmailTemplate(input: {
  eventTemplate?: string | null
  scenarioTemplate?: string | null
  storeTemplate?: string | null
}): { template: string | null; source: ConfirmationTemplateSource } {
  if (isSet(input.eventTemplate)) {
    return { template: input.eventTemplate!.trim(), source: 'event' }
  }
  if (isSet(input.scenarioTemplate)) {
    return { template: input.scenarioTemplate!.trim(), source: 'scenario' }
  }
  if (isSet(input.storeTemplate)) {
    return { template: input.storeTemplate!.trim(), source: 'store' }
  }
  return { template: null, source: 'default' }
}

type OverrideClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => any
    }
  }
}

export async function loadOverrideTemplates(
  client: OverrideClient,
  input: {
    organizationId?: string | null
    scheduleEventId?: string | null
    scenarioMasterId?: string | null
    organizationScenarioId?: string | null
  }
): Promise<{
  eventReservation: string | null
  eventPrivate: string | null
  scenarioReservation: string | null
  scenarioPrivate: string | null
}> {
  let eventReservation: string | null = null
  let eventPrivate: string | null = null
  let scenarioReservation: string | null = null
  let scenarioPrivate: string | null = null
  let orgScenarioId = input.organizationScenarioId ?? null
  let masterId = input.scenarioMasterId ?? null
  const orgId = input.organizationId ?? null

  if (input.scheduleEventId) {
    let eventQuery = client
      .from('schedule_events')
      .select('reservation_confirmation_template, private_confirm_template, organization_scenario_id, scenario_master_id, organization_id')
      .eq('id', input.scheduleEventId)
    if (orgId) eventQuery = eventQuery.eq('organization_id', orgId)
    const { data: eventRow } = await eventQuery.maybeSingle()
    const eventOrgOk = !orgId || !eventRow?.organization_id || eventRow.organization_id === orgId
    if (eventRow && eventOrgOk) {
      eventReservation = eventRow.reservation_confirmation_template ?? null
      eventPrivate = eventRow.private_confirm_template ?? null
      orgScenarioId = orgScenarioId || eventRow.organization_scenario_id || null
      masterId = masterId || eventRow.scenario_master_id || null
    }
  }

  if (orgScenarioId) {
    let scenarioQuery = client
      .from('organization_scenarios')
      .select('reservation_confirmation_template, private_confirm_template, organization_id, scenario_master_id')
      .eq('id', orgScenarioId)
    if (orgId) scenarioQuery = scenarioQuery.eq('organization_id', orgId)
    const { data: scenarioRow } = await scenarioQuery.maybeSingle()
    const scenarioOrgOk = !orgId || !scenarioRow?.organization_id || scenarioRow.organization_id === orgId
    if (scenarioRow && scenarioOrgOk) {
      scenarioReservation = scenarioRow.reservation_confirmation_template ?? null
      scenarioPrivate = scenarioRow.private_confirm_template ?? null
      masterId = masterId || scenarioRow.scenario_master_id || null
    }
  }

  const needFallback = (!isSet(scenarioReservation) || !isSet(scenarioPrivate)) && masterId && orgId
  if (needFallback) {
    const { data: byMaster } = await client
      .from('organization_scenarios')
      .select('reservation_confirmation_template, private_confirm_template, organization_id')
      .eq('scenario_master_id', masterId)
      .eq('organization_id', orgId)
      .maybeSingle()
    if (byMaster) {
      if (!isSet(scenarioReservation)) scenarioReservation = byMaster.reservation_confirmation_template ?? null
      if (!isSet(scenarioPrivate)) scenarioPrivate = byMaster.private_confirm_template ?? null
    }
  }

  return { eventReservation, eventPrivate, scenarioReservation, scenarioPrivate }
}

export function pickOverrideTemplate(
  kind: OverrideTemplateKind,
  overrides: {
    eventReservation: string | null
    eventPrivate: string | null
    scenarioReservation: string | null
    scenarioPrivate: string | null
  },
  storeTemplate?: string | null
) {
  return pickConfirmationEmailTemplate(
    kind === 'private'
      ? {
          eventTemplate: overrides.eventPrivate,
          scenarioTemplate: overrides.scenarioPrivate,
          storeTemplate,
        }
      : {
          eventTemplate: overrides.eventReservation,
          scenarioTemplate: overrides.scenarioReservation,
          storeTemplate,
        }
  )
}
