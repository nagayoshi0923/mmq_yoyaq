/** SDK の共有ロック/通信待ちでも、画面を無期限に待たせない。ロックの解除や認証状態の削除はしない。 */
export async function withAuthTimeout<T>(operation: PromiseLike<T>, milliseconds = 10_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('ログイン情報の確認が応答しませんでした')), milliseconds)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
