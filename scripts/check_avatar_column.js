import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase環境変数が設定されていません')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkAvatarColumn() {
  console.log('🔍 staffテーブルのカラムを確認中...\n')
  
  // スタッフデータを1件取得してカラムを確認
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .limit(1)
  
  if (error) {
    console.error('❌ エラー:', error.message)
    return
  }
  
  if (data && data.length > 0) {
    console.log('✅ 取得したスタッフデータのカラム:')
    console.log(Object.keys(data[0]).join(', '))
    console.log('\n📋 avatar_url:', data[0].avatar_url || '未設定')
    console.log('📋 avatar_color:', data[0].avatar_color || '未設定')
  } else {
    console.log('⚠️ スタッフデータがありません')
  }
}

checkAvatarColumn()
