import { useEffect, useState } from 'react'
import { toJstYmd } from '@/utils/jstDate'

const DAY_MS = 24 * 60 * 60 * 1000
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/** 次の日本時間 0 時までのミリ秒（少し余裕を足して、0 時ちょうどより後に起きるようにする） */
export function msUntilNextJstMidnight(now: Date = new Date()): number {
  const intoDay = (now.getTime() + JST_OFFSET_MS) % DAY_MS
  return DAY_MS - intoDay + 250
}

/**
 * 日本時間の「今日」（YYYY-MM-DD）。画面を開いたまま 0 時をまたいでも切り替わる。
 * 次の 0 時にタイマーで更新し、スリープ明けなどでタイマーが遅れた場合に備えて
 * 画面に戻ったとき（visibilitychange / focus）にも読み直す。常駐の定期処理は持たない。
 * 公演当日だけ押せるボタン（もぎる・この予約に使う）はこの時計で判定する。
 */
export function useJstToday(): string {
  const [today, setToday] = useState(() => toJstYmd(new Date()))

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      setToday(toJstYmd(new Date()))
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(refresh, msUntilNextJstMidnight())
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      if (timer !== undefined) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return today
}
