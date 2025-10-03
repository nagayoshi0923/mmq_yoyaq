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

async function checkScenarioGms() {
  try {
    console.log('シナリオのavailable_gmsを確認中...')
    
    const { data: scenarios, error } = await supabase
      .from('scenarios')
      .select('id, title, available_gms')
      .order('title')
    
    if (error) {
      console.error('エラー:', error)
      return
    }
    
    console.log(`\n${scenarios.length}件のシナリオを確認しました:`)
    scenarios.forEach(scenario => {
      console.log(`- ${scenario.title}: available_gms = ${JSON.stringify(scenario.available_gms)}`)
    })
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

checkScenarioGms()
