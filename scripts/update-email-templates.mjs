/**
 * Supabase メールテンプレートを更新するスクリプト
 * 
 * 使用方法:
 * node scripts/update-email-templates.mjs
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// .env.local から環境変数を読み込む
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local')
    const envContent = readFileSync(envPath, 'utf-8')
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([^=]+)=(.*)$/)
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2]
      }
    }
  } catch (e) {
    // .env.local が存在しない場合は無視
  }
}

loadEnv()

const PROJECT_REF = 'cznpcewciwywcqcxktba'
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN

if (!SUPABASE_ACCESS_TOKEN) {
  console.error('❌ SUPABASE_ACCESS_TOKEN が設定されていません')
  console.log('')
  console.log('📋 手順:')
  console.log('1. https://supabase.com/dashboard/account/tokens でトークンを生成')
  console.log('2. 以下のコマンドで実行:')
  console.log('   SUPABASE_ACCESS_TOKEN=your_token node scripts/update-email-templates.mjs')
  process.exit(1)
}

// メールテンプレート（MMQブランド）
const emailTemplates = {
  // 新規登録確認メール
  MAILER_SUBJECTS_CONFIRMATION: '【MMQ】メールアドレスの確認',
  MAILER_TEMPLATES_CONFIRMATION: `
<div style="font-family: 'Hiragino Kaku Gothic ProN', 'ヒラギノ角ゴ ProN W3', Meiryo, メイリオ, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #1a1a2e; font-size: 24px; margin: 0;">MMQ</h1>
    <p style="color: #666; font-size: 14px; margin-top: 5px;">マーダーミステリー予約</p>
  </div>
  
  <div style="background: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h2 style="color: #1a1a2e; font-size: 18px; margin: 0 0 20px 0;">アカウント登録ありがとうございます</h2>
    <p style="color: #333; line-height: 1.8; margin: 0 0 20px 0;">
      以下のボタンをクリックして、メールアドレスを確認してください。<br>
      確認が完了すると、プロフィール設定画面に進みます。
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{ .ConfirmationURL }}" 
         style="display: inline-block; background: #1a1a2e; color: white; padding: 15px 40px; 
                text-decoration: none; border-radius: 4px; font-weight: bold;">
        メールアドレスを確認する
      </a>
    </div>
    <p style="color: #888; font-size: 12px; margin: 20px 0 0 0;">
      ※ このリンクは24時間有効です
    </p>
  </div>
  
  <div style="border-top: 1px solid #eee; padding-top: 20px; color: #888; font-size: 12px;">
    <p style="margin: 0 0 10px 0;">
      <strong>セキュリティについて</strong><br>
      ・このメールに心当たりがない場合は、無視して削除してください<br>
      ・パスワードは他人に教えないでください
    </p>
    <p style="margin: 20px 0 0 0; text-align: center;">
      このメールはMMQマーダーミステリー予約システムから自動送信されています。
    </p>
  </div>
</div>
  `.trim(),

  // パスワードリセットメール
  MAILER_SUBJECTS_RECOVERY: '【MMQ】パスワードリセット',
  MAILER_TEMPLATES_RECOVERY: `
<div style="font-family: 'Hiragino Kaku Gothic ProN', 'ヒラギノ角ゴ ProN W3', Meiryo, メイリオ, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #1a1a2e; font-size: 24px; margin: 0;">MMQ</h1>
    <p style="color: #666; font-size: 14px; margin-top: 5px;">マーダーミステリー予約</p>
  </div>
  
  <div style="background: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h2 style="color: #1a1a2e; font-size: 18px; margin: 0 0 20px 0;">パスワードリセットのリクエスト</h2>
    <p style="color: #333; line-height: 1.8; margin: 0 0 20px 0;">
      パスワードリセットのリクエストを受け付けました。<br>
      以下のボタンをクリックして、新しいパスワードを設定してください。
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{ .ConfirmationURL }}" 
         style="display: inline-block; background: #1a1a2e; color: white; padding: 15px 40px; 
                text-decoration: none; border-radius: 4px; font-weight: bold;">
        パスワードを再設定する
      </a>
    </div>
    <p style="color: #888; font-size: 12px; margin: 20px 0 0 0;">
      ※ このリンクは24時間有効です
    </p>
  </div>
  
  <div style="border-top: 1px solid #eee; padding-top: 20px; color: #888; font-size: 12px;">
    <p style="margin: 0 0 10px 0;">
      <strong>セキュリティについて</strong><br>
      ・このリクエストに心当たりがない場合は、無視して削除してください<br>
      ・パスワードは他人に教えないでください
    </p>
    <p style="margin: 20px 0 0 0; text-align: center;">
      このメールはMMQマーダーミステリー予約システムから自動送信されています。
    </p>
  </div>
</div>
  `.trim(),

  // 招待メール
  MAILER_SUBJECTS_INVITE: '【MMQ】スタッフ招待',
  MAILER_TEMPLATES_INVITE: `
<div style="font-family: 'Hiragino Kaku Gothic ProN', 'ヒラギノ角ゴ ProN W3', Meiryo, メイリオ, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #1a1a2e; font-size: 24px; margin: 0;">MMQ</h1>
    <p style="color: #666; font-size: 14px; margin-top: 5px;">マーダーミステリー予約</p>
  </div>
  
  <div style="background: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
    <h2 style="color: #1a1a2e; font-size: 18px; margin: 0 0 20px 0;">スタッフとして招待されました</h2>
    <p style="color: #333; line-height: 1.8; margin: 0 0 20px 0;">
      MMQのスタッフとして招待されました。<br>
      以下のボタンをクリックして、アカウントを設定してください。
    </p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{ .ConfirmationURL }}" 
         style="display: inline-block; background: #1a1a2e; color: white; padding: 15px 40px; 
                text-decoration: none; border-radius: 4px; font-weight: bold;">
        招待を承諾する
      </a>
    </div>
    <p style="color: #888; font-size: 12px; margin: 20px 0 0 0;">
      ※ このリンクは24時間有効です
    </p>
  </div>
  
  <div style="border-top: 1px solid #eee; padding-top: 20px; color: #888; font-size: 12px;">
    <p style="margin: 20px 0 0 0; text-align: center;">
      このメールはMMQマーダーミステリー予約システムから自動送信されています。
    </p>
  </div>
</div>
  `.trim(),
}

async function updateEmailTemplates() {
  console.log('📧 Supabase メールテンプレートを更新します...')

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

    console.log('📋 現在の設定を取得しました')

    // 設定を更新
    const updateResponse = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailTemplates)
      }
    )

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text()
      throw new Error(`設定更新エラー: ${updateResponse.status} ${errorText}`)
    }

    console.log('✅ メールテンプレートを更新しました:')
    console.log('  - 新規登録確認メール: 【MMQ】メールアドレスの確認')
    console.log('  - パスワードリセット: 【MMQ】パスワードリセット')
    console.log('  - スタッフ招待: 【MMQ】スタッフ招待')

  } catch (error) {
    console.error('❌ エラー:', error.message)
    process.exit(1)
  }
}

updateEmailTemplates()
