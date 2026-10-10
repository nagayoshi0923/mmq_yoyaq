/** 登録完了画面から次の画面へ自動で移るまでの時間（ミリ秒） */
export const SUCCESS_REDIRECT_DELAY_MS = 2000

export type SuccessDestination = { url: string; kind: 'coupon' | 'top' | 'previous' }

const DESTINATION_LABEL: Record<SuccessDestination['kind'], string> = {
  coupon: '登録特典のクーポンの画面',
  top: 'トップページ',
  previous: '元の画面',
}

export function successRedirectMessage(kind: SuccessDestination['kind']): string {
  return `${SUCCESS_REDIRECT_DELAY_MS / 1000}秒後に${DESTINATION_LABEL[kind]}へ移動します...`
}
