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

async function checkAssignmentsTable() {
  try {
    console.log('=== staff_scenario_assignmentsテーブルの状況を確認中... ===\n')
    
    // テーブルの構造を確認
    const { data: tableInfo, error: tableError } = await supabase
      .from('staff_scenario_assignments')
      .select('*')
      .limit(1)
    
    if (tableError) {
      console.error('テーブルアクセスエラー:', tableError)
      return
    }
    
    console.log('✅ staff_scenario_assignmentsテーブルにアクセス可能')
    
    // レコード数を確認
    const { count, error: countError } = await supabase
      .from('staff_scenario_assignments')
      .select('*', { count: 'exact', head: true })
    
    if (countError) {
      console.error('カウントエラー:', countError)
    } else {
      console.log(`📊 レコード数: ${count}件`)
    }
    
    // 既存のJSONB配列データを確認
    console.log('\n=== 既存のJSONB配列データ ===')
    
    // スタッフのspecial_scenarios
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('id, name, special_scenarios')
      .not('special_scenarios', 'is', null)
    
    if (staffError) {
      console.error('スタッフデータ取得エラー:', staffError)
    } else {
      console.log(`スタッフのspecial_scenarios: ${staffData?.length || 0}件`)
      staffData?.forEach(s => {
        if (s.special_scenarios && s.special_scenarios.length > 0) {
          console.log(`  - ${s.name}: ${JSON.stringify(s.special_scenarios)}`)
        }
      })
    }
    
    // シナリオのavailable_gms
    const { data: scenarioData, error: scenarioError } = await supabase
      .from('scenarios')
      .select('id, title, available_gms')
      .not('available_gms', 'is', null)
    
    if (scenarioError) {
      console.error('シナリオデータ取得エラー:', scenarioError)
    } else {
      console.log(`シナリオのavailable_gms: ${scenarioData?.length || 0}件`)
      scenarioData?.forEach(s => {
        if (s.available_gms && s.available_gms.length > 0) {
          console.log(`  - ${s.title}: ${JSON.stringify(s.available_gms)}`)
        }
      })
    }
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

checkAssignmentsTable()
