// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { CharactersSection } from './CharactersSection'

it('配役の説明は「事前配役アンケート」と書く', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'), root = createRoot(host)
  await act(async () => root.render(<CharactersSection characters={[{ id: 'c1', name: '探偵', description: '' }] as never} />))
  expect(host.textContent).toContain('配役は当日、または事前配役アンケートで決まります。')
  expect(host.textContent).not.toMatch(/当日またはアンケート/)
  await act(async () => root.unmount())
})
