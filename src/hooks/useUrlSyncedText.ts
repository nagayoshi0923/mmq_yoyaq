import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * 検索欄など、文字入力の値を URL のクエリ（?search=...）にも写すためのフック。
 *
 * 入力中の値は画面の中（state）で持ち、URL へは後から写す。URL から入力欄の値を作り直すと、
 * URL の書き換えが反映されるまでの間に打った文字が失われる（速く打つと最後の 1 文字しか残らない。
 * 日本語の変換入力も崩れる）。ブラウザの戻る・進むなどで URL が外から変わったときだけ、入力欄を URL に合わせる。
 */
export function useUrlSyncedText(paramName: string): [string, (value: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlValue = searchParams.get(paramName) ?? ''
  const [value, setValue] = useState(urlValue)
  const lastWritten = useRef(urlValue)

  useEffect(() => {
    if (urlValue !== lastWritten.current) {
      lastWritten.current = urlValue
      setValue(urlValue)
    }
  }, [urlValue])

  const update = useCallback((next: string) => {
    setValue(next)
    lastWritten.current = next
    setSearchParams(prev => {
      const params = new URLSearchParams(prev)
      if (next) params.set(paramName, next)
      else params.delete(paramName)
      return params
    }, { replace: true })
  }, [paramName, setSearchParams])

  return [value, update]
}
