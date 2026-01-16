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
  slug?: string  // URL用の短い識別子（英数字とハイフン）
  author: string
  author_email?: string  // 作者メールアドレス（作者ポータル連携用）
  scenario_master_id?: string  // マスタから引用した場合のマスタID
  description: string
  duration: number // 分単位
  weekend_duration?: number | null // 土日・祝日の公演時間（分）
  player_count_min: number
  player_count_max: number
  difficulty: number
  rating?: number
  status: string
  participation_fee: number
  production_costs: { item: string; amount: number }[]
  depreciation_per_performance?: number // 1公演あたりの償却金額
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
    category?: 'normal' | 'gmtest'
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
  // キービジュアル画像URL
  key_visual_url?: string
  // ライセンス金額
  license_amount?: number
  gm_test_license_amount?: number
  // シナリオタイプ
  scenario_type?: 'normal' | 'managed'
  // 他店用（フランチャイズ）ライセンス金額（作者への支払い）
  franchise_license_amount?: number
  franchise_gm_test_license_amount?: number
  // 他社公演料（他社がMMQに支払う金額）
  external_license_amount?: number
  external_gm_test_license_amount?: number
  // 他店用（フランチャイズ）ライセンス報酬（UI用配列）
  franchise_license_rewards?: {
    item: string
    amount: number
    type?: 'fixed' | 'percentage'
    status?: 'active' | 'legacy' | 'unused' | 'ready'
    usageCount?: number
    startDate?: string
    endDate?: string
  }[]
  // 公演可能店舗（UUID配列）
  available_stores?: string[]
  // キット数（制作費自動計算用）
  kit_count?: number
  // 追加準備時間（分）- 通常の60分に加算される
  extra_preparation_time?: number
}

