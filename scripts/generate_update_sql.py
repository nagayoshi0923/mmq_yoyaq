#!/usr/bin/env python3
"""
カタログ情報でDBを更新するSQLを生成
Supabase SQL Editorで実行可能
"""

import json
import re
from datetime import datetime


def parse_player_count(player_str):
    """人数文字列をパース"""
    if not player_str:
        return None
    match = re.search(r'(\d+)', player_str)
    if match:
        return int(match.group(1))
    return None


def parse_duration_to_minutes(duration_str):
    """時間文字列を分に変換"""
    if not duration_str:
        return None
    duration_str = duration_str.replace('～', '~')
    if '~' in duration_str:
        duration_str = duration_str.split('~')[0]
    match = re.search(r'([\d.]+)', duration_str)
    if match:
        hours = float(match.group(1))
        return int(hours * 60)
    return None


def map_tags_to_genre(tags):
    """カタログのタグをDBのgenreに変換"""
    genres = []
    for tag in tags:
        clean_tag = re.sub(r'^[✨🌀🎭💀📅💥🇯🇵📖🎩🗓️🔰🔍\s]+', '', tag)
        clean_tag = re.sub(r'[✨🌀🎭💀📅💥🇯🇵📖🎩🗓️🔰🔍\s]+$', '', clean_tag)
        if clean_tag:
            genres.append(clean_tag)
    return genres


def escape_sql(s):
    """SQL文字列をエスケープ"""
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def genres_to_sql_array(genres):
    """ジャンルリストをPostgreSQL配列に変換"""
    if not genres:
        return "NULL"
    escaped = [g.replace("'", "''") for g in genres]
    return "ARRAY[" + ", ".join(f"'{g}'" for g in escaped) + "]"


def load_mapping_data():
    """マッピングデータを読み込み"""
    with open("docs/data/scenario-mapping-legacy.json", "r", encoding="utf-8") as f:
        return json.load(f)


def main():
    print("=== 更新SQL生成 ===\n")
    
    data = load_mapping_data()
    matched = data.get("matched", [])
    
    sql_lines = []
    sql_lines.append("-- カタログ情報でシナリオを更新")
    sql_lines.append(f"-- 生成日時: {datetime.now().isoformat()}")
    sql_lines.append("-- マッチしたシナリオ: {} 件".format(len(matched)))
    sql_lines.append("")
    sql_lines.append("BEGIN;")
    sql_lines.append("")
    
    update_count = 0
    
    for m in matched:
        db_id = m.get("db_id")
        db_title = m.get("db_title")
        catalog_data = m.get("catalog_data", {})
        
        author = catalog_data.get("author", "")
        player_count = parse_player_count(catalog_data.get("player_count", ""))
        duration = parse_duration_to_minutes(catalog_data.get("duration", ""))
        tags = catalog_data.get("tags", [])
        genres = map_tags_to_genre(tags)
        
        # 更新するフィールドを構築
        set_clauses = []
        
        if author and author != "不明":
            set_clauses.append(f"author = {escape_sql(author)}")
        
        if player_count:
            set_clauses.append(f"player_count_min = {player_count}")
            set_clauses.append(f"player_count_max = {player_count}")
        
        if duration:
            set_clauses.append(f"duration = {duration}")
        
        if genres:
            set_clauses.append(f"genre = {genres_to_sql_array(genres)}")
        
        if set_clauses:
            update_count += 1
            sql_lines.append(f"-- {update_count}. {db_title}")
            sql_lines.append(f"UPDATE scenarios SET")
            sql_lines.append(f"  {', '.join(set_clauses)},")
            sql_lines.append(f"  updated_at = NOW()")
            sql_lines.append(f"WHERE id = '{db_id}';")
            sql_lines.append("")
            
            # scenario_masters用（official_durationに変換）
            master_set_clauses = []
            if author and author != "不明":
                master_set_clauses.append(f"author = {escape_sql(author)}")
            if player_count:
                master_set_clauses.append(f"player_count_min = {player_count}")
                master_set_clauses.append(f"player_count_max = {player_count}")
            if duration:
                master_set_clauses.append(f"official_duration = {duration}")
            if genres:
                master_set_clauses.append(f"genre = {genres_to_sql_array(genres)}")
            
            if master_set_clauses:
                sql_lines.append(f"UPDATE scenario_masters SET")
                sql_lines.append(f"  {', '.join(master_set_clauses)},")
                sql_lines.append(f"  updated_at = NOW()")
                sql_lines.append(f"WHERE id = '{db_id}';")
                sql_lines.append("")
    
    sql_lines.append("COMMIT;")
    sql_lines.append("")
    sql_lines.append(f"-- 合計 {update_count} 件のシナリオを更新")
    
    # SQLファイルを保存
    output_path = "database/update_scenarios_from_catalog.sql"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(sql_lines))
    
    print(f"✅ SQL生成完了: {output_path}")
    print(f"   更新対象: {update_count} 件")
    print("")
    print("📋 Supabase SQL Editor で以下のファイルを実行してください:")
    print(f"   {output_path}")


if __name__ == "__main__":
    main()

