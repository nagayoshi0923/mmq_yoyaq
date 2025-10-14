#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
新規追加されたスタッフだけのGMアサインメントSQLを生成
"""

import re
from typing import Dict, List, Set, Tuple

def load_name_mapping(filepath: str = 'name_mapping.txt') -> Tuple[Dict[str, str], Set[str]]:
    """名前マッピングファイルを読み込む"""
    mapping = {}
    skip_names = set()
    
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            
            if not line or line.startswith('#'):
                continue
            
            if '#' in line:
                line = line.split('#')[0].strip()
            if '＃' in line:
                line = line.split('＃')[0].strip()
            
            parts = line.split(',')
            if len(parts) != 2:
                continue
            
            gm_name = parts[0].strip()
            db_name = parts[1].strip()
            
            if not gm_name or not db_name:
                continue
            
            if db_name == 'SKIP':
                skip_names.add(gm_name)
                continue
            
            mapping[gm_name] = db_name
    
    return mapping, skip_names

def normalize_staff_name(name: str) -> str:
    """スタッフ名を正規化"""
    name = name.strip()
    
    if name.startswith('(') or name.startswith('（'):
        return None
    
    name = re.sub(r'\([^)]*\)', '', name)
    name = re.sub(r'（[^）]*）', '', name)
    
    suffixes = ['準備中', 'やりたい', '仮', 'プレイ予定', '？']
    for suffix in suffixes:
        if name.endswith(suffix):
            name = name[:-len(suffix)]
    
    name = name.strip()
    return name if name else None

def parse_staff_list(staff_str: str, name_mapping: Dict[str, str], skip_names: Set[str], target_staff: Set[str]) -> List[str]:
    """カンマ区切りのスタッフリストをパースして、特定のスタッフのみ抽出"""
    if not staff_str or staff_str.strip() == '':
        return []
    
    names = re.split(r'[,、]', staff_str)
    result = []
    
    for name in names:
        if '・' in name:
            sub_names = name.split('・')
            for sub_name in sub_names:
                normalized = normalize_staff_name(sub_name)
                if normalized:
                    _add_if_target_staff(normalized, name_mapping, skip_names, target_staff, result)
        else:
            normalized = normalize_staff_name(name)
            if normalized:
                _add_if_target_staff(normalized, name_mapping, skip_names, target_staff, result)
    
    return result

def _add_if_target_staff(normalized: str, name_mapping: Dict[str, str], skip_names: Set[str], target_staff: Set[str], result: List[str]):
    """正規化されたスタッフ名が対象スタッフの場合のみ追加"""
    if normalized in ['準備中', '未定', '予定', 'GM増やしたい', 'やりたい', '仮']:
        return
    
    if normalized in skip_names:
        return
    
    if normalized in name_mapping:
        mapped_name = name_mapping[normalized]
        if mapped_name in target_staff and mapped_name not in result:
            result.append(mapped_name)
    elif normalized in target_staff and normalized not in result:
        result.append(normalized)

def extract_target_staff_assignments(filepath: str, name_mapping: Dict[str, str], skip_names: Set[str], target_staff: Set[str]) -> Dict[str, Tuple[List[str], List[str]]]:
    """特定のスタッフのアサインメントのみを抽出"""
    scenarios = {}
    
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    for line in lines[1:]:
        line = line.strip()
        if not line:
            continue
        
        parts = line.split('\t')
        if len(parts) < 2:
            continue
        
        scenario_title = parts[0].strip()
        if not scenario_title:
            continue
        
        main_gms = parse_staff_list(parts[1] if len(parts) > 1 else '', name_mapping, skip_names, target_staff)
        experienced = parse_staff_list(parts[2] if len(parts) > 2 else '', name_mapping, skip_names, target_staff)
        
        if main_gms or experienced:
            scenarios[scenario_title] = (main_gms, experienced)
    
    return scenarios

def generate_insert_statements(scenarios: Dict[str, Tuple[List[str], List[str]]]) -> str:
    """INSERT文を生成"""
    statements = []
    
    for scenario_title, (main_gms, experienced) in scenarios.items():
        escaped_title = scenario_title.replace("'", "''")
        
        for gm in main_gms:
            escaped_gm = gm.replace("'", "''")
            stmt = f"""
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, can_gm_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  true AS can_main_gm,
  false AS can_sub_gm,
  false AS is_experienced,
  NOW() AS can_gm_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '{escaped_gm}'
  AND sc.title = '{escaped_title}'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  can_gm_at = EXCLUDED.can_gm_at,
  experienced_at = NULL;
