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

async function checkSyncStatus() {
  try {
    console.log('=== シナリオとスタッフの同期状況を確認中... ===\n')
    
    // 全シナリオを取得
    const { data: scenarios, error: scenarioError } = await supabase
      .from('scenarios')
      .select('id, title, available_gms')
      .order('title')
    
    if (scenarioError) {
      console.error('シナリオ取得エラー:', scenarioError)
      return
    }
    
    console.log('=== 全シナリオ一覧 ===')
    scenarios.forEach(s => {
      console.log(`${s.title} (${s.id}): ${JSON.stringify(s.available_gms)}`)
    })
    console.log('')
    
    // 古城の呪いを探す
    const scenario = scenarios.find(s => s.title.includes('古城') || s.title.includes('呪い'))
    if (!scenario) {
      console.log('古城の呪いが見つかりません。最初のシナリオを使用します。')
      if (scenarios.length === 0) {
        console.log('シナリオが存在しません')
        return
      }
      const scenario = scenarios[0]
    }
    
    console.log(`シナリオ: ${scenario.title}`)
    console.log(`ID: ${scenario.id}`)
    console.log(`担当GM: ${JSON.stringify(scenario.available_gms)}`)
    console.log('')
    
    // 全スタッフを取得
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id, name, special_scenarios')
      .order('name')
    
    if (staffError) {
      console.error('スタッフ取得エラー:', staffError)
      return
    }
    
    console.log('=== スタッフの担当シナリオ ===')
    staff.forEach(s => {
      const hasScenario = s.special_scenarios?.includes(scenario.id) || false
      console.log(`${s.name}: ${hasScenario ? '✅ 担当' : '❌ 非担当'} (${JSON.stringify(s.special_scenarios)})`)
    })
    
    console.log('\n=== 同期チェック ===')
    const scenarioGms = scenario.available_gms || []
    const staffWithScenario = staff.filter(s => s.special_scenarios?.includes(scenario.id))
    
    console.log(`シナリオの担当GM数: ${scenarioGms.length}`)
    console.log(`担当GMリスト: ${JSON.stringify(scenarioGms)}`)
    console.log(`スタッフの担当シナリオ数: ${staffWithScenario.length}`)
    console.log(`担当スタッフ: ${staffWithScenario.map(s => s.name).join(', ')}`)
    
    // 同期状況をチェック
    const isSynced = scenarioGms.length === staffWithScenario.length && 
                     scenarioGms.every(gm => staffWithScenario.some(s => s.name === gm))
    
    console.log(`\n同期状況: ${isSynced ? '✅ 正常' : '❌ 異常'}`)
    
    if (!isSynced) {
      console.log('\n=== 修正が必要な項目 ===')
      
      // シナリオにいるがスタッフにいないGM
      const missingInStaff = scenarioGms.filter(gm => !staffWithScenario.some(s => s.name === gm))
      if (missingInStaff.length > 0) {
        console.log(`スタッフのspecial_scenariosに追加が必要: ${missingInStaff.join(', ')}`)
      }
      
      // スタッフにいるがシナリオにいないGM
      const missingInScenario = staffWithScenario.filter(s => !scenarioGms.includes(s.name))
      if (missingInScenario.length > 0) {
        console.log(`シナリオのavailable_gmsから削除が必要: ${missingInScenario.map(s => s.name).join(', ')}`)
      }
    }
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

checkSyncStatus()
