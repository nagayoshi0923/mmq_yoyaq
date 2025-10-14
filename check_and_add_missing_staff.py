#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GMデータから使用されている全スタッフを抽出し、
データベースに存在しないスタッフを追加するSQLを生成
"""

def get_staff_from_last_parse():
    """parse_gm_data_v2.pyの最後の実行結果から使用されたスタッフ名を取得"""
    # 前回のパース結果から使用されたスタッフ名
    staff_names = [
        'BB',
        'Remia（れみあ）',
        'kanade',
        'labo',
        'あんころ',
        'えりん',
        'きゅう',
        'しらやま',
        'だいこん',
        'つばめ',
        'ぴよな',
        'ほがらか',
        'ぽったー',
        'ぽん',
        'みくみん',
        'みずき',
        'らの',
        'りえぞー',
        'りんな',
        'れいにー',
        'イワセモリシ',
        'ソウタン',
        'ソラ',
        'ミカノハ',
        '八継じの',
        '古賀',
        '奏兎',
        '崎',
        '松井（まつい）',
        '江波（えなみん）',
        '渚咲',
        '温風リン',
        '藤崎ソルト'
    ]
    
    # 警告が出たものも追加（データベースにないかもしれない）
    # えりん(12/20予定）ソラ は除外（特殊ケース）
    
    return sorted(staff_names)

def generate_check_sql(staff_names):
    """スタッフ名の存在チェックSQL"""
    names_array = ',\n  '.join([f"'{name.replace(chr(39), chr(39)+chr(39))}'" for name in staff_names])
    
    sql = f"""-- 使用されているスタッフ名の存在チェック
--
-- GMデータで使用されているスタッフ名がデータベースに存在するかチェック

-- ===========================
-- 1. 存在しないスタッフ
-- ===========================

WITH required_staff AS (
  SELECT UNNEST(ARRAY[
    {names_array}
  ]) AS name
),
existing_staff AS (
  SELECT name FROM staff
)
SELECT 
  '存在しないスタッフ' as category,
  rs.name as スタッフ名,
  '新規追加が必要' as 状態
FROM required_staff rs
LEFT JOIN existing_staff es ON rs.name = es.name
WHERE es.name IS NULL
ORDER BY rs.name;

-- ===========================
-- 2. 存在するスタッフ
-- ===========================

WITH required_staff AS (
  SELECT UNNEST(ARRAY[
    {names_array}
  ]) AS name
),
existing_staff AS (
  SELECT name FROM staff
)
SELECT 
  '存在するスタッフ' as category,
  COUNT(*) as 件数
FROM required_staff rs
INNER JOIN existing_staff es ON rs.name = es.name;
"""
    return sql

def generate_add_staff_sql(staff_names):
    """スタッフ追加SQL"""
    statements = []
    
    for name in staff_names:
        escaped_name = name.replace("'", "''")
        stmt = f"""
INSERT INTO staff (name, status, role, stores, created_at, updated_at)
SELECT 
  '{escaped_name}' as name,
  'active' as status,
  ARRAY[]::TEXT[] as role,
  ARRAY[]::TEXT[] as stores,
  NOW() as created_at,
  NOW() as updated_at
WHERE NOT EXISTS (
  SELECT 1 FROM staff WHERE name = '{escaped_name}'
);
"""
        statements.append(stmt)
    
    return '\n'.join(statements)

def main():
    print("📊 使用されているスタッフ名を取得中...")
    staff_names = get_staff_from_last_parse()
    
    print(f"✅ {len(staff_names)}人のスタッフを検出しました\n")
    
    print("📋 スタッフ名一覧:")
    for i, name in enumerate(staff_names, 1):
        print(f"  {i:2d}. {name}")
    
    # 存在チェックSQL
    check_sql = generate_check_sql(staff_names)
    with open('database/check_missing_staff.sql', 'w', encoding='utf-8') as f:
        f.write(check_sql)
    print("\n✅ database/check_missing_staff.sql を作成しました")
    print("   → このSQLを実行して、存在しないスタッフを確認してください")
    
    # スタッフ追加SQL
    add_sql = generate_add_staff_sql(staff_names)
    header = f"""-- 不足しているスタッフを追加
--
-- GMデータで使用されているが、データベースに存在しないスタッフを追加
-- 既に存在するスタッフはスキップされます（WHERE NOT EXISTS）

{add_sql}

SELECT '✅ 不足していたスタッフを追加しました' as status;

-- 追加結果の確認
SELECT 
  COUNT(*) as 追加されたスタッフ数
FROM staff
WHERE created_at >= NOW() - INTERVAL '1 minute';
"""
    
    with open('database/add_missing_staff.sql', 'w', encoding='utf-8') as f:
        f.write(header)
    print("✅ database/add_missing_staff.sql を作成しました")
    print("   → このSQLを実行して、不足しているスタッフを一括追加できます")
    
    print("\n🎯 実行手順:")
    print("   1. database/check_missing_staff.sql を実行")
    print("      → 存在しないスタッフを確認")
    print("   2. database/add_missing_staff.sql を実行")
    print("      → 不足しているスタッフを追加")
    print("   3. database/import_correct_gm_assignments_part*.sql を実行")
    print("      → GMアサインメントをインポート")

if __name__ == '__main__':
    main()