"""
            statements.append(stmt)
        
        for person in experienced:
            if person in main_gms:
                continue
            
            escaped_person = person.replace("'", "''")
            stmt = f"""
INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, is_experienced, experienced_at)
SELECT 
  s.id AS staff_id,
  sc.id AS scenario_id,
  false AS can_main_gm,
  false AS can_sub_gm,
  true AS is_experienced,
  NOW() AS experienced_at
FROM staff s
CROSS JOIN scenarios sc
WHERE s.name = '{escaped_person}'
  AND sc.title = '{escaped_title}'
ON CONFLICT (staff_id, scenario_id)
DO UPDATE SET
  can_main_gm = EXCLUDED.can_main_gm,
  can_sub_gm = EXCLUDED.can_sub_gm,
  is_experienced = EXCLUDED.is_experienced,
  experienced_at = EXCLUDED.experienced_at,
  can_gm_at = NULL;
"""
            statements.append(stmt)
    
    return '\n'.join(statements)

def main():
    # 新規追加されたスタッフのリスト（add_missing_staff.sqlで追加されたスタッフ）
    # ユーザーがcheck_missing_staff.sqlで確認した結果をここに入力
    print("🔍 新規追加されたスタッフを指定してください")
    print("   （カンマ区切りで入力、例: BB,kanade,らの）")
    print("   または、全スタッフなら 'all' と入力:")
    
    # 全33人のスタッフ
    all_staff = [
        'BB', 'Remia（れみあ）', 'kanade', 'labo', 'あんころ',
        'えりん', 'きゅう', 'しらやま', 'だいこん', 'つばめ',
        'ぴよな', 'ほがらか', 'ぽったー', 'ぽん', 'みくみん',
        'みずき', 'らの', 'りえぞー', 'りんな', 'れいにー',
        'イワセモリシ', 'ソウタン', 'ソラ', 'ミカノハ', '八継じの',
        '古賀', '奏兎', '崎', '松井（まつい）', '江波（えなみん）',
        '渚咲', '温風リン', '藤崎ソルト'
    ]
    
    # デフォルト: 最近追加されそうなスタッフ
    default_new_staff = ['BB', 'kanade', 'らの', 'ソウタン', 'ミカノハ', '奏兎', '渚咲', '温風リン']
    
    print(f"\n💡 デフォルト（推測）: {', '.join(default_new_staff)}")
    user_input = input("\n新規スタッフ名（デフォルトならEnter）: ").strip()
    
    if user_input.lower() == 'all':
        target_staff = set(all_staff)
        print(f"\n✅ 全{len(target_staff)}人のスタッフを対象にします")
    elif user_input == '':
        target_staff = set(default_new_staff)
        print(f"\n✅ デフォルト{len(target_staff)}人のスタッフを対象にします")
    else:
        target_staff = set([s.strip() for s in user_input.split(',')])
        print(f"\n✅ {len(target_staff)}人のスタッフを対象にします: {', '.join(target_staff)}")
    
    print("\n📖 マッピングファイルを読み込み中...")
    name_mapping, skip_names = load_name_mapping('name_mapping.txt')
    
    print("📊 GMデータをパース中...")
    scenarios = extract_target_staff_assignments('gm_data.txt', name_mapping, skip_names, target_staff)
    
    print(f"✅ {len(scenarios)}件のシナリオにアサインメントがあります")
    
    # 統計
    total_main_gms = sum(len(gms) for gms, _ in scenarios.values())
    total_experienced = sum(len(exp) for _, exp in scenarios.values())
    print(f"  - 担当GM: {total_main_gms}件")
    print(f"  - 体験済み: {total_experienced}件")
    
    print("\n💾 SQL文を生成中...")
    sql = generate_insert_statements(scenarios)
    
    staff_list = ', '.join(sorted(target_staff))
    header = f"""-- 新規追加スタッフのGMアサインメントをインポート
-- 
-- 対象スタッフ: {staff_list}

{sql}

SELECT '✅ 新規スタッフのアサインメントをインポートしました' as status;
SELECT '  - 対象スタッフ: {len(target_staff)}人' as detail;
SELECT '  - シナリオ: {len(scenarios)}件' as detail;
"""
    
    with open('database/import_new_staff_assignments.sql', 'w', encoding='utf-8') as f:
        f.write(header)
    
    print("✅ database/import_new_staff_assignments.sql を作成しました")
    print("\n🎉 このファイルを実行すれば、新規スタッフのアサインメントが登録されます！")

if __name__ == '__main__':
    main()

