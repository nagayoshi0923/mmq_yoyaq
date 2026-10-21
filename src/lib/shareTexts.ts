/**
 * LINE・X などで送る誘いの文。絵文字は入れない（お客様向けの文・通知に絵文字を使わない決まり。2026-10-20 staging 点検）。
 */

/** 貸切グループへの招待（グループ作成直後・グループ画面の「LINEで送る」） */
export function groupInviteShareText(scenarioTitle: string, maxPlayers?: number | null): string {
  return [
    '貸切マーダーミステリーに参加しませんか？',
    '',
    `作品: ${scenarioTitle || '貸切公演'}`,
    ...(maxPlayers ? [`人数: 最大${maxPlayers}名まで`] : []),
    '',
    '下のリンクから参加・日程の回答をお願いします。',
  ].join('\n')
}

/** 公演への誘い（作品ページ・予約完了の「友達を誘う」） */
export function eventInviteShareText(input: { scenarioTitle: string; eventDate?: string | null; eventTime?: string | null; storeName?: string | null }): string {
  const lines = ['一緒にマーダーミステリーやりませんか？', '', `作品: ${input.scenarioTitle}`]
  if (input.eventDate && input.eventTime && input.storeName) {
    lines.push(`日時: ${input.eventDate} ${input.eventTime}〜`, `会場: ${input.storeName}`)
  }
  lines.push('', '詳細・予約は下のリンクから。')
  return lines.join('\n')
}
