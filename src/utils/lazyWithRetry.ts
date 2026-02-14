import { lazy, ComponentType } from 'react'

/**
 * デプロイ後のチャンク読み込みエラーに対応する lazy() ラッパー
 *
 * 問題：デプロイ後に古いハッシュ付きチャンクファイルが存在しなくなるため、
 * 開きっぱなしのタブからの遷移で 404 になる。
 *
 * 解決策（リロード不要）：
 * 1. 通常の import を試行
 * 2. 失敗したら index.html を再取得し、新しいモジュールマップを取得
 * 3. 元のモジュールパスから新しいハッシュ付きURLを特定して再 import
 * 4. すべて失敗した場合のみ ErrorBoundary に委ねる（ユーザーに選択権）
 */

/**
 * チャンク読み込みエラーかどうかを判定
 */
export function isChunkLoadError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      msg.includes('failed to fetch dynamically imported module') ||
      msg.includes('loading chunk') ||
      msg.includes('loading css chunk') ||
      msg.includes('dynamically imported module') ||
      // Safari は "Load failed" を投げる
      (msg === 'load failed') ||
      // TypeError: Failed to fetch （ネットワーク由来ではなく import 由来のもの）
      (msg === 'failed to fetch' && error.constructor.name === 'TypeError')
    )
  }
  return false
}

/**
 * index.html を再取得して新しいエントリポイントのスクリプトURLを取得する。
 * Vite は index.html 内の <script type="module" src="/assets/index-XXXX.js"> を
 * エントリポイントとして使うため、新しいデプロイ後はこのURLが変わっている。
 *
 * 新しいエントリポイントを import() することで、Vite のモジュールグラフが
 * 新しいハッシュで再構築され、後続の lazy import が成功する。
 */
async function refreshModuleGraph(): Promise<boolean> {
  try {
    const resp = await fetch(`${window.location.origin}/?_t=${Date.now()}`, {
      headers: { Accept: 'text/html' },
      cache: 'no-cache',
    })
    if (!resp.ok) return false

    const html = await resp.text()
    // Vite が生成する <script type="module" ... src="/assets/index-XXXX.js">
    const match = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i)
    if (!match?.[1]) return false

    const newEntryUrl = match[1].startsWith('http')
      ? match[1]
      : `${window.location.origin}${match[1]}`

    // 新しいエントリポイントを読み込むことでモジュールグラフを更新
    await import(/* @vite-ignore */ newEntryUrl)
    return true
  } catch {
    return false
  }
}

/**
 * リトライ付き lazy import（リロード不要）
 *
 * @param importFn - () => import('./SomeComponent') 形式の関数
 * @param retries - 単純リトライ回数（デフォルト: 1）
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  retries = 1
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    // 1. 通常の import を試行
    try {
      return await importFn()
    } catch (firstError) {
      if (!isChunkLoadError(firstError)) {
        throw firstError
      }

      // 2. 単純リトライ（一時的なネットワーク障害対応）
      for (let i = 0; i < retries; i++) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
        try {
          return await importFn()
        } catch {
          // 続行
        }
      }

      // 3. index.html を再取得してモジュールグラフを更新し、再度 import
      const refreshed = await refreshModuleGraph()
      if (refreshed) {
        try {
          return await importFn()
        } catch {
          // 最終手段へ
        }
      }

      // 4. 全て失敗 → ErrorBoundary に委ねる
      throw firstError
    }
  })
}

/**
 * 後方互換: 以前のバージョンで使っていた関数（main.tsx から呼ばれる）
 * リロード方式をやめたので no-op にする
 */
export function clearChunkReloadFlag(): void {
  // no-op: リロード方式は廃止
  sessionStorage.removeItem('chunk-reload-attempted')
  sessionStorage.removeItem('chunk-error-reload')
}
