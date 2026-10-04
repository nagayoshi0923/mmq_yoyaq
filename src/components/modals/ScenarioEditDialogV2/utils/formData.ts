/**
 * 作品編集画面の入力欄の値（初期値・新規作成・作品データからの変換）。
 * ScenarioEditDialogV2.tsx から、値を変えずに切り出したもの。
 */
import { parseScenarioSlotStartTimes } from '@/lib/privateBookingSlotStartTimes'
import type { Scenario } from '@/types'
import type { ScenarioFormData } from '../types'

/** 画面を開いた直後の値（読み込み前） */
export function initialScenarioFormData(): ScenarioFormData {
  return {
    title: '',
    slug: '',
    author: '',
    author_email: '',
    description: '',
    duration: 120,
    player_count_min: 8,
    player_count_max: 8,
    male_count: null,
    female_count: null,
    other_count: null,
    difficulty: 3,
    rating: undefined,
    status: 'available',
    participation_fee: 3000,
    production_costs: [
      { item: 'キット', amount: 30000 },
      { item: 'マニュアル', amount: 10000 },
      { item: 'スライド', amount: 10000 },
    ],
    kit_count: 1,
    depreciation_per_performance: 0,
    genre: [],
    required_props: [],
    license_amount: 0,
    gm_test_license_amount: 0,
    is_license_buyout: false,
    license_rewards: [
      { item: 'normal', amount: 0, type: 'fixed' },
      { item: 'gmtest', amount: 0, type: 'fixed' }
    ],
    caution: '',
    sensitive_tags: [],
    has_pre_reading: false,
    gm_count: 1,
    gm_assignments: [],  // 空配列 = デフォルト報酬を使用
    participation_costs: [
      { time_slot: 'normal', amount: 4000, type: 'fixed' },
      { time_slot: 'gmtest', amount: 3000, type: 'fixed' },
    ],
    characters: [],  // キャラクター情報
    use_flexible_pricing: false,
    flexible_pricing: {
      base_pricing: { participation_fee: 3000 },
      pricing_modifiers: [],
      gm_configuration: {
        required_count: 1,
        optional_count: 0,
        total_max: 2,
        special_requirements: ''
      }
    },
    key_visual_url: '',
    scenario_kind: 'regular',
    accepts_private_booking: true,
    available_from: null,
    available_until: null,
  }
}

/** 新規作成で開いたときの値 */
export function newScenarioFormData(): ScenarioFormData {
  return {
      title: '',
      slug: '',
      author: '',
      author_email: '',
      description: '',
      duration: 120,
      player_count_min: 8,
      player_count_max: 8,
      male_count: null,
      female_count: null,
      difficulty: 3,
      rating: undefined,
      status: 'available',
      participation_fee: 3000,
      production_costs: [
        { item: 'キット', amount: 30000 },
        { item: 'マニュアル', amount: 10000 },
        { item: 'スライド', amount: 10000 },
      ],
      kit_count: 1,
      genre: [],
      required_props: [],
      license_amount: 0,
      gm_test_license_amount: 0,
      is_license_buyout: false,
      scenario_type: 'normal',
      franchise_license_amount: undefined,
      franchise_gm_test_license_amount: undefined,
      franchise_license_rewards: [
        { item: 'normal', amount: 0, type: 'fixed' as const },
        { item: 'gmtest', amount: 0, type: 'fixed' as const }
      ],
      license_rewards: [
        { item: 'normal', amount: 0, type: 'fixed' },
        { item: 'gmtest', amount: 0, type: 'fixed' }
      ],
      has_pre_reading: false,
      gm_count: 1,
      gm_assignments: [],
      participation_costs: [
    { time_slot: 'normal', amount: 4000, type: 'fixed' },
    { time_slot: 'gmtest', amount: 3000, type: 'fixed' },
  ],
      use_flexible_pricing: false,
      flexible_pricing: {
        base_pricing: { participation_fee: 3000 },
        pricing_modifiers: [],
        gm_configuration: {
          required_count: 1,
          optional_count: 0,
          total_max: 2,
          special_requirements: ''
        }
      },
      caution: '',
      sensitive_tags: [],
      key_visual_url: '',
      available_stores: [],
      characters: [],
      scenario_kind: 'regular',
      accepts_private_booking: true,
      available_from: null,
      available_until: null,
  }
}

