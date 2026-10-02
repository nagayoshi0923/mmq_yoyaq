/**
 * supabase クライアントの代わりに使う記録用の偽物（テスト専用）。
 * from() / rpc() と、その後のメソッド呼び出し（select / eq / in / order など何でも）を順に記録し、
 * await すると { data: result, error: null, count: null } を返す。読み取り関数が「どのテーブルに、どの絞り込みで問い合わせるか」を固定するのに使う。
 */
export type RecordedCall = [string, unknown[]]

export function makeSupabaseRecorder(calls: RecordedCall[], state: { result?: unknown } = {}) {
  const chain = (): unknown => {
    const target: Record<string, unknown> = {}
    const proxy: unknown = new Proxy(target, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown) => Promise.resolve({ data: state.result ?? null, error: null, count: null }).then(resolve)
        }
        return (...args: unknown[]) => { calls.push([prop, args]); return proxy }
      },
    })
    return proxy
  }
  return {
    from: (table: string) => { calls.push(['from', [table]]); return chain() },
    rpc: (name: string, args?: unknown) => { calls.push(['rpc', args === undefined ? [name] : [name, args]]); return chain() },
  }
}

/** 記録した呼び出しを、問い合わせ（from / rpc）ごとに1行の文字列にする。長い文字列は切る。 */
export function renderCalls(calls: RecordedCall[]): string[] {
  const lines: string[] = []
  for (const [name, args] of calls) {
    const part = `${name}(${args.map(a => {
      const t = JSON.stringify(a)
      return t.length > 70 ? `${t.slice(0, 70)}…` : t
    }).join(', ')})`
    if (name === 'from' || name === 'rpc') lines.push(part)
    else lines[lines.length - 1] += ` .${part}`
  }
  return lines
}
