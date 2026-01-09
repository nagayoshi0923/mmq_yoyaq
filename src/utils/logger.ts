// 開発環境とプロダクション環境で動作を分けるロガーユーティリティ

/**
 * 環境に応じたログ出力
 * 開発環境（通常）: errorとwarnのみ出力
 * 開発環境（VITE_DEBUG=true）: すべてのログを出力
 * 本番環境: errorとwarnのみ出力
 */

const isDevelopment = import.meta.env.DEV
const isDebugMode = import.meta.env.VITE_DEBUG === 'true'

export const logger = {
  /**
   * デバッグログ（VITE_DEBUG=true の時のみ）
   */
  log: (...args: any[]) => {
    if (isDevelopment && isDebugMode) {
      console.log(...args)
    }
  },

  /**
   * 情報ログ（VITE_DEBUG=true の時のみ）
   */
  info: (...args: any[]) => {
    if (isDevelopment && isDebugMode) {
      console.info(...args)
    }
  },

  /**
   * 警告ログ（常に出力）
   */
  warn: (...args: any[]) => {
    console.warn(...args)
  },

  /**
   * エラーログ（常に出力）
   */
  error: (...args: any[]) => {
    console.error(...args)
  },

  /**
   * グループログ（開発環境のみ）
   */
  group: (label: string) => {
    if (isDevelopment && console.group) {
      console.group(label)
    }
  },

  /**
   * グループ終了（開発環境のみ）
   */
  groupEnd: () => {
    if (isDevelopment && console.groupEnd) {
      console.groupEnd()
    }
  },

  /**
   * テーブル表示（開発環境のみ）
   */
  table: (data: any) => {
    if (isDevelopment && console.table) {
      console.table(data)
    }
  },

  /**
   * 時間計測開始（開発環境のみ）
   */
  time: (label: string) => {
    if (isDevelopment && console.time) {
      console.time(label)
    }
  },

  /**
   * 時間計測終了（開発環境のみ）
   */
  timeEnd: (label: string) => {
    if (isDevelopment && console.timeEnd) {
      console.timeEnd(label)
    }
  },
}

/**
 * デバッグモード専用のログ（より詳細な情報）
 * 環境変数 VITE_DEBUG=true の時のみ出力
 */
export const debug = {
  log: (...args: any[]) => {
    if (isDevelopment && isDebugMode) {
      console.log('[DEBUG]', ...args)
    }
  },

  trace: (...args: any[]) => {
    if (isDevelopment && isDebugMode && console.trace) {
      console.trace('[DEBUG]', ...args)
    }
  },
}

