/**
 * queryInvalidation のユニットテスト
 *
 * このプロジェクトの QueryClient はグローバル既定が refetchOnMount:false のため、
 * 素の invalidateQueries では非アクティブなクエリが再取得されない。
 * invalidateEverywhere は refetchType:'all' を明示して非アクティブなクエリも
 * 即再取得させるヘルパー。ここではその再取得（refetch）が発火することを検証する。
 *
 * 実行: npm run test:unit
 */
import { describe, it, expect, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { invalidateEverywhere } from './queryInvalidation'

describe('invalidateEverywhere', () => {
  it('渡した queryKey のクエリを invalidated 状態にして再取得を発火させる', async () => {
    const queryClient = new QueryClient({
      // 本番と同じ「非アクティブなら再取得しない」既定を再現する
      defaultOptions: { queries: { refetchOnMount: false } },
    })

    const queryFn = vi.fn(async () => 'value-1')
    const queryKey = ['unit-test-key']

    // 初回フェッチでキャッシュを温める（この後クエリはオブザーバー無し＝非アクティブになる）
    await queryClient.fetchQuery({ queryKey, queryFn })
    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(false)

    await invalidateEverywhere(queryClient, queryKey)

    // invalidated フラグが立ち、非アクティブでも refetchType:'all' により再取得される
    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(false)

    queryClient.clear()
  })

  it('複数の queryKey をすべて再取得させる', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { refetchOnMount: false } },
    })

    const fnA = vi.fn(async () => 'a')
    const fnB = vi.fn(async () => 'b')
    const keyA = ['key-a']
    const keyB = ['key-b']

    await queryClient.fetchQuery({ queryKey: keyA, queryFn: fnA })
    await queryClient.fetchQuery({ queryKey: keyB, queryFn: fnB })
    expect(fnA).toHaveBeenCalledTimes(1)
    expect(fnB).toHaveBeenCalledTimes(1)

    await invalidateEverywhere(queryClient, keyA, keyB)

    expect(fnA).toHaveBeenCalledTimes(2)
    expect(fnB).toHaveBeenCalledTimes(2)

    queryClient.clear()
  })

  it('queryKey を渡さなければ何もせず解決する', async () => {
    const queryClient = new QueryClient()
    await expect(invalidateEverywhere(queryClient)).resolves.toBeUndefined()
    queryClient.clear()
  })
})
