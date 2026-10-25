// @vitest-environment jsdom
// 用途別の固定サイズ（#1230）のレビュー指摘 2 件の回帰防止（2026-10-25）:
//  1. 下に固定する印（data-dialog-footer）をボタン自身に付けると、固定用の背景がボタンの色を上書きして白地に白文字になる → 印は外側の要素へ
//  2. 固定ヘッダー（z-index 2）が右上の閉じるボタンに重なって押せない部分ができる → 閉じるボタンをヘッダーより前面へ
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/registerPlayedScenario', () => ({ registerPlayedScenario: vi.fn() }))
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog'
import { PlayedRegistrationDialog } from '@/components/modals/PlayedRegistrationDialog'

let host: HTMLDivElement, root: Root
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

const srcDir = join(__dirname, '..', '..')
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return tsxFiles(p)
    return p.endsWith('.tsx') && !p.includes('.test.') ? [p] : []
  })
}

describe('下に固定するボタンの行', () => {
  it('data-dialog-footer をボタン自身に付けている箇所が無い', () => {
    const offenders = tsxFiles(srcDir).filter((p) => /<(Button|button)\b[^>]*data-dialog-footer/.test(readFileSync(p, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('played 登録: 印は外側の div にあり、「登録する」ボタンはその中', async () => {
    await act(async () => root.render(<PlayedRegistrationDialog open onOpenChange={() => {}} scenarioTitle="架空の作品" scenarioMasterId="x" customerId="x" />))
    const footer = document.querySelector('[data-dialog-footer]')
    expect(footer?.tagName).toBe('DIV')
    expect(footer?.querySelector('button')?.textContent).toBe('登録する')
  })
})

describe('閉じるボタンと固定ヘッダーの重なり順', () => {
  it('閉じるボタンの z-index が固定ヘッダーより大きい', async () => {
    await act(async () => root.render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent fixedSize="editor"><DialogHeader><DialogTitle>架空の見出し</DialogTitle></DialogHeader></DialogContent>
      </Dialog>,
    ))
    const close = [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Close')
    const closeZ = Number(close?.className.match(/(?:^|\s)z-(\d+)(?:\s|$)/)?.[1] ?? 0)
    const css = readFileSync(join(__dirname, 'dialog-sizes.css'), 'utf8')
    const headerZ = Number(css.match(/\[data-dialog-header\]\s*\{[^}]*z-index:\s*(\d+)/)?.[1])
    expect(headerZ).toBeGreaterThan(0)
    expect(closeZ).toBeGreaterThan(headerZ)
  })
})
