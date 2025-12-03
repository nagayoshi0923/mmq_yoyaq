/**
 * 未設定スタッフに初期パスワードを設定するスクリプト
 * 
 * 実行方法:
 * SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/set-initial-passwords.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ 環境変数が設定されていません')
  console.log('')
  console.log('使用方法:')
  console.log('SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/set-initial-passwords.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// 初期パスワード（6文字以上必要）
const INITIAL_PASSWORD = '222222'

// パスワード未設定のユーザー一覧
const targetEmails = [
  'kanade.2.games@gmail.com',
  'vodkaquiz@gmail.com',
  '1682.hoheto.tirinuruwo@gmail.com',
  'miho28gt9@gmail.com',
  'lachdochmal8215@gmail.com',
  'ganecuragul.325xz@gmail.com',
  'kensuke0028@gmail.com',
  'iwasemorishi@gmail.com',
  'lingning6210@gmail.com',
  'impactgam1210john@ezweb.ne.jp',
  'n.saya.intern@gmail.com',
  // 未ログイン（パスワード設定済みだがログインしていない）
  'kanau.storytellingbunny@gmail.com',
  // テスト用
  'mai.mine0202@gmail.com'  // 0000
]

async function setInitialPasswords() {
  console.log('🔐 初期パスワード設定を開始します...')
  console.log(`📧 対象: ${targetEmails.length}名`)
  console.log(`🔑 パスワード: ${INITIAL_PASSWORD}`)
  console.log('')

  // 全ユーザーを取得
  const { data: userList, error: listError } = await supabase.auth.admin.listUsers()
  
  if (listError) {
    console.error('❌ ユーザー一覧の取得に失敗:', listError)
    return
  }

  let successCount = 0
  let failCount = 0

  for (const email of targetEmails) {
    const user = userList.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    
    if (!user) {
      console.log(`⚠️ ${email}: ユーザーが見つかりません`)
      failCount++
      continue
    }

    try {
      const { error } = await supabase.auth.admin.updateUserById(user.id, {
        password: INITIAL_PASSWORD,
        email_confirm: true // メール確認済みにする
      })

      if (error) {
        console.log(`❌ ${email}: ${error.message}`)
        failCount++
      } else {
        console.log(`✅ ${email}: パスワード設定完了`)
        successCount++
      }
    } catch (err) {
      console.log(`❌ ${email}: ${err.message}`)
      failCount++
    }
  }

  console.log('')
  console.log('📊 結果:')
  console.log(`  ✅ 成功: ${successCount}名`)
  console.log(`  ❌ 失敗: ${failCount}名`)
}

setInitialPasswords()

