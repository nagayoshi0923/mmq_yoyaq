// API エラーハンドリングの統一

/**
 * API エラーの種類
 */
export enum ApiErrorType {
  NETWORK = 'NETWORK',           // ネットワークエラー
  UNAUTHORIZED = 'UNAUTHORIZED', // 認証エラー
  FORBIDDEN = 'FORBIDDEN',       // 権限エラー
  NOT_FOUND = 'NOT_FOUND',       // リソースが見つからない
  VALIDATION = 'VALIDATION',     // バリデーションエラー
  CONFLICT = 'CONFLICT',         // 競合エラー
  SERVER = 'SERVER',             // サーバーエラー
  UNKNOWN = 'UNKNOWN'            // 不明なエラー
}

/**
 * API エラークラス
 * エラーの種類、メッセージ、元のエラーを保持
 */
export class ApiError extends Error {
  type: ApiErrorType
  originalError?: unknown
  statusCode?: number

  constructor(
    message: string,
    type: ApiErrorType = ApiErrorType.UNKNOWN,
    originalError?: unknown,
    statusCode?: number
  ) {
    super(message)
    this.name = 'ApiError'
    this.type = type
    this.originalError = originalError
    this.statusCode = statusCode

    // スタックトレースを保持
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError)
    }
  }
}

/**
 * Supabase エラーを ApiError に変換
 */
export function handleSupabaseError(error: any, context?: string): ApiError {
  // エラーがない場合
  if (!error) {
    return new ApiError(
      '不明なエラーが発生しました',
      ApiErrorType.UNKNOWN
    )
  }

  // すでに ApiError の場合はそのまま返す
  if (error instanceof ApiError) {
    return error
  }

  // Supabase エラーコードに基づいて分類
  const code = error.code || error.status
  const message = error.message || 'エラーが発生しました'
  const contextMessage = context ? `${context}: ${message}` : message

  // 認証エラー
  if (code === '401' || code === 'PGRST301' || message.includes('JWT')) {
    return new ApiError(
      contextMessage,
      ApiErrorType.UNAUTHORIZED,
      error,
      401
    )
  }

  // 権限エラー
  if (code === '403' || code === 'PGRST302') {
    return new ApiError(
      contextMessage,
      ApiErrorType.FORBIDDEN,
      error,
      403
    )
  }

  // リソースが見つからない
  if (code === '404' || code === 'PGRST116') {
    return new ApiError(
      contextMessage,
      ApiErrorType.NOT_FOUND,
      error,
      404
    )
  }

  // バリデーションエラー
  if (code === '400' || code === 'PGRST102' || code === '22P02') {
    return new ApiError(
      contextMessage,
      ApiErrorType.VALIDATION,
      error,
      400
    )
  }

  // 競合エラー
  if (code === '409' || code === '23505') {
    return new ApiError(
      contextMessage,
      ApiErrorType.CONFLICT,
      error,
      409
    )
  }

  // ネットワークエラー
  if (
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('timeout')
  ) {
    return new ApiError(
      contextMessage,
      ApiErrorType.NETWORK,
      error
    )
  }

  // サーバーエラー
  if (code >= 500) {
    return new ApiError(
      contextMessage,
      ApiErrorType.SERVER,
      error,
      code
    )
  }

  // その他のエラー
  return new ApiError(
    contextMessage,
    ApiErrorType.UNKNOWN,
    error
  )
}

/**
 * ユーザー向けのエラーメッセージを生成
 */
export function getUserFriendlyMessage(error: ApiError): string {
  switch (error.type) {
    case ApiErrorType.NETWORK:
      return 'ネットワーク接続を確認してください'
    
    case ApiErrorType.UNAUTHORIZED:
      return 'ログインが必要です。再度ログインしてください'
    
    case ApiErrorType.FORBIDDEN:
      return 'この操作を実行する権限がありません'
    
    case ApiErrorType.NOT_FOUND:
      return '指定されたデータが見つかりませんでした'
    
    case ApiErrorType.VALIDATION:
      return '入力内容に誤りがあります。確認してください'
    
    case ApiErrorType.CONFLICT:
      return 'データが競合しています。ページを再読み込みしてください'
    
    case ApiErrorType.SERVER:
      return 'サーバーエラーが発生しました。しばらくしてから再試行してください'
    
    case ApiErrorType.UNKNOWN:
    default:
      return error.message || '予期しないエラーが発生しました'
  }
}

/**
 * エラーをログに出力（開発環境のみ詳細表示）
 */
export function logApiError(error: ApiError, additionalInfo?: Record<string, any>): void {
  if (import.meta.env.DEV) {
    console.group(`🔴 API Error: ${error.type}`)
    console.error('Message:', error.message)
    console.error('Type:', error.type)
    if (error.statusCode) {
      console.error('Status Code:', error.statusCode)
    }
    if (error.originalError) {
      console.error('Original Error:', error.originalError)
    }
    if (additionalInfo) {
      console.error('Additional Info:', additionalInfo)
    }
    console.error('Stack:', error.stack)
    console.groupEnd()
  } else {
    // 本番環境では簡潔なログ
    console.error(`API Error [${error.type}]:`, error.message)
  }
}

