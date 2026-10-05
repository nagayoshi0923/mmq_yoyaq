/** アンケートの読み込み・送信の失敗を、理由が分かる文にする（#911） */
/** 失敗の理由を添えた文（DB からの日本語の理由があればそれを、無ければ既定の文だけ） */
export function surveyErrorText(base: string, err: unknown): string {
  const message = err && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message ?? '') : ''
  return /[ぁ-んァ-ヶ一-龠]/.test(message) ? `${base}（${message}）` : base
}
