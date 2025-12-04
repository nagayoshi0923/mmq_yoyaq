/**
 * Supabase Auth設定を更新するスクリプト
 * 
 * 使用方法:
 * node scripts/update-auth-config.mjs
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const PROJECT_REF = 'cznpcewciwywcqcxktba'
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN

if (!SUPABASE_ACCESS_TOKEN) {
  console.error('❌ SUPABASE_ACCESS_TOKEN が設定されていません')
  console.log('')
  console.log('📋 手順:')
  console.log('1. https://supabase.com/dashboard/account/tokens でトークンを生成')
  console.log('2. 以下のコマンドで実行:')
  console.log('   SUPABASE_ACCESS_TOKEN=your_token node scripts/update-auth-config.mjs')
  process.exit(1)
}

async function updateAuthConfig() {
  console.log('🔧 Supabase Auth設定を更新します...')

  try {
    // 現在の設定を取得
    const getResponse = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
      {
        headers: {
          'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!getResponse.ok) {
      throw new Error(`設定取得エラー: ${getResponse.status} ${await getResponse.text()}`)
    }

    const currentConfig = await getResponse.json()
    console.log('📋 現在の設定:')
    console.log('  - OTP Expiry:', currentConfig.MAILER_OTP_EXP || '未設定', '秒')
    console.log('  - Site URL:', currentConfig.SITE_URL || '未設定')

    // 設定を更新（必要な項目のみ）
    const newConfig = {
      MAILER_OTP_EXP: 86400, // 24時間（秒）
    }

    const updateResponse = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newConfig)
      }
    )

    if (!updateResponse.ok) {
      throw new Error(`設定更新エラー: ${updateResponse.status} ${await updateResponse.text()}`)
    }

    console.log('✅ Auth設定を更新しました:')
    console.log('  - OTP Expiry: 86400秒（24時間）')
    console.log('')
    console.log('⚠️ 注意: 招待リンクの有効期限は Supabase Dashboard で手動設定が必要な場合があります')
    console.log('   https://supabase.com/dashboard/project/' + PROJECT_REF + '/settings/auth')

  } catch (error) {
    console.error('❌ エラー:', error.message)
    process.exit(1)
  }
}

updateAuthConfig()

