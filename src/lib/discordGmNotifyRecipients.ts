/**
 * Discord メンション組み立て（貸切GM通知など）
 * @here は共有チャンネルで担当外に届くため使わない。
 */
export function buildDiscordUserMentions(userIds: Array<string | null | undefined>): {
  mentionPrefix: string
  allowedMentions: { parse: []; users: string[] }
} {
  const users = [...new Set(
    userIds
      .filter((id): id is string => typeof id === 'string' && /^\d+$/.test(id.trim()))
      .map((id) => id.trim())
  )]
  return {
    mentionPrefix: users.length > 0 ? users.map((id) => `<@${id}>`).join(' ') : '',
    allowedMentions: { parse: [], users },
  }
}

export function resolveBookingScenarioMasterId(input: {
  scenario_master_id?: string | null
  scenario_id?: string | null
  reservation_scenario_master_id?: string | null
  reservation_scenario_id?: string | null
  isMasterId?: (id: string) => boolean
}): string | null {
  if (input.scenario_master_id) return input.scenario_master_id
  if (input.reservation_scenario_master_id) return input.reservation_scenario_master_id

  const candidates = [input.reservation_scenario_id, input.scenario_id].filter(
    (id): id is string => typeof id === 'string' && id.length > 0
  )
  for (const id of candidates) {
    if (!input.isMasterId || input.isMasterId(id)) return id
  }
  return null
}
