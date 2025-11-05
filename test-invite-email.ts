// スタッフ招待メール送信のテストスクリプト
// 使用方法: deno run --allow-net test-invite-email.ts

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const TEST_EMAIL = Deno.env.get('TEST_EMAIL') || 'test@example.com'
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'MMQ <onboarding@resend.dev>'

console.log('📧 メール送信テスト開始')
console.log('API Key:', RESEND_API_KEY ? `${RESEND_API_KEY.substring(0, 10)}...` : '❌ 未設定')
console.log('送信元:', FROM_EMAIL)
console.log('送信先:', TEST_EMAIL)

if (!RESEND_API_KEY) {
  console.error('❌ RESEND_API_KEYが設定されていません')
  Deno.exit(1)
}

try {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [TEST_EMAIL],
      subject: '【MMQ】テストメール',
      html: `
        <h2>テストメール</h2>
        <p>これはスタッフ招待メールのテストです。</p>
        <p>このメールが届いたら、メール送信機能は正常に動作しています。</p>
      `,
    }),
  })

  console.log('📊 レスポンス:', {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ エラーレスポンス:', errorText)
    
    try {
      const errorData = JSON.parse(errorText)
      console.error('❌ エラー詳細:', JSON.stringify(errorData, null, 2))
    } catch {
      console.error('❌ エラーテキスト:', errorText)
    }
  } else {
    const data = await response.json()
    console.log('✅ メール送信成功:', data)
    console.log('📧 メールID:', data.id)
  }
} catch (error) {
  console.error('❌ エラー:', error)
}

