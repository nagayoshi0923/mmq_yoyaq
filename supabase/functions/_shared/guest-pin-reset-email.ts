/** ゲストの PIN 再発行メールの文面（参加時の PIN メールと同じ形） */
export function buildGuestPinResetEmail(input: { guestName?: string | null; email: string; pin: string; scenarioTitle?: string | null; inviteCode: string }) {
  const name = input.guestName?.trim() || 'ゲスト'
  const title = input.scenarioTitle?.trim() || 'グループ'
  const url = `https://mmq.game/group/invite/${encodeURIComponent(input.inviteCode)}`
  const subject = `【${title}】アクセスPINの再発行のご案内`
  const text = `${name} 様

「${title}」のグループのアクセスPINを再発行しました。
以前のPINは使えなくなりました。

■ 新しいアクセスPIN
${input.pin}

このPINとメールアドレス（${input.email}）で、グループに入れます。

■ グループURL
${url}

※お心当たりがない場合は、このメールを破棄してください。PINはこのメールアドレスにだけお送りしています。
※このメールは自動送信されています。
`
  return { subject, text }
}
