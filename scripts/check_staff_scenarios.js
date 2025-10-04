import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// .env.localを読み込み
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase環境変数が設定されていません')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkStaffScenarios() {
  console.log('🔍 スタッフと担当シナリオの確認\n')
  
  // スタッフ一覧を取得
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, name')
    .order('name')
  
  console.log('📡 Supabase接続:', { url: supabaseUrl.substring(0, 30) + '...' })
  console.log('🔑 使用中のキー:', supabaseKey.substring(0, 20) + '...')
  
  if (staffError) {
    console.error('❌ スタッフ取得エラー:', staffError)
    return
  }
  
  console.log(`📋 スタッフ数: ${staff ? staff.length : 0}`)
  console.log('📦 取得したデータ:', staff)
  
  // 各スタッフの担当シナリオを確認
  for (const member of staff) {
    const { data: assignments, error: assignmentError } = await supabase
      .from('staff_scenario_assignments')
      .select('scenario_id')
      .eq('staff_id', member.id)
    
    if (assignmentError) {
      console.error(`❌ ${member.name} の担当シナリオ取得エラー:`, assignmentError)
      continue
    }
    
    console.log(`👤 ${member.name}: ${assignments.length}個のシナリオ担当`)
    
    if (assignments.length > 0) {
      // シナリオ名を取得
      for (const assignment of assignments) {
        const { data: scenario } = await supabase
          .from('scenarios')
          .select('title')
          .eq('id', assignment.scenario_id)
          .single()
        
        if (scenario) {
          console.log(`   - ${scenario.title}`)
        }
      }
    }
  }
  
  // テーブル全体のレコード数
  const { count } = await supabase
    .from('staff_scenario_assignments')
    .select('*', { count: 'exact', head: true })
  
  console.log(`\n📊 staff_scenario_assignments テーブル総レコード数: ${count}`)
}

checkStaffScenarios()

