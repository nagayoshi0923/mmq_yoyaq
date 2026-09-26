import { describe, expect, it } from 'vitest'
import {
  buildDiscordUserMentions,
} from '../../supabase/functions/_shared/discord-mentions'

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
