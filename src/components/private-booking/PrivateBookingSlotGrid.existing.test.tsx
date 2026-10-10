// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { PrivateBookingSlotGrid } from './PrivateBookingSlotGrid'
it.each([true,false])('追加済み・選べない枠（押すと理由）・新規選択を区別する（compact=%s）',async compact=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 const host=document.createElement('div'),root=createRoot(host),toggle=vi.fn()
 const slot={key:'evening' as const,label:'夜' as const,startTime:'19:00',endTime:'23:00'}
 await act(async()=>root.render(<PrivateBookingSlotGrid currentMonth={new Date(2026,10,1)} onMonthChange={()=>{}} isPrevMonthDisabled availableDates={['2026-11-01','2026-11-02','2026-11-03']} slotsByDate={Object.fromEntries(['2026-11-01','2026-11-02','2026-11-03'].map(d=>[d,[slot]]))} selectedSlots={[]} onSlotToggle={toggle} maxSelections={100} unavailableReasons={{'2026-11-01-夜':'追加済みの候補です','2026-11-02-夜':'他の公演と重なります'}} existingSlotKeys={new Set(['2026-11-01-夜'])} compact={compact} />))
 const buttons=[...host.querySelectorAll('button')]
 const existing=buttons.find(b=>b.getAttribute('aria-label')==='2026-11-01 夜 追加済み')!
 const blocked=buttons.find(b=>b.getAttribute('aria-label')==='2026-11-02 夜 選択不可（他の公演と重なります）')!
 const fresh=buttons.find(b=>b.getAttribute('aria-label')==='2026-11-03 夜')!
 expect(existing.disabled).toBe(true);expect(existing.textContent).toContain('追加済み');expect(existing.className).toContain('bg-purple-50')
 expect(blocked.disabled).toBe(false);expect(blocked.getAttribute('aria-disabled')).toBe('true');expect(blocked.textContent).not.toContain('追加済み')
 await act(async()=>{existing.click();blocked.click();fresh.click()});expect(toggle).toHaveBeenCalledExactlyOnceWith('2026-11-03',slot)
 await act(async()=>blocked.click());expect(host.querySelector('[role=status]')?.textContent).toBe('11/02 夜: 他の公演と重なります');expect(toggle).toHaveBeenCalledTimes(1)
 await act(async()=>root.unmount())
})
