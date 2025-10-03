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

async function checkTables() {
  try {
    console.log('=== データベーステーブル一覧を確認中... ===\n')
    
    // 各テーブルの存在確認とレコード数
    const tables = [
      'staff',
      'scenarios', 
      'stores',
      'schedule_events',
      'staff_scenario_assignments'
    ]
    
    for (const table of tables) {
      try {
        const { data, error, count } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
        
        if (error) {
          console.log(`❌ ${table}: テーブルが存在しません (${error.message})`)
        } else {
          console.log(`✅ ${table}: ${count}件のレコード`)
        }
      } catch (err) {
        console.log(`❌ ${table}: エラー (${err.message})`)
      }
    }
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

checkTables()
