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
  isFixed: boolean  // このキットが固定中か（キット番号ごと）
}

// 設置確認ダイアログの対象キット情報
export interface DeliveryConfirmState {
  scenarioId: string
  kitNumber: number
  performanceDate: string
  toStoreId: string
  scenarioTitle: string
  toStoreName: string
  orgScenarioId?: string
}

export interface KitManagementDialogProps {
  isOpen: boolean
  onClose: () => void
}
