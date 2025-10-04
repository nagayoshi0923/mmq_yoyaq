import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// .env.localから環境変数を読み込む
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Supabase環境変数が設定されていません')
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? '✓' : '✗')
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function executeSqlFile(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8')
  
  // コメント行を削除
  const statements = sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--') && line.trim() !== '')
    .join('\n')
  
  console.log(`\n📄 実行中: ${path.basename(filePath)}`)
  console.log('SQL:', statements.substring(0, 100) + '...')
  
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: statements })
  
  if (error) {
    // rpcが使えない場合は直接実行を試みる
    const queries = statements.split(';').filter(q => q.trim())
    
    for (const query of queries) {
      if (!query.trim()) continue
      
      try {
        const { error: queryError } = await supabase.rpc('query', { query_text: query })
        if (queryError) {
          console.error(`⚠️  エラー: ${queryError.message}`)
          // エラーが出ても続行（カラムが既に存在する場合など）
        }
      } catch (e) {
        console.error(`⚠️  実行エラー: ${e.message}`)
      }
    }
  }
  
  console.log(`✅ 完了: ${path.basename(filePath)}`)
}

async function main() {
  console.log('🚀 スタッフ機能のセットアップを開始します...\n')
  
  const sqlFiles = [
    path.join(__dirname, '..', 'database', 'add_staff_avatar.sql'),
    path.join(__dirname, '..', 'database', 'add_staff_user_id.sql'),
    path.join(__dirname, '..', 'database', 'create_shift_submissions_table.sql')
  ]
  
  for (const file of sqlFiles) {
    if (fs.existsSync(file)) {
      await executeSqlFile(file)
    } else {
      console.warn(`⚠️  ファイルが見つかりません: ${file}`)
    }
  }
  
  console.log('\n✨ セットアップ完了！\n')
  console.log('次のステップ:')
  console.log('1. Supabase Studioで以下のSQLを手動実行してください:')
  console.log('   (スタッフとユーザーを紐付ける)')
  console.log('')
  console.log('   UPDATE staff')
  console.log('   SET user_id = (SELECT id FROM auth.users WHERE auth.users.email = staff.email)')
  console.log('   WHERE email IS NOT NULL;')
  console.log('')
  console.log('2. スタッフアカウントでログインしてシフト提出をテスト')
}

main().catch(console.error)

