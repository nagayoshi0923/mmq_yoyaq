/** Customer change-email confirmation shared by event editing and moving.
 * Event/reservation/candidate datetime synchronization is atomic in the database. */
/** 貸切の予約変更通知メール送信前の確認（OK=送信 / キャンセル=送信しない） */
export function confirmSendPrivateBookingChangeEmail(): boolean {
  // eslint-disable-next-line no-alert, no-restricted-globals
  return confirm(
    'お客様へ予約変更の通知メールを送信しますか？\n\n' +
      '「キャンセル」を選ぶと、保存した内容はそのままでメールだけ送りません。'
  )
}
