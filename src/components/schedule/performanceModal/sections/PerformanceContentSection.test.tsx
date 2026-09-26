import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { KitLocation, Store } from '@/types'
import type { EventFormData } from '@/types/schedule'
import { getUsableKitStoreIds } from '@/utils/scheduleWarnings'
import { PerformanceContentSection } from './PerformanceContentSection'

vi.mock('@/components/ui/searchable-select', () => ({ SearchableSelect: () => null }))

const props: ComponentProps<typeof PerformanceContentSection> = {
  CATEGORY_TONE: {},
  formData: { scenario: '検証作品', venue: 'store-a', category: 'open', max_participants: 6 } as EventFormData,
  setFormData: vi.fn(), localCurrentParticipants: 0, mode: 'edit',
  setPendingScenarioTitle: vi.fn(), applyScenarioChange: vi.fn(), scenarioOptions: [],
  setIsScenarioDialogOpen: vi.fn(), scenarios: [], isScenarioAvailableAtVenue: () => true,
  stores: [{ id: 'store-a', name: '検証店舗' }] as Store[],
  kitStoreIds: null, setEditingScenarioId: vi.fn(),
}

function renderKit(condition: KitLocation['condition']) {
  const kitStoreIds = getUsableKitStoreIds([{ store_id: 'store-a', condition }] as KitLocation[])
  return renderToStaticMarkup(<PerformanceContentSection {...props} kitStoreIds={kitStoreIds} />)
}

describe('公演編集画面のキット警告', () => {
  it.each(['damaged', 'repairing', 'missing_parts', 'retired'] as const)('%s を置いても未配置と表示する', condition => {
    const html = renderKit(condition)
    expect(html).toContain('キット未配置:')
    expect(html).toContain('使用可能なキットがありません')
    expect(html).not.toContain('キットが未登録です')
  })
  it('良好なキットを配置したときは警告しない', () => {
    expect(renderKit('good')).not.toContain('キット未配置:')
  })
  it('取得中は誤警告を出さない', () => {
    expect(renderToStaticMarkup(<PerformanceContentSection {...props} />)).not.toContain('キット未配置:')
  })
})
