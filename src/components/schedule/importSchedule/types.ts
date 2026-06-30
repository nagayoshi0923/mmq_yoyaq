// ImportScheduleModal 系の共有型（Phase 5-2d で ImportScheduleModal.tsx から移動）

// プレビュー用の型
export interface PreviewEvent {
  date: string
  venue: string
  timeSlot: string
  scenario: string
  originalScenario: string  // マッピング前の元のシナリオ名
  scenarioMapped: boolean  // マッピングが行われたか
  gms: string[]
  gmRoles: Record<string, string>  // GM役割 { "GM名": "main" | "sub" | "reception" | "staff" | "observer" }
  originalGms: string  // マッピング前の元のGM入力
  gmMappings: Array<{ from: string; to: string }>  // マッピング情報
  category: string
  isMemo: boolean
  hasExisting: boolean
  notes?: string  // メモ/備考
}
