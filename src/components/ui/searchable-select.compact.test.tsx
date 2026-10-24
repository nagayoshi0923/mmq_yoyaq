// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useState, type CSSProperties, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SearchableSelect, type SearchableSelectOption } from './searchable-select'

// 既存の scenarioOptionSelection.test と同じく Popover は差し替える（jsdom では Radix の Popover の開閉・フォーカス保持に 1 件 5 秒かかり、
// ダイアログの中へ描画すると終わらないため）。描画先（container）・高さ・色は props のまま受け取って確かめる。
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children, className, style, container, collisionBoundary }: { children: ReactNode; className?: string; style?: CSSProperties; container?: HTMLElement | null; collisionBoundary?: unknown }) => (
    <div data-popover className={className} style={style} data-container={container ? container.getAttribute('aria-label') ?? 'element' : 'body'} data-boundary={collisionBoundary ? 'dialog' : 'none'}>{children}</div>
  ),
}))

// 親カテゴリ GMテスト の色（通常 #fff7ed、選択 #ffedd5）
const tone = { bg: '#fff7ed', selected: '#ffedd5', border: '#fed7aa' }
const options: SearchableSelectOption[] = [
  { value: 'A', label: 'A作品', displayInfo: 'GM 情報', group: '選択中' },
  { value: 'B', label: 'B作品', group: '3 その他（既存の表示順）' },
  { value: 'C', label: 'C作品', group: '3 その他（既存の表示順）' },
]

function Harness({ withTone = true }: { withTone?: boolean }) {
  const [value, setValue] = useState('A')
  return (
    <div role="dialog" aria-label="公演">
      <SearchableSelect options={options} value={value} onValueChange={setValue} tone={withTone ? tone : undefined} onEmptyAction={() => {}} emptyActionLabel="シナリオを作成" />
      <output>{value}</output>
    </div>
  )
}

let host: HTMLDivElement, root: Root
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
// Popover を差し替えているので、開く操作の代わりに描画先の決定（開くときの onOpenChange）を確かめる必要がない。候補は常に描画される。
const open = async () => {}
const rows = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')]

describe('小型の候補（親カテゴリの色）', () => {
  it('行は上下 5px・角丸・題名 12px・他 10px、通常は親の色、選択行は一段濃い同じ色相で灰色を使わない', async () => {
    await act(async () => root.render(<Harness />))
    await open()
    const [a, b] = rows()
    expect(a.style.paddingTop).toBe('5px')
    expect(a.style.paddingBottom).toBe('5px')
    expect(a.className).toContain('rounded')
    expect(a.style.backgroundColor).toBe('var(--opt-selected)')
    expect(b.style.backgroundColor).toBe('var(--opt-bg)')
    expect(a.className).not.toContain('bg-muted')
    expect(a.querySelector('.text-xs')?.textContent).toBe('A作品')
    expect(a.querySelector('.ts-10')?.textContent).toBe('GM 情報')
    const list = document.querySelector('[role="listbox"]') as HTMLElement
    const popover = list.parentElement as HTMLElement
    expect(popover.style.getPropertyValue('--opt-bg')).toBe('#fff7ed')
    expect(popover.style.getPropertyValue('--opt-selected')).toBe('#ffedd5')
    // 見出し・チェック・検索・固定ボタンを保持
    expect([...document.querySelectorAll('[role="presentation"]')].map((h) => h.textContent)).toEqual(['選択中', '3 その他（既存の表示順）'])
    expect(a.getAttribute('aria-selected')).toBe('true')
    expect(document.querySelector('input')).not.toBeNull()
    expect([...document.querySelectorAll('button')].some((btn) => btn.textContent?.includes('シナリオを作成'))).toBe(true)
  })

  it('候補の領域だけスクロールし、高さは使える高さに収める（描画先と境界は実ブラウザで確認）', async () => {
    await act(async () => root.render(<Harness />))
    await open()
    const list = document.querySelector('[role="listbox"]') as HTMLElement
    const pop = list.parentElement as HTMLElement
    expect(pop.dataset.boundary).toBe('none') // 境界・描画先は開いた瞬間に決まる（差し替え版は開閉しないため、実ブラウザで確認）
    expect(list.style.overflowY).toBe('auto')
    expect(list.className).toContain('min-h-0')
    expect(pop.style.maxHeight).toContain('--radix-popover-content-available-height')
  })

  it('キーボード: 検索欄で ↓ → 先頭の候補、↓↑ で移動、Enter で選ぶ', async () => {
    await act(async () => root.render(<Harness />))
    await open()
    const input = document.querySelector('input')!
    await act(async () => { input.focus(); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })) })
    expect(document.activeElement).toBe(rows()[0])
    await act(async () => { rows()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })) })
    expect(document.activeElement).toBe(rows()[1])
    await act(async () => { rows()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(host.querySelector('output')?.textContent).toBe('B')
  })

  it('色を渡さない既存の使い方は従来の見た目（body に描画・bg-muted）のまま', async () => {
    await act(async () => root.render(<Harness withTone={false} />))
    await open()
    const [a] = rows()
    expect(a.className).toContain('bg-muted')
    expect(a.className).toContain('py-2')
    expect(a.style.paddingTop).toBe('')
    expect((document.querySelector('[role="listbox"]') as HTMLElement).style.maxHeight).toBe('300px')
    expect((document.querySelector('[data-popover]') as HTMLElement).dataset.container).toBe('body')
  })
})
