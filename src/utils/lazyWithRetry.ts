import { lazy, ComponentType } from 'react'
import { canAutoReloadFor, claimAutoReloadFor, clearAutoReloadRecord } from '@/lib/autoReloadGuard'

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
 * 2. デプロイ後の古いチャンク → バージョンチェックで検知し、次の遷移などで自動で新しい版へ切り替え（silentAppUpdate.ts）
 * 3. ErrorBoundary の最終フォールバック → ユーザーフレンドリーな「更新あり」画面
 *
 * 入力の途中では再読み込みしない。
 */

/** アプリ起動時のビルドハッシュ（index.html のエントリポイントURLから取得） */
let initialBuildHash: string | null = null

/** バージョン変更を検知した際のコールバック（切り替え先の版を渡す） */
let onVersionChangeCallback: ((latestHash: string) => void) | null = null

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
      // Mobile Safari (iOS) が動的 import 失敗時に投げるメッセージ
      msg.includes('importing a module script failed') ||
      // Safari は "Load failed" を投げる
      (msg === 'load failed') ||
      // iOS Safari が動的 import 失敗時に "Internal error" を投げるケース
      (msg === 'internal error' && error.constructor.name === 'TypeError') ||
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
 * サーバーの版が起動時と違えば、その版を返す
 */
async function findChangedBuildHash(): Promise<string | null> {
  if (!initialBuildHash) return null
  const latestHash = await fetchLatestBuildHash()
  return latestHash && latestHash !== initialBuildHash ? latestHash : null
}

/**
 * バージョンが変わっているかチェックし、変わっていたらコールバックを呼ぶ。
 * その版へ切り替えるための自動の再読み込みを既にしたのに、まだ古い版で起動している場合は
 * 読み込み直しても直らないので、切り替えを予約しない（繰り返しの再読み込みを防ぐ）。
 */
async function checkVersionChange(): Promise<boolean> {
  const latestHash = await findChangedBuildHash()
  if (!latestHash) return false
  if (canAutoReloadFor(latestHash)) onVersionChangeCallback?.(latestHash)
  return true
}

/**
 * チャンクの読み込み失敗などで新しい版の可能性があるときに呼ぶ。
 * サーバーの版を確かめ、違っていたときだけ切り替えを予約する（版が分からない予約はしない）。
 */
export function checkForNewVersion(): void {
  void checkVersionChange()
}

/**
 * バージョン変更検知の初期化（main.tsx で呼び出す）
 *
 * チャンクエラー時の即時チェックに加え、定期ポーリングも行う。
 * ポーリングで先にバージョン変更を検知できれば、
 * ユーザーがページ遷移する前に切り替えを予約でき、
 * エラー画面を見せずに済む。
 *
 * @param onVersionChange - 新バージョン検知時のコールバック
 */
export function initVersionCheck(onVersionChange: (latestHash: string) => void): void {
  initialBuildHash = getCurrentBuildHash()
  onVersionChangeCallback = onVersionChange

  // 本番環境でのみ定期ポーリング
  if (import.meta.env.PROD && initialBuildHash) {
    const POLL_INTERVAL = 30 * 1000 // 30秒

    const poll = async () => {
      if (document.visibilityState === 'hidden') {
        setTimeout(poll, POLL_INTERVAL)
        return
      }
      const changed = await checkVersionChange()
      if (!changed) {
        setTimeout(poll, POLL_INTERVAL)
      }
    }

    // 初回は10秒後に開始（デプロイ直後のキャッシュ不整合を早期検知）
    setTimeout(poll, 10 * 1000)

    // タブがフォアグラウンドに戻った時は即座にチェック
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
      const latestHash = await findChangedBuildHash()
      // 無限リロードループ防止: 同じ版へはタブごとに1回だけ。記録は起動をまたいで残る
      if (latestHash && claimAutoReloadFor(latestHash)) {
        window.location.reload()
        // リロード中にErrorBoundaryが表示されないよう、永遠にpendingのPromiseを返す
        return new Promise(() => {})
      }

      // 4. 全て失敗 → ErrorBoundary に委ねる
      throw firstError
    }
  })
}

/**
 * 以前のバージョンで使っていた記録を消す（main.tsx の起動時に呼ばれる）。
 * 自動の再読み込みの記録（chunk-auto-reload）は起動をまたいで残すため、ここでは消さない。
 */
export function clearLegacyChunkReloadFlags(): void {
  try {
    sessionStorage.removeItem('chunk-reload-attempted')
    sessionStorage.removeItem('chunk-error-reload')
  } catch {
    // 保存領域が使えない環境では記録も無い
  }
}

/** 手動で最新版を読み込むときに、自動の再読み込みの記録も含めて消す */
export function clearChunkReloadFlag(): void {
  clearLegacyChunkReloadFlags()
  clearAutoReloadRecord()
}

/**
 * ユーザーが「最新版を読み込む / 更新する」を押したときの確実なリロード。
 *
 * 素の location.reload() だと、iOS Safari の bfcache や中間キャッシュで
 * 古いページ状態・古いチャンク参照が復元され「押しても変わらない（動かない）」
 * ことがある。対策として:
 *  1. チャンク自動リロードの抑止フラグを解除（手動操作後は自動回復も再び効くように）
 *  2. キャッシュバスター(_v=timestamp)付きで location.replace し、確実に新しい
 *     index.html（no-store）と新チャンクを取りに行く。_v はアプリ側では未使用で、
 *     値が入っていれば Vercel の「_v 欠落時リダイレクト」も発火しない。
 */
export function forceReloadLatest(): void {
  try {
    clearChunkReloadFlag()
  } catch {
    // sessionStorage 不可環境でも続行
  }
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('_v', String(Date.now()))
    window.location.replace(url.toString())
  } catch {
    window.location.reload()
  }
}
