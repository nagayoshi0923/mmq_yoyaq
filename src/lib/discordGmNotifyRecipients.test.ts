import { describe, expect, it } from 'vitest'
import {
  buildDiscordUserMentions,
  resolveBookingScenarioMasterId,
} from './discordGmNotifyRecipients'

describe('buildDiscordUserMentions', () => {
  it('discord_user_id があるときだけ個別メンションし @here は使わない', () => {
    const result = buildDiscordUserMentions(['123', null, ' 456 ', 'abc', '123'])
    expect(result.mentionPrefix).toBe('<@123> <@456>')
    expect(result.allowedMentions).toEqual({ parse: [], users: ['123', '456'] })
  })

  it('有効な user id が無いときはメンションなし', () => {
    const result = buildDiscordUserMentions([null, '', 'not-a-snowflake'])
    expect(result.mentionPrefix).toBe('')
    expect(result.allowedMentions).toEqual({ parse: [], users: [] })
  })
})

describe('resolveBookingScenarioMasterId', () => {
  it('scenario_master_id を最優先する', () => {
    expect(resolveBookingScenarioMasterId({
      scenario_master_id: 'master-1',
      scenario_id: 'org-scenario-1',
      reservation_scenario_master_id: 'master-2',
    })).toBe('master-1')
  })

  it('payload に無くても reservation.scenario_master_id を使う', () => {
    expect(resolveBookingScenarioMasterId({
      scenario_id: 'org-scenario-1',
      reservation_scenario_master_id: 'master-2',
    })).toBe('master-2')
  })

  it('org_scenario.id を master と誤認しない（isMasterId で判定）', () => {
    expect(resolveBookingScenarioMasterId({
      scenario_id: 'org-scenario-1',
      reservation_scenario_id: 'org-scenario-1',
      isMasterId: (id) => id === 'master-1',
    })).toBeNull()

    expect(resolveBookingScenarioMasterId({
      scenario_id: 'master-1',
      isMasterId: (id) => id === 'master-1',
    })).toBe('master-1')
  })
})
