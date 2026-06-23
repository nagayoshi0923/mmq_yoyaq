import type { KitCondition } from '@/types'

// ドラッグ中のキット情報
export interface DraggedKit {
  scenarioId: string
  kitNumber: number
  fromStoreId: string
}

// コンテキストメニュー情報
export interface ContextMenuState {
  x: number
  y: number
  scenarioId: string
  kitNumber: number
  storeId: string
  condition: KitCondition
}

export interface KitManagementDialogProps {
  isOpen: boolean
  onClose: () => void
}
