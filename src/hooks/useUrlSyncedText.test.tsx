// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { useUrlSyncedText } from './useUrlSyncedText'

let root: Root
let container: HTMLDivElement
let location = ''
let navigate: ReturnType<typeof useNavigate>

function Probe() {
  const [value, setValue] = useUrlSyncedText('search')
  const loc = useLocation()
  location = loc.search
  navigate = useNavigate()
  return <input value={value} onChange={e => setValue(e.target.value)} />
}

function typeChar(input: HTMLInputElement, char: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, input.value + char)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<MemoryRouter initialEntries={['/customer-management?search=old']}><Probe /></MemoryRouter>))
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

it('URL の値で始まり、連続して打った文字が消えずに残り、URL にも写る', async () => {
  const input = container.querySelector('input')!
  expect(input.value).toBe('old')
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    for (const c of '955e0c') typeChar(input, c)
  })
  expect(input.value).toBe('955e0c')
  expect(location).toBe('?search=955e0c')
})

it('空にすると URL からも消え、戻る・進むで URL が外から変わったら入力欄も合わせる', async () => {
  const input = container.querySelector('input')!
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(location).toBe('')
  await act(async () => { navigate('/customer-management?search=%E5%B1%B1%E7%94%B0') })
  expect(input.value).toBe('山田')
})
