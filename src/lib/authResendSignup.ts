import { supabase } from '@/lib/supabase'

/**
 * 新規登録用の確認メール / マジックリンクを再送する。
 * check_email_registered でブロックされがちな「登録途中」ユーザー向け。
 */
export async function resendSignupConfirmationEmail(
  email: string,
  emailRedirectTo: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = email.trim()
  if (!trimmed) {
    return { ok: false, message: 'メールアドレスを入力してください' }
  }

  const { error: resendErr } = await supabase.auth.resend({
    type: 'signup',
    email: trimmed,
    options: { emailRedirectTo },
  })

  if (!resendErr) {
    return { ok: true }
  }

  // プロジェクト設定やテンプレート次第で resend が使えない場合のフォールバック
  const { error: otpErr } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      shouldCreateUser: false,
      emailRedirectTo,
    },
  })

  if (!otpErr) {
    return { ok: true }
  }

  const errorMessage = otpErr.message || resendErr.message || ''
  
  // レート制限エラーを日本語化
  if (errorMessage.includes('security purposes') || errorMessage.includes('after') && errorMessage.includes('seconds')) {
    const match = errorMessage.match(/after (\d+) seconds/)
    const seconds = match ? match[1] : '30'
    return { ok: false, message: `セキュリティのため、${seconds}秒後に再度お試しください。` }
  }
  
  return { ok: false, message: errorMessage || 'メールの送信に失敗しました。しばらくしてからお試しください。' }
}
