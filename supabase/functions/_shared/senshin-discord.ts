export const SENSHIN_SCENARIO_MASTER_ID = 'ebc32bc6-31b6-4866-b3a9-ae92a244a82e'

export const SENSHIN_DISCORD = {
  guildId: '1466422091598266380',
  categoryBefore: '1540444750031626451',
  categoryAfter: '1540444751860334602',
  categorySpectate: '1540444754108485632',
  gmContactChannelId: '1478783425010995404',
  adminRoleId: '1540238720274530404',
  secretaryRoleId: '1540305923468165133',
} as const

const VIEW_CHANNEL = 1024
const SEND_MESSAGES = 2048
const READ_MESSAGE_HISTORY = 65536
const CHANNEL_VIEW = VIEW_CHANNEL + SEND_MESSAGES + READ_MESSAGE_HISTORY

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

export function isSenshinScenario(masterId?: string | null, title?: string | null): boolean {
  if (masterId === SENSHIN_SCENARIO_MASTER_ID) return true
  return (title || '').includes('戦塵のレガストリア')
}

export function subtractMinutes(hhmm: string, minutes: number): { hour: number; minute: number; label: string; compact: string } {
  const [h, m] = (hhmm || '00:00').slice(0, 5).split(':').map((n) => parseInt(n, 10))
  const total = Math.max(0, (h || 0) * 60 + (m || 0) - minutes)
  const hour = Math.floor(total / 60)
  const minute = total % 60
  const label = minute === 0 ? `${hour}時` : minute === 30 ? `${hour}時半` : `${hour}時${minute}分`
  const compact = `${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}`
  return { hour, minute, label, compact }
}

export function storeLabelForChannel(name?: string | null, shortName?: string | null): string {
  const short = (shortName || '').trim()
  if (short) return short.replace(/^クインズワルツ/, '')
  const full = (name || '').trim().replace(/^クインズワルツ/, '')
  return full || '大塚店'
}

export function buildSenshinChannelNames(input: {
  eventDate: string
  startTime: string
  storeName?: string | null
  storeShortName?: string | null
}): { playerName: string; spectatorName: string; roleName: string; weekday: string } {
  const ymd = input.eventDate.slice(0, 10)
  const [y, mo, d] = ymd.split('-')
  // その暦日 12:00 JST = 03:00 UTC。getUTCDay がその曜日。
  const jstNoonUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), 3, 0, 0)
  const wd = WEEKDAYS[new Date(jstNoonUtc).getUTCDay()]
  const doors = subtractMinutes(input.startTime, 30)
  const store = storeLabelForChannel(input.storeName, input.storeShortName)
  const playerName = `${ymd}${wd}${doors.label}開場${store}`
  return {
    playerName,
    spectatorName: `${playerName}-観戦用`,
    roleName: `${y}${mo}${d}-${doors.compact}`,
    weekday: wd,
  }
}

export function categoryOverwrites(guildId: string) {
  return [
    { id: guildId, type: 0, allow: '0', deny: String(VIEW_CHANNEL) },
    { id: SENSHIN_DISCORD.adminRoleId, type: 0, allow: String(VIEW_CHANNEL), deny: '0' },
    { id: SENSHIN_DISCORD.secretaryRoleId, type: 0, allow: String(VIEW_CHANNEL), deny: '0' },
  ]
}

export function playerChannelOverwrites(guildId: string, dateRoleId: string) {
  return [
    ...categoryOverwrites(guildId),
    { id: dateRoleId, type: 0, allow: String(CHANNEL_VIEW), deny: '0' },
  ]
}

export function spectatorChannelOverwrites(guildId: string) {
  return categoryOverwrites(guildId)
}

export function gmMemberOverwrite(userId: string) {
  return { id: userId, type: 1, allow: String(CHANNEL_VIEW), deny: '0' }
}

export { VIEW_CHANNEL, CHANNEL_VIEW }
