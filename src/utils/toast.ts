/**
 * Toast通知ユーティリティ
 * 
 * alert() の代わりに使用する。本番環境に適したUXを提供。
 * 
 * 使用例:
 *   import { showToast } from '@/utils/toast'
 *   
 *   showToast.success('保存しました')
 *   showToast.error('エラーが発生しました')
 *   showToast.info('処理中です...')
 *   showToast.warning('注意してください')
 */

import { toast } from 'sonner'

export const showToast = {
  /**
   * 成功メッセージ
   */
  success: (message: string, description?: string) => {
    toast.success(message, { description })
  },

  /**
   * エラーメッセージ
   */
  error: (message: string, description?: string) => {
    toast.error(message, { description })
  },

  /**
   * 情報メッセージ
   */
  info: (message: string, description?: string) => {
    toast.info(message, { description })
  },

  /**
   * 警告メッセージ
   */
  warning: (message: string, description?: string) => {
    toast.warning(message, { description })
  },

  /**
   * 通常メッセージ（alert()の直接置換用）
   */
  message: (message: string) => {
    toast(message)
  },

  /**
   * Promise対応（処理中 → 成功/失敗）
   */
  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: string
      success: string | ((data: T) => string)
      error: string | ((error: unknown) => string)
    }
  ) => {
    return toast.promise(promise, messages)
  },
}

// 後方互換性のためのエイリアス
export { toast }

