import { useEffect } from 'react'

interface ShortcutOptions {
  /** Cmd (Mac) or Ctrl (Win) が必要か */
  metaKey?: boolean
  /** Shift が必要か */
  shiftKey?: boolean
  /** input / textarea / select / contenteditable にフォーカスがある場合は無視（デフォルト: true） */
  ignoreInputs?: boolean
  /** ショートカットを有効にする条件 */
  enabled?: boolean
}

/**
 * キーボードショートカットを登録するフック
 *
 * @param key - e.key の値（例: 'k', 'ArrowLeft', '?'）
 * @param handler - ショートカット発火時のコールバック
 * @param options - オプション
 *
 * @example
 * useKeyboardShortcut('ArrowLeft', () => changeMonth('prev'))
 * useKeyboardShortcut('k', openSearch, { metaKey: true })
 */
export function useKeyboardShortcut(
  key: string,
  handler: () => void,
  options: ShortcutOptions = {}
) {
  const { metaKey = false, shiftKey = false, ignoreInputs = true, enabled = true } = options

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // input 系にフォーカスがある場合は無視
      if (ignoreInputs) {
        const target = e.target as HTMLElement
        const tag = target.tagName
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return
        }
        // cmdk の入力ボックスも無視（data-cmdk-input 属性）
        if (target.getAttribute('cmdk-input') !== null || target.closest('[cmdk-input]')) {
          return
        }
        // ダイアログ内の入力も無視
        if (target.closest('[role="dialog"]')) {
          return
        }
      }

      if (e.key !== key) return
      if (metaKey && !e.metaKey && !e.ctrlKey) return
      if (!metaKey && (e.metaKey || e.ctrlKey)) return
      if (shiftKey && !e.shiftKey) return
      if (!shiftKey && e.shiftKey) return

      e.preventDefault()
      handler()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [key, handler, metaKey, shiftKey, ignoreInputs, enabled])
}
