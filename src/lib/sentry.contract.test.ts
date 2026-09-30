// @vitest-environment jsdom
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
const m=vi.hoisted(()=>({init:vi.fn(),captureException:vi.fn(),setUser:vi.fn(),setTag:vi.fn()}))
vi.mock('@sentry/react',()=>m)
vi.mock('@/utils/logger',()=>({logger:{log:vi.fn(),error:vi.fn()}}))
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();window.history.replaceState({},'', '/');vi.stubEnv('VITE_SENTRY_DSN','https://fixture@example.invalid/1');vi.stubEnv('VITE_APP_ENV','production');Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})})
afterEach(()=>vi.unstubAllEnvs())
it('DSNなしでは初期化・例外送信とも行わない',async()=>{
 vi.stubEnv('VITE_SENTRY_DSN','');const s=await import('./sentry');s.initSentry();s.captureException(Error('fixture'))
 expect(m.init).not.toHaveBeenCalled();expect(m.captureException).not.toHaveBeenCalled()
})
it('productionの環境/releaseとPII抑制を設定する',async()=>{
 vi.stubEnv('VITE_APP_VERSION','fixture-version');const s=await import('./sentry');s.initSentry()
 expect(m.init).toHaveBeenCalledWith(expect.objectContaining({environment:'production',release:'mmq-yoyaq@fixture-version',sendDefaultPii:false,replaysSessionSampleRate:0,sampleRate:1}))
})
it('トークンを含む専用リンクは初期化しない',async()=>{
 window.history.replaceState({},'', '/recruitment-response?token=fixture');const s=await import('./sentry');s.initSentry();expect(m.init).not.toHaveBeenCalled()
})
it('通常のFailed to fetchは除外するがチャンクのエラーは残し、メール/電話をマスクする',async()=>{
 const s=await import('./sentry');s.initSentry();const filter=m.init.mock.calls[0][0].beforeSend
 expect(filter({exception:{values:[{value:'Failed to fetch'}]}})).toBeNull()
 const event={exception:{values:[{value:'Failed to fetch dynamically imported module fixture@example.invalid 090-1234-5678'}]}}
 expect(filter(event)).toBe(event);expect(event.exception.values[0].value).not.toContain('fixture@example.invalid');expect(event.exception.values[0].value).not.toContain('090-1234-5678')
})
it('捕捉済み例外のcontextをSentryに渡す（送信はmock）',async()=>{
 const s=await import('./sentry');const error=Error('fixture');s.captureException(error,{componentStack:'fixture'})
 expect(m.captureException).toHaveBeenCalledWith(error,{extra:{componentStack:'fixture'}})
})
it('実ErrorBoundaryが画面fallbackを出し、監視helperへ1回渡す',async()=>{
 const {ErrorBoundary}=await import('../components/ErrorBoundary');const container=document.createElement('div'),root=createRoot(container)
 const error=Error('fixture render error'),original=console.error;console.error=vi.fn()
 function Broken():React.ReactNode{throw error}
 try{
  await act(async()=>root.render(React.createElement(ErrorBoundary,{fallback:React.createElement('p',null,'安全な表示'),children:React.createElement(Broken)})))
  expect(container.textContent).toBe('安全な表示')
  expect(m.captureException).toHaveBeenCalledTimes(1);expect(m.captureException).toHaveBeenCalledWith(error,{extra:expect.objectContaining({isChunkError:false,componentStack:expect.any(String)})})
 }finally{await act(async()=>root.unmount());console.error=original}
})

it('本番buildで環境名未設定ならdevelopmentへ誤分類しない',async()=>{
 vi.stubEnv('VITE_APP_ENV','');vi.stubEnv('PROD',true);const s=await import('./sentry');s.initSentry()
 expect(m.init).toHaveBeenCalledWith(expect.objectContaining({environment:'unknown',sampleRate:1,tracesSampleRate:0}))
})
it('明示stagingの監視環境名は維持する',async()=>{
 vi.stubEnv('VITE_APP_ENV','staging');const s=await import('./sentry');s.initSentry()
 expect(m.init).toHaveBeenCalledWith(expect.objectContaining({environment:'staging',sampleRate:1,tracesSampleRate:0}))
})
