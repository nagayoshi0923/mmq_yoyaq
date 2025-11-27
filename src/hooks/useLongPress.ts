import { useCallback, useRef } from 'react'

/**
 * 長押しとドラッグを区別するカスタムフック
 * 
 * @param onLongPress - 長押し時のコールバック（x, y座標を受け取る）
 * @param delay - 長押しと判定する時間（ミリ秒）デフォルト: 500ms
 * @returns タッチイベントハンドラー
 */
export function useLongPress(
  onLongPress: (x: number, y: number) => void,
  delay = 500
) {
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const isLongPressTriggeredRef = useRef(false)

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    isLongPressTriggeredRef.current = false
  }, [])

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      // タッチ開始位置を記録
      const touch = e.touches[0]
      touchStartPosRef.current = {
        x: touch.clientX,
        y: touch.clientY
      }
      
      isLongPressTriggeredRef.current = false

      // 長押しタイマーを開始
      timerRef.current = setTimeout(() => {
        if (touchStartPosRef.current) {
          isLongPressTriggeredRef.current = true
          onLongPress(touchStartPosRef.current.x, touchStartPosRef.current.y)
        }
      }, delay)
    },
    [onLongPress, delay]
  )

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      // タッチ移動が発生したらタイマーをキャンセル（ドラッグ動作と判定）
      if (!touchStartPosRef.current) return

      const touch = e.touches[0]
      const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x)
      const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y)

      // 5px以上移動したらドラッグと判定してタイマーをキャンセル
      if (deltaX > 5 || deltaY > 5) {
        clear()
      }
    },
    [clear]
  )

  const onTouchEnd = useCallback(() => {
    // タッチ終了時にタイマーをキャンセル
    clear()
  }, [clear])

  const onTouchCancel = useCallback(() => {
    // タッチキャンセル時にタイマーをキャンセル
    clear()
  }, [clear])

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    isLongPressTriggered: () => isLongPressTriggeredRef.current
  }
}

