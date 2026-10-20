// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CouponUsableStores } from './CouponUsableStores'

let root: Root
let host: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

describe('クーポンの使える店舗', () => {
  it('数を出さず、押すと店舗名の一覧が開く', async () => {
    await act(async () => root.render(<CouponUsableStores label="クインズワルツの全店舗（東京・埼玉）" storeNames={['高田馬場店', '馬場(レ)']} />))
    expect(host.textContent).toContain('使える店舗: クインズワルツの全店舗（東京・埼玉）')
    expect(host.textContent).not.toMatch(/\d+ ?店舗/)
    expect(host.textContent).not.toContain('馬場(レ)')
    await act(async () => host.querySelector('button')!.click())
    expect(host.textContent).toContain('馬場(レ)')
  })
  it('絞ったクーポンは店舗名をそのまま出す（押せない）', async () => {
    await act(async () => root.render(<CouponUsableStores label="クインズワルツ（高田馬場店）" storeNames={[]} />))
    expect(host.querySelector('button')).toBeNull()
    expect(host.textContent).toBe('使える店舗: クインズワルツ（高田馬場店）')
  })
  it('対象店舗が読めないクーポンは「全店舗」と出さず確認中と出す（監査 C1）', async () => {
    await act(async () => root.render(<CouponUsableStores label="利用できる店舗を確認中です" storeNames={[]} />))
    expect(host.textContent).toBe('利用できる店舗を確認中です')
    expect(host.textContent).not.toContain('全店舗')
  })
})
