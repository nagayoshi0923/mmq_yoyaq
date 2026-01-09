#!/usr/bin/env python3
"""
カタログデータからscenarios更新用SQLを生成
"""

import json

def generate_sql():
    # カタログデータを読み込み
    with open('docs/data/queens-waltz-catalog.json', 'r', encoding='utf-8') as f:
        catalog = json.load(f)
    
    print(f"カタログシナリオ数: {len(catalog)}")
    
    # 内部データも読み込み（追加情報用）
    try:
        with open('docs/data/queens-waltz-scenarios-internal.json', 'r', encoding='utf-8') as f:
            internal = json.load(f)
        print(f"内部データシナリオ数: {len(internal)}")
    except:
        internal = []
    
    # SQL生成
    sql_lines = [
        "-- クインズワルツ シナリオ genre カラム更新",
        "-- 生成日: 2026-01-08",
        "-- データソース: https://queenswaltz.jp/catalog",
        "",
        "-- ============================================================",
        "-- 使用方法:",
        "-- 1. Supabase SQL Editor で実行",
        "-- 2. organization_id は事前に確認してください",
        "-- ============================================================",
        "",
        "-- クインズワルツの organization_id を確認",
        "-- SELECT id, name FROM organizations WHERE name ILIKE '%クインズ%';",
        "",
        "BEGIN;",
        "",
    ]
    
    update_count = 0
    for s in catalog:
        title = s.get('title', '').replace("'", "''")  # SQLエスケープ
        categories = s.get('categories', [])
        price = s.get('price')
        players = s.get('players')
        duration = s.get('duration')
        
        if not title:
            continue
        
        if categories:
            # PostgreSQL配列形式に変換
            genre_array = "ARRAY[" + ", ".join([f"'{c}'" for c in categories]) + "]"
        else:
            genre_array = "'{}'::text[]"
        
        # SET句を構築（genreは必須、他はオプション）
        set_clauses = [f"genre = {genre_array}"]
        
        # 料金がある場合は追加
        if price:
            set_clauses.append(f"participation_fee = {price}")
        
        # 人数がある場合は追加
        if players:
            set_clauses.append(f"player_count_max = {players}")
            set_clauses.append(f"player_count_min = {players}")
        
        # 時間がある場合は追加（分単位に変換）
        if duration:
            set_clauses.append(f"duration = {duration * 60}")
        
        set_clause = ", ".join(set_clauses)
        
        sql_lines.append(f"-- {title}")
        sql_lines.append(f"UPDATE scenarios SET {set_clause}")
        sql_lines.append(f"WHERE title = '{title}'")
        sql_lines.append(f"  OR title ILIKE '%{title}%';")
        sql_lines.append("")
        update_count += 1
    
    sql_lines.append("COMMIT;")
    sql_lines.append("")
    sql_lines.append(f"-- 合計 {update_count} シナリオの更新対象")
    
    # SQLファイルに保存
    output_path = 'database/update_scenario_genres.sql'
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(sql_lines))
    
    print(f"SQL生成完了: {output_path}")
    print(f"更新対象シナリオ数: {update_count}")
    
    # プレビュー表示
    print("\n=== SQLプレビュー (最初の5件) ===")
    preview_lines = [l for l in sql_lines if l.startswith('UPDATE') or l.startswith('--')][:20]
    for line in preview_lines:
        print(line)


if __name__ == "__main__":
    generate_sql()

