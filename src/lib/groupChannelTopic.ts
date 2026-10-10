/**
 * 貸切グループのチャットの Realtime チャンネル名（入力中・いま見ている人。段階 3 でグループ id から招待コードのハッシュに変えた）。
 * 送信処理（Edge Function send-web-push）と同じ決まりを使うため、そちらの関数をそのまま使う。
 */
export { groupChannelTopic } from '../../supabase/functions/_shared/web-push'
