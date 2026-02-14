import { lazy, ComponentType } from 'react'

/**
 * デプロイ後のチャンク読み込みエラーに対応する lazy() ラッパー
 *
 * 問題：
 * デプロイ後に古いハッシュ付きチャンクファイルが存在しなくなるため、
 * 開きっぱなしのタブからの遷移で 404 になる。
 * ESモジュールの import() は URL が静的にバンドルされるため、
 * アプリ側だけで新URLに差し替えることは技術的に不可能。
 *
 * 対策（多層防御）：
 * 1. 一時的なネットワーク障害 → リトライで解決
 * 2. デプロイ後の古いチャンク → バージョンチェックで検知し「更新通知バナー」を表示
 * 3. ErrorBoundary の最終フォールバック → ユーザーフレンドリーな「更新あり」画面
 *
 * リロードを強制せず、ユーザーに選択権を渡す。
 */

/** アプリ起動時のビルドハッシュ（index.html のエントリポイントURLから取得） */
let initialBuildHash: string | null = null

/** バージョン変更を検知した際のコールバック */
let onVersionChangeCallback: (() => void) | null = null

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
 * 現在の index.html からエントリポイントのハッシュを取得する
 */
function getCurrentBuildHash(): string | null {
  const scripts = document.querySelectorAll('script[type="module"][src]')
  for (const script of scripts) {
    const src = script.getAttribute('src')
    if (src?.includes('/assets/index-')) {
      // "index-BR0uUZur" の "BR0uUZur" 部分
      const match = src.match(/index-([^.]+)\.js/)
      return match?.[1] ?? null
    }
  }
  return null
}

/**
 * サーバーの最新 index.html からビルドハッシュを取得する
 */
async function fetchLatestBuildHash(): Promise<string | null> {
  try {
    const resp = await fetch(`${window.location.origin}/?_t=${Date.now()}`, {
      headers: { Accept: 'text/html' },
      cache: 'no-cache',
    })
    if (!resp.ok) return null

    const html = await resp.text()
    const match = html.match(/index-([^.]+)\.js/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * バージョンが変わっているかチェックし、変わっていたらコールバックを呼ぶ
 */
async function checkVersionChange(): Promise<boolean> {
  if (!initialBuildHash) return false
  const latestHash = await fetchLatestBuildHash()
  if (latestHash && latestHash !== initialBuildHash) {
    onVersionChangeCallback?.()
    return true
  }
  return false
}

/**
 * バージョン変更検知の初期化（main.tsx で呼び出す）
 *
 * チャンクエラー時の即時チェックに加え、定期ポーリングも行う。
 * ポーリングで先にバージョン変更を検知できれば、
 * ユーザーがページ遷移する前に更新バナーを表示でき、
 * エラー画面を見せずに済む。
 *
 * @param onVersionChange - 新バージョン検知時のコールバック
 */
export function initVersionCheck(onVersionChange: () => void): void {
  initialBuildHash = getCurrentBuildHash()
  onVersionChangeCallback = onVersionChange

  // 本番環境でのみ定期ポーリング（5分間隔）
  if (import.meta.env.PROD && initialBuildHash) {
    const POLL_INTERVAL = 5 * 60 * 1000 // 5分

    const poll = async () => {
      const changed = await checkVersionChange()
      if (!changed) {
        // まだ変わってなければ次回もチェック
        setTimeout(poll, POLL_INTERVAL)
      }
      // 変わっていたらポーリング終了（バナーは1回だけ表示）
    }

    // 初回は3分後に開始（アプリ起動直後は不要）
    setTimeout(poll, 3 * 60 * 1000)

    // タブがフォアグラウンドに戻った時もチェック
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && initialBuildHash) {
        checkVersionChange()
      }
    })
  }
}

/**
 * リトライ付き lazy import
 *
 * @param importFn - () => import('./SomeComponent') 形式の関数
 * @param retries - 単純リトライ回数（デフォルト: 2）
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  retries = 2
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

      // 3. バージョンチェック → 新バージョンがあれば自動リロード
      const versionChanged = await checkVersionChange()
      if (versionChanged) {
        // 無限リロードループ防止: セッション内で1回だけリロード
        const reloadKey = 'chunk-auto-reload'
        if (!sessionStorage.getItem(reloadKey)) {
          sessionStorage.setItem(reloadKey, '1')
          window.location.reload()
          // リロード中にErrorBoundaryが表示されないよう、永遠にpendingのPromiseを返す
          return new Promise(() => {})
        }
      }

      // 4. 全て失敗 → ErrorBoundary に委ねる
      throw firstError
    }
  })
}

/**
 * 後方互換: 以前のバージョンで使っていた関数（main.tsx から呼ばれる）
 */
export function clearChunkReloadFlag(): void {
  sessionStorage.removeItem('chunk-reload-attempted')
  sessionStorage.removeItem('chunk-error-reload')
  sessionStorage.removeItem('chunk-auto-reload')
}
