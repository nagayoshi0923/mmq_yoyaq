#!/usr/bin/env python3
"""
認証認可データ整合性チェックスクリプト

usersテーブルとstaffテーブルの整合性をチェックし、不整合を検出します。

使用方法:
    python check_auth_integrity.py

環境変数:
    SUPABASE_URL: SupabaseプロジェクトURL
    SUPABASE_SERVICE_ROLE_KEY: Supabase Service Role Key
"""

import os
import sys
from supabase import create_client, Client
from typing import List, Dict, Any
from datetime import datetime

def get_supabase_client() -> Client:
    """Supabaseクライアントを取得"""
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not url or not key:
        print("❌ エラー: SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください")
        sys.exit(1)
    
    return create_client(url, key)

def check_ghost_staff(supabase: Client) -> List[Dict[str, Any]]:
    """staffロールだがstaffテーブルに紐付けがない（幽霊スタッフ）"""
    result = supabase.table('users').select('id, email, role').eq('role', 'staff').execute()
    
    issues = []
    for user in result.data:
        staff_result = supabase.table('staff').select('id').eq('user_id', user['id']).execute()
        if not staff_result.data:
            issues.append({
                'type': '🔴 幽霊スタッフ',
                'user_id': user['id'],
                'email': user['email'],
                'description': 'users.role = staff だが staffテーブルに紐付けがない'
            })
    
    return issues

def check_orphaned_staff(supabase: Client) -> List[Dict[str, Any]]:
    """staffテーブルにuser_idがあるがusersテーブルに存在しない"""
    result = supabase.table('staff').select('id, name, email, user_id').not_.is_('user_id', 'null').execute()
    
    issues = []
    for staff in result.data:
        user_result = supabase.table('users').select('id').eq('id', staff['user_id']).execute()
        if not user_result.data:
            issues.append({
                'type': '🔴 孤立したstaffレコード',
                'staff_id': staff['id'],
                'name': staff.get('name', ''),
                'email': staff.get('email', ''),
                'user_id': staff['user_id'],
                'description': 'staff.user_id が usersテーブルに存在しない'
            })
    
    return issues

def check_linkable_staff(supabase: Client) -> List[Dict[str, Any]]:
    """staffテーブルにemailがあるがusersテーブルに存在するがuser_idが未設定（紐付け可能）"""
    result = supabase.table('staff').select('id, name, email, user_id').not_.is_('email', 'null').is_('user_id', 'null').execute()
    
    issues = []
    for staff in result.data:
        if not staff.get('email'):
            continue
        
        user_result = supabase.table('users').select('id, email, role').eq('email', staff['email']).execute()
        if user_result.data:
            user = user_result.data[0]
            issues.append({
                'type': '🟡 紐付け可能なstaffレコード',
                'staff_id': staff['id'],
                'name': staff.get('name', ''),
                'email': staff['email'],
                'matching_user_id': user['id'],
                'matching_user_role': user.get('role', ''),
                'description': 'staff.email が usersテーブルに存在するが user_id が未設定'
            })
    
    return issues

def check_email_mismatch(supabase: Client) -> List[Dict[str, Any]]:
    """usersテーブルとstaffテーブルでemailが一致しない"""
    result = supabase.table('users').select('id, email, role').eq('role', 'staff').execute()
    
    issues = []
    for user in result.data:
        staff_result = supabase.table('staff').select('id, name, email').eq('user_id', user['id']).execute()
        if staff_result.data:
            staff = staff_result.data[0]
            if staff.get('email') and staff['email'].lower() != user['email'].lower():
                issues.append({
                    'type': '🟡 email不一致',
                    'user_id': user['id'],
                    'user_email': user['email'],
                    'staff_id': staff['id'],
                    'staff_email': staff.get('email', ''),
                    'staff_name': staff.get('name', ''),
                    'description': 'users.email と staff.email が一致しない'
                })
    
    return issues

def print_issues(issues: List[Dict[str, Any]], title: str):
    """問題を表示"""
    if not issues:
        print(f"✅ {title}: 問題なし")
        return
    
    print(f"\n{title} ({len(issues)}件):")
    print("=" * 80)
    for issue in issues:
        print(f"\n{issue['type']}")
        for key, value in issue.items():
            if key not in ['type', 'description']:
                print(f"  {key}: {value}")
        print(f"  説明: {issue.get('description', '')}")

def main():
    print("=" * 80)
    print("認証認可データ整合性チェック")
    print("=" * 80)
    print(f"実行日時: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    supabase = get_supabase_client()
    
    # 各チェックを実行
    ghost_staff = check_ghost_staff(supabase)
    orphaned_staff = check_orphaned_staff(supabase)
    linkable_staff = check_linkable_staff(supabase)
    email_mismatch = check_email_mismatch(supabase)
    
    # 結果を表示
    print_issues(ghost_staff, "幽霊スタッフ")
    print_issues(orphaned_staff, "孤立したstaffレコード")
    print_issues(linkable_staff, "紐付け可能なstaffレコード")
    print_issues(email_mismatch, "email不一致")
    
    # サマリー
    total_issues = len(ghost_staff) + len(orphaned_staff) + len(linkable_staff) + len(email_mismatch)
    
    print("\n" + "=" * 80)
    print("📊 整合性サマリー")
    print("=" * 80)
    print(f"🔴 重大な問題: {len(ghost_staff) + len(orphaned_staff)}件")
    print(f"  - 幽霊スタッフ: {len(ghost_staff)}件")
    print(f"  - 孤立したstaffレコード: {len(orphaned_staff)}件")
    print(f"🟡 改善可能な問題: {len(linkable_staff) + len(email_mismatch)}件")
    print(f"  - 紐付け可能なstaffレコード: {len(linkable_staff)}件")
    print(f"  - email不一致: {len(email_mismatch)}件")
    print(f"\n合計: {total_issues}件")
    
    if total_issues == 0:
        print("\n✅ すべての整合性チェックが正常です！")
        return 0
    else:
        print(f"\n⚠️  {total_issues}件の問題が検出されました。上記の詳細を確認してください。")
        return 1

if __name__ == '__main__':
    sys.exit(main())

