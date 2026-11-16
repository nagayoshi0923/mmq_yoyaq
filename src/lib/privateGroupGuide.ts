/**
 * 貸切の確定メールに添える「グループのご案内」（#355）。
 * 送信側（supabase/functions/_shared/private-confirmation-payload.ts の privateGroupGuideText）と同じ文面。
 * 画面のプレビューで、実際に送られる全文を見せるために使う（#831）。文面が一致することはテストで確かめる。
 */
export function privateGroupGuideText(groupUrl: string): string {
  return `━━━━━━━━━━━━━━━━━━━━
グループのご案内
━━━━━━━━━━━━━━━━━━━━

この貸切のグループを作成しています。グループページは下記です。
${groupUrl}

・グループに入室していない方は、クーポンを利用できません。クーポンをご利用の方は、公演日までにこのページのURLを共有し、入室をお願いします。
・事前配役がある作品では、配役のご案内をこのグループで行います。
・事前配役がない作品では、グループへの入室は必須ではありません。`
}

/** 店舗の独自文面に {group_url} が無い場合、送信時と同じく末尾にグループの案内を添える */
export function withPrivateGroupGuide(template: string, groupUrl: string): string {
  if (template.includes('{group_url}')) return template
  return `${template.trimEnd()}\n\n${privateGroupGuideText(groupUrl)}`
}
