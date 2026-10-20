/**
 * グループ画面の入口の切り替え（読み込み中・見つからない・本体）。
 * 読み込み中はグループがまだ無いときだけ（#1171）。見つからない画面は、グループを読めず内容も無いときだけ。
 * 一時的な通信失敗では usePrivateGroupSnapshot が直前の内容を残すので、本体（開いているシート）のままになる（Codex 点検 不具合 3）。
 */
export type InviteGateScreen = 'loading' | 'not-found' | 'page'

export function inviteGateScreen(state: { loading: boolean; error: string | null; hasGroup: boolean }): InviteGateScreen {
  if (state.loading && !state.hasGroup) return 'loading'
  if (state.error || !state.hasGroup) return 'not-found'
  return 'page'
}