/** 作品データを入力欄の値にする（組織ごとの上書き値は呼び出し側で後から重ねる） */
export function scenarioToFormData(scenario: Scenario): ScenarioFormData {
  // データをフォームにマッピング
  // participation_costs：DBに存在する場合は使用、なければ生成
  const normalFee = scenario.participation_fee || 3000
  const existingCosts = scenario.participation_costs || []
  const hasGmTest = existingCosts.some((c) => c.time_slot === 'gmtest')
  const participationCosts = existingCosts.length > 0
    ? hasGmTest 
      ? existingCosts 
      : [...existingCosts, { time_slot: 'gmtest', amount: Math.max(0, normalFee - 1000), type: 'fixed' as const }]
    : [
        { time_slot: 'normal', amount: normalFee, type: 'fixed' as const },
        { time_slot: 'gmtest', amount: Math.max(0, normalFee - 1000), type: 'fixed' as const }
      ]

  // license_rewards は DB に存在しないため、常に license_amount から生成
  const licenseRewards = [
    { item: 'normal', amount: (scenario.license_amount ?? 0), type: 'fixed' as const },
    { item: 'gmtest', amount: (scenario.gm_test_license_amount ?? 0), type: 'fixed' as const }
  ]
  
  // デフォルトのflexible_pricingを定義
  const defaultFlexiblePricing = {
    base_pricing: { participation_fee: 3000 },
    pricing_modifiers: [],
    gm_configuration: {
      required_count: 1,
      optional_count: 0,
      total_max: 2,
      special_requirements: ''
    }
  }
  
  return {
    title: scenario.title || '',
    slug: scenario.slug || '',
    author: scenario.author || '',
    author_email: scenario.author_email || '',
    scenario_master_id: scenario.scenario_master_id ?? undefined, // organization_scenarios連携用
    organization_id: scenario.organization_id ?? null,
    description: scenario.description || '',
    duration: scenario.duration || 120,
    player_count_min: scenario.player_count_min || 4,
    player_count_max: scenario.player_count_max || 8,
    male_count: scenario.male_count ?? null,
    female_count: scenario.female_count ?? null,
    other_count: scenario.other_count ?? null,
    difficulty: scenario.difficulty || 3,
    rating: scenario.rating,
    status: scenario.status || 'available',
    participation_fee: scenario.participation_fee || 3000,
    production_costs: (scenario.production_costs && scenario.production_costs.length > 0) 
      ? scenario.production_costs 
      : [
          { item: 'キット', amount: 30000 },
          { item: 'マニュアル', amount: 10000 },
          { item: 'スライド', amount: 10000 },
        ],
    kit_count: scenario.kit_count || 1,
    depreciation_per_performance: scenario.depreciation_per_performance || 0,
    genre: scenario.genre || [],
    required_props: scenario.required_props || [],
    license_amount: (scenario.license_amount ?? 0),
    gm_test_license_amount: (scenario.gm_test_license_amount ?? 0),
    is_license_buyout: scenario.is_license_buyout === true,
    scenario_type: scenario.scenario_type || 'normal',
    franchise_license_amount: scenario.franchise_license_amount,
    franchise_gm_test_license_amount: scenario.franchise_gm_test_license_amount,
    external_license_amount: scenario.external_license_amount,
    external_gm_test_license_amount: scenario.external_gm_test_license_amount,
    // フランチャイズ公演時
    fc_receive_license_amount: scenario.fc_receive_license_amount,
    fc_receive_gm_test_license_amount: scenario.fc_receive_gm_test_license_amount,
    fc_author_license_amount: scenario.fc_author_license_amount,
    fc_author_gm_test_license_amount: scenario.fc_author_gm_test_license_amount,
    // franchise_license_rewards は DB に存在しないため、常に franchise_license_amount から生成
    // 0円でも表示する（null/undefinedの場合は0円）
    franchise_license_rewards: [
      { 
        item: 'normal', 
        amount: (scenario.franchise_license_amount != null ? scenario.franchise_license_amount : 0), 
        type: 'fixed' as const 
      },
      { 
        item: 'gmtest', 
        amount: (scenario.franchise_gm_test_license_amount != null ? scenario.franchise_gm_test_license_amount : 0), 
        type: 'fixed' as const 
      }
    ],
    license_rewards: licenseRewards,
    has_pre_reading: scenario.has_pre_reading || false,
    gm_count: scenario.gm_count || 1, // フォーム専用フィールド
    gm_assignments: (scenario.gm_costs && scenario.gm_costs.length > 0) 
      ? scenario.gm_costs.map(cost => ({
          role: cost.role,
          reward: cost.reward,
          category: cost.category || 'normal' as 'normal' | 'gmtest'
        }))
      : [],  // 空配列 = デフォルト報酬を使用
    participation_costs: participationCosts,
    use_flexible_pricing: scenario.use_flexible_pricing || false, // フォーム専用フィールド
    flexible_pricing: scenario.flexible_pricing || defaultFlexiblePricing,
    key_visual_url: scenario.key_visual_url || '',
    available_stores: scenario.available_stores || [],
    extra_preparation_time: scenario.extra_preparation_time || undefined,
    private_booking_time_slots: scenario.private_booking_time_slots || [],
    private_booking_time_slots_weekend: scenario.private_booking_time_slots_weekend ?? null,
    private_booking_slot_start_times: parseScenarioSlotStartTimes(scenario.private_booking_slot_start_times),
    caution: '',
    sensitive_tags: [],
    characters: [],  // organization_scenariosから後で取得
  }
}
