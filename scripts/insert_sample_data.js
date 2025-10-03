import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// .env.localから環境変数を読み込み
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase環境変数が設定されていません')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function insertSampleData() {
  try {
    console.log('=== サンプルデータを挿入中... ===\n')
    
    // 1. スタッフデータを挿入
    console.log('1. スタッフデータを挿入中...')
    const staffData = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: '田中 太郎',
        line_name: 'tanaka_taro',
        email: 'tanaka@example.com',
        phone: '090-1234-5678',
        role: ['GM', 'マネージャー'],
        stores: ['高田馬場店', '別館①'],
        status: 'active',
        experience: 5,
        availability: ['月', '火', '水', '木', '金'],
        ng_days: ['土', '日'],
        special_scenarios: [],
        notes: 'ベテランGM。新人研修も担当。'
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        name: '佐藤 花子',
        line_name: 'sato_hanako',
        email: 'sato@example.com',
        phone: '080-9876-5432',
        role: ['GM'],
        stores: ['大久保店'],
        status: 'active',
        experience: 4,
        availability: ['土', '日', '月'],
        ng_days: [],
        special_scenarios: [],
        notes: '中堅GM。'
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440003',
        name: '鈴木 一郎',
        line_name: 'suzuki_ichiro',
        email: 'suzuki@example.com',
        phone: '070-1111-2222',
        role: ['GM'],
        stores: ['高田馬場店'],
        status: 'active',
        experience: 3,
        availability: ['火', '水', '木', '金', '土'],
        ng_days: ['日'],
        special_scenarios: [],
        notes: '若手GM。'
      }
    ]
    
    for (const staff of staffData) {
      const { error } = await supabase
        .from('staff')
        .upsert(staff)
      
      if (error) {
        console.error(`スタッフ ${staff.name} の挿入エラー:`, error)
      } else {
        console.log(`✅ スタッフ ${staff.name} を挿入`)
      }
    }
    
    // 2. シナリオデータを挿入
    console.log('\n2. シナリオデータを挿入中...')
    const scenarioData = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        title: '人狼村の悲劇',
        author: 'MMQ制作チーム',
        description: '人狼ゲームをベースにした推理シナリオ。村人たちの裏切りと真実を探る。',
        duration: 240,
        player_count_min: 4,
        player_count_max: 8,
        difficulty: 3,
        rating: 0.0,
        status: 'available',
        participation_fee: 4500,
        production_cost: 380000,
        genre: ['horror', 'mystery'],
        available_gms: [],
        play_count: 0,
        required_props: [],
        has_pre_reading: true,
        production_costs: [
          { item: '小道具・衣装', amount: 150000 },
          { item: '印刷費', amount: 80000 },
          { item: '音響・照明', amount: 100000 },
          { item: 'その他', amount: 50000 }
        ],
        license_costs: [
          { amount: 5000, time_slot: '通常' },
          { amount: 2500, time_slot: 'GMテスト' }
        ],
        gm_assignments: [{ role: 'main', reward: 3000 }]
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        title: '密室の謎',
        author: 'MMQ制作チーム',
        description: '豪華客船の密室で発生した殺人事件。限られた容疑者の中から真犯人を見つけ出せ。',
        duration: 180,
        player_count_min: 5,
        player_count_max: 7,
        difficulty: 4,
        rating: 0.0,
        status: 'available',
        participation_fee: 4000,
        production_cost: 400000,
        genre: ['classic', 'mystery'],
        available_gms: [],
        play_count: 0,
        required_props: [],
        has_pre_reading: false,
        production_costs: [
          { item: '小道具', amount: 120000 },
          { item: '印刷費', amount: 100000 },
          { item: '音響・照明', amount: 120000 },
          { item: 'その他', amount: 80000 }
        ],
        license_costs: [
          { amount: 6000, time_slot: '通常' },
          { amount: 3000, time_slot: 'GMテスト' }
        ],
        gm_assignments: [{ role: 'main', reward: 3500 }]
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440003',
        title: '古城の呪い',
        author: 'MMQ制作チーム',
        description: '中世の古城を舞台にしたホラーシナリオ。呪いの真実を解き明かす。',
        duration: 300,
        player_count_min: 4,
        player_count_max: 8,
        difficulty: 5,
        rating: 0.0,
        status: 'available',
        participation_fee: 5000,
        production_cost: 450000,
        genre: ['horror', 'mystery'],
        available_gms: [],
        play_count: 0,
        required_props: [],
        has_pre_reading: true,
        production_costs: [
          { item: '小道具・衣装', amount: 200000 },
          { item: '印刷費', amount: 100000 },
          { item: '音響・照明', amount: 100000 },
          { item: 'その他', amount: 50000 }
        ],
        license_costs: [
          { amount: 7000, time_slot: '通常' },
          { amount: 3500, time_slot: 'GMテスト' }
        ],
        gm_assignments: [{ role: 'main', reward: 4000 }]
      }
    ]
    
    for (const scenario of scenarioData) {
      const { error } = await supabase
        .from('scenarios')
        .upsert(scenario)
      
      if (error) {
        console.error(`シナリオ ${scenario.title} の挿入エラー:`, error)
      } else {
        console.log(`✅ シナリオ ${scenario.title} を挿入`)
      }
    }
    
    // 3. 担当関係を挿入
    console.log('\n3. 担当関係を挿入中...')
    const assignments = [
      {
        staff_id: '550e8400-e29b-41d4-a716-446655440001', // 田中 太郎
        scenario_id: '550e8400-e29b-41d4-a716-446655440001', // 人狼村の悲劇
        notes: 'メインGMとして担当'
      },
      {
        staff_id: '550e8400-e29b-41d4-a716-446655440001', // 田中 太郎
        scenario_id: '550e8400-e29b-41d4-a716-446655440003', // 古城の呪い
        notes: 'メインGMとして担当'
      },
      {
        staff_id: '550e8400-e29b-41d4-a716-446655440002', // 佐藤 花子
        scenario_id: '550e8400-e29b-41d4-a716-446655440002', // 密室の謎
        notes: 'メインGMとして担当'
      },
      {
        staff_id: '550e8400-e29b-41d4-a716-446655440003', // 鈴木 一郎
        scenario_id: '550e8400-e29b-41d4-a716-446655440001', // 人狼村の悲劇
        notes: 'サブGMとして担当'
      }
    ]
    
    for (const assignment of assignments) {
      const { error } = await supabase
        .from('staff_scenario_assignments')
        .upsert(assignment)
      
      if (error) {
        console.error(`担当関係の挿入エラー:`, error)
      } else {
        console.log(`✅ 担当関係を挿入`)
      }
    }
    
    console.log('\n=== サンプルデータの挿入完了 ===')
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

insertSampleData()
