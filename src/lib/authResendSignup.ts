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

  const msg =
    otpErr.message ||
    resendErr.message ||
    'メールの送信に失敗しました。しばらくしてからお試しください。'
  return { ok: false, message: msg }
}
