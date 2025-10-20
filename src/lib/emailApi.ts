/**
 * Google Apps Script を使ったメール送信API
 */

const GOOGLE_APPS_SCRIPT_URL = import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL;

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  body: string;
}

export interface SendEmailResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * メールを送信
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResponse> {
  if (!GOOGLE_APPS_SCRIPT_URL) {
    throw new Error('VITE_GOOGLE_APPS_SCRIPT_URL が設定されていません');
  }

  try {
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors', // Google Apps Script は CORS ヘッダーを返さないため
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    // no-cors モードでは response.json() が使えないため、
    // 成功したと仮定する
    return {
      success: true,
      message: 'メールを送信しました',
    };
  } catch (error) {
    console.error('メール送信エラー:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'メール送信に失敗しました',
    };
  }
}

