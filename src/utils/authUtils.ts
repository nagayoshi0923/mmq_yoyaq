export type UserRole = 'admin' | 'staff' | 'customer' | 'license_admin'

/**
 * メールアドレスからユーザーのロールを判定する（フォールバック用）
 * 
 * 🔒 セキュリティ修正: ハードコードされた管理者メールリストを削除
 * 
 * 注意: この関数は最終フォールバックとしてのみ使用されます。
 * 通常は以下の順序でロールが決定されます：
 * 1. usersテーブルの既存ロール（信頼できるソース）
 * 2. staffテーブルへのuser_id紐付け
 * 3. staffテーブルへのemail一致
 * 4. この関数（フォールバック: 常に 'customer' を返す）
 * 
 * セキュリティ上の理由:
 * - フロントエンドにadminメールリストを持つのは危険
 * - ロールの判定はサーバー側（usersテーブル）でのみ行う
 * - フォールバックは常に最小権限（customer）を付与
 * 
 * @param email ユーザーのメールアドレス（未使用だが互換性のため保持）
 * @returns 常に 'customer' を返す
 */
export function determineUserRole(_email: string | undefined | null): UserRole {
  // 🔒 セキュリティ修正: フロントエンドでのロール判定を行わない
  // ロールはサーバー側（usersテーブル）でのみ決定される
  // フォールバックは常に最小権限を付与
  return 'customer'
}

