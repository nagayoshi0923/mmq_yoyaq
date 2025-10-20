/**
 * Amazon SES (Supabase Edge Functions) を使ったメール送信API
 */

import { supabase } from './supabase'

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  body: string;
}

export interface SendEmailResponse {
  success: boolean;
  message?: string;
  error?: string;
  messageId?: string;
}

/**
 * メールを送信
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResponse> {
  try {
    const { data, error } = await supabase.functions.invoke('send-email', {
      body: params,
    })

    if (error) {
      console.error('メール送信エラー:', error)
      return {
        success: false,
        error: error.message || 'メール送信に失敗しました',
      }
    }

    return {
      success: data.success || true,
      message: data.message || 'メールを送信しました',
      messageId: data.messageId,
    }
  } catch (error) {
    console.error('メール送信エラー:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'メール送信に失敗しました',
    }
  }
}

