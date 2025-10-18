/**
 * ScenarioEditModal で使用する型定義
 */

import type { Scenario, FlexiblePricing } from '@/types'

export interface ScenarioEditModalProps {
  scenario: Scenario | null
  isOpen: boolean
  onClose: () => void
  onSave: (scenario: Scenario) => void
}

export interface ScenarioFormData {
  title: string
  author: string
  description: string
  duration: number // 分単位
  player_count_min: number
  player_count_max: number
  difficulty: number
  rating?: number
  status: string
  participation_fee: number
  production_costs: { item: string; amount: number }[]
  genre: string[]
  required_props: { item: string; amount: number; frequency: 'recurring' | 'one-time' }[]
  license_rewards: { 
    item: string
    amount: number
    type?: 'fixed' | 'percentage'
    status?: 'active' | 'legacy' | 'unused' | 'ready'
    usageCount?: number
    startDate?: string
    endDate?: string
  }[]
  has_pre_reading: boolean
  gm_count: number
  gm_assignments: { 
    role: string
    reward: number
    status?: 'active' | 'legacy' | 'unused' | 'ready'
    usageCount?: number
    startDate?: string
    endDate?: string
  }[]
  // 時間帯別料金設定
  participation_costs: { 
    time_slot: string
    amount: number
    type: 'percentage' | 'fixed'
    status?: 'active' | 'legacy' | 'unused' | 'ready'
    usageCount?: number
    startDate?: string
    endDate?: string
  }[]
  // 柔軟な料金設定
  use_flexible_pricing: boolean
  flexible_pricing: FlexiblePricing
}

