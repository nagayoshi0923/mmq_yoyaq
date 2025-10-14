#!/usr/bin/env python3
"""
GMリストデータからstaff_scenario_assignmentsのINSERT SQLを生成
"""

# スタッフ名のマッピング（表記ゆれを統一）
STAFF_NAME_MAPPING = {
    'えなみ': '江波（えなみん）',
    'えなみん': '江波（えなみん）',
    'きゅう': 'きゅう',
    'キュウ': 'きゅう',
    'れみあ': 'Remia（れみあ）',
    'れいにー': 'れいにー',
    'みずき': 'みずき',
    'まつい': '松井（まつい）',
    'りえぞー': 'りえぞー',
    'えりん': 'えりん',
    'ぽん': 'ぽんちゃん',
    'しらやま': 'しらやま',
    '崎': '崎',
    'ぴよな': 'ぴよな',
    'あんころ': 'あんころ',
    'りんな': 'りんな',
    'labo': 'labo',
    'らぼ': 'labo',
    'じの': '八継じの',
    'つばめ': 'つばめ',
    'そら': 'ソラ',
    'ソラ': 'ソラ',
    'ソウタン': 'ソラ',  # 別名？
    'ほがらか': 'ほがらか',
    'みくみん': 'みくみん',
    '古賀': '古賀',
    'こが': '古賀',
    'モリシ': 'イワセモリシ',
    'もりし': 'イワセモリシ',
    'ソルト': '藤崎ソルト',
    'ぽったー': None,  # 不明なスタッフ
    'ミカノハ': None,
    'みかのは': None,
    'だいこん': None,
    'kanade': None,
    '渚咲': None,
    '温風リン': None,
    '奏兎': None,
    'BB': None,
    '楽': None,
}

# GMリストデータ（シナリオ名: [メインGMリスト, 全GMリスト]）
GM_DATA = {
    'グロリアメモリーズ': {
        'main_gms': ['きゅう', 'れみあ'],
        'all_gms': ['きゅう', 'えなみ', 'れみあ', 'れいにー', 'ぽん', 'ソウタン', 'しらやま', 'りんな', 'つばめ', 'えりん', 'labo', 'じの', 'さき', 'ぽったー', 'ソルト'],
        'main_sub_both': [],  # メイン・サブ両方
        'main_only': [],  # メインのみ
        'sub_only': [],  # サブのみ
        'requires_sub_gm': False
    },
    'モノクローム': {
        'main_gms': [],
        'all_gms': ['りえぞー', 'きゅう', 'ぽん', 'えりん', 'みずき', 'れいにー', 'れみあ', 'ほがらか', 'まつい', 'えなみ', '崎', 'ソウタン', 'labo', 'しらやま', 'りんな', 'あんころ', 'ぴよな', 'ソラ', 'じの', 'だいこん', 'ソルト', 'つばめ', 'モリシ', '温風リン'],
        'main_sub_both': ['りえぞー', 'しらやま'],
        'main_only': ['えりん', '崎', 'じの'],
        'sub_only': ['みずき', 'きゅう', 'labo', 'モリシ'],
        'requires_sub_gm': True
    },
    # 他のシナリオも追加...
}

def normalize_staff_name(name):
    """スタッフ名を正規化"""
    name = name.strip()
    # カッコ内の説明を削除
    if '(' in name or '（' in name:
        import re
        name = re.sub(r'[（(][^）)]*[）)]', '', name).strip()
    
    return STAFF_NAME_MAPPING.get(name, name)

def parse_staff_list(staff_str):
    """カンマ区切りのスタッフリストを解析"""
    if not staff_str:
        return []
    
    staff_list = []
    for name in staff_str.split(','):
        name = name.strip()
        if name and name != '':
            normalized = normalize_staff_name(name)
            if normalized and normalized not in staff_list:
                staff_list.append(normalized)
    
    return staff_list

def generate_insert_sql(scenario_title, gm_data):
    """
    1つのシナリオのINSERT SQLを生成
    """
    sql_lines = []
    sql_lines.append(f"-- {scenario_title}")
    
    # シナリオ設定
    requires_sub_gm = gm_data.get('requires_sub_gm', False)
    gm_count = 2 if requires_sub_gm else 1
    
    sql_lines.append(f"UPDATE scenarios SET requires_sub_gm = {str(requires_sub_gm).lower()}, gm_count_required = {gm_count} WHERE title = '{scenario_title}';")
    
    # メイン・サブ両方可能
    for staff in gm_data.get('main_sub_both', []):
        if staff:
            sql_lines.append(
                f"INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, can_gm_at) "
                f"VALUES ((SELECT id FROM staff WHERE name = '{staff}'), (SELECT id FROM scenarios WHERE title = '{scenario_title}'), true, true, NOW()) "
                f"ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_sub_gm = true, can_gm_at = NOW();"
            )
    
    # メインのみ可能
    for staff in gm_data.get('main_only', []):
        if staff:
            sql_lines.append(
                f"INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, can_gm_at) "
                f"VALUES ((SELECT id FROM staff WHERE name = '{staff}'), (SELECT id FROM scenarios WHERE title = '{scenario_title}'), true, false, NOW()) "
                f"ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_sub_gm = false, can_gm_at = NOW();"
            )
    
    # サブのみ可能
    for staff in gm_data.get('sub_only', []):
        if staff:
            sql_lines.append(
                f"INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_sub_gm, can_gm_at) "
                f"VALUES ((SELECT id FROM staff WHERE name = '{staff}'), (SELECT id FROM scenarios WHERE title = '{scenario_title}'), false, true, NOW()) "
                f"ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = false, can_sub_gm = true, can_gm_at = NOW();"
            )
    
    # 左側がない場合、右側の全員をメインGM可能として登録
    if not gm_data.get('main_sub_both') and not gm_data.get('main_only') and not gm_data.get('sub_only'):
        main_gms = parse_staff_list(gm_data.get('main_gms', ''))
        for staff in main_gms:
            if staff and staff != '不明':
                sql_lines.append(
                    f"INSERT INTO staff_scenario_assignments (staff_id, scenario_id, can_main_gm, can_gm_at) "
                    f"VALUES ((SELECT id FROM staff WHERE name = '{staff}'), (SELECT id FROM scenarios WHERE title = '{scenario_title}'), true, NOW()) "
                    f"ON CONFLICT (staff_id, scenario_id) DO UPDATE SET can_main_gm = true, can_gm_at = NOW();"
                )
    
    sql_lines.append('')
    return '\n'.join(sql_lines)

def main():
    print("GMリストデータからSQLを生成します...")
    print("サンプルデータで動作確認後、完全版を作成します。")
    
    # サンプル出力
    for scenario_title, gm_data in list(GM_DATA.items())[:2]:
        print(generate_insert_sql(scenario_title, gm_data))

if __name__ == '__main__':
    main()

