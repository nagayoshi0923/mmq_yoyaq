export interface RecruitmentSnapshot {
  scenario: string
  date: string
  start_time: string
  store_name: string | null
  deadline: string
  was_confirmed: boolean
  missing_participants?: number
  site_url: string
}

export function recruitmentNotice(snapshot: RecruitmentSnapshot, token: string, kind: 'extension' | 'confirmed' | 'cancelled' | 'withdrawn' = 'extension') {
  const deadline = new Date(snapshot.deadline).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  if (kind !== 'extension') {
    const label = kind === 'confirmed' ? '公演開催決定のお知らせ' : kind === 'cancelled' ? '公演中止のお知らせ' : '無料辞退の受付完了'
    const message = kind === 'confirmed' ? '最低開催人数に達したため、公演の開催が決定しました。当日のご来場をお待ちしております。' : kind === 'cancelled' ? '追加募集の期限までに最低開催人数に達しなかったため、公演を中止いたします。キャンセル料はかかりません。ご予定に影響する結果となり、申し訳ございません。' : '開催判断待ちによる参加の取りやめを受け付けました。キャンセル料は0円です。'
    return { subject: `【${label}】${snapshot.scenario} - ${snapshot.date}`, text: `${snapshot.scenario}\n${snapshot.date} ${snapshot.start_time.slice(0, 5)} 開演\n会場: ${snapshot.store_name || '別途ご案内'}\n\n${message}${kind !== 'confirmed' ? '\nお支払い済みの場合の返金については店舗へお問い合わせください。' : ''}` }
  }
  const link = `${new URL(snapshot.site_url).origin}/recruitment-response#${token}`
  const text = `ご予約の公演について、開催判断の延期をお知らせします。

${snapshot.scenario}
${snapshot.date} ${snapshot.start_time.slice(0, 5)} 開演
会場: ${snapshot.store_name || '別途ご案内'}

${snapshot.was_confirmed ? '開催決定後にキャンセルが出たため、' : '現在、'}最低開催人数まであと${snapshot.missing_participants ?? 1}人となっています。
${deadline}（開演90分前・日本時間）まで追加募集を続けます。人数が揃い次第、開催を確定します。期限に達しても人数が不足している場合は中止とし、改めてご連絡します。

移動などのご都合で開催判断をお待ちいただけない場合、開催判断待ちの間（最長で上記期限まで）はキャンセル料なしで参加を取りやめられます。以下の専用ページで内容を確認し、「無料で参加を取りやめる」を選んでください。ページを開くだけでは予約は変更されません。
${link}

このご案内は追加募集開始時点のご予約が対象です。専用リンクは他の方に共有しないでください。
ご予定に影響するご案内となり、申し訳ございません。`
  const escape = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
  return {
    subject: `【追加募集・開催判断のご案内】${snapshot.scenario} - ${snapshot.date}`,
    text,
    html: `<html lang="ja"><body><div style="font-family:sans-serif;line-height:1.8;white-space:pre-wrap">${escape(text).replace(escape(link), `<a href="${escape(link)}">開催状況・無料辞退の確認</a>`)}</div></body></html>`,
  }
}
