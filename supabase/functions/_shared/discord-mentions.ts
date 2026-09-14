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
