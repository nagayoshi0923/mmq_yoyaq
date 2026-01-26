#!/usr/bin/env python3
"""
マッピング結果をMarkdownレポートに変換
"""

import json
from datetime import datetime


def load_mapping_data():
    """マッピングデータを読み込み"""
    with open("docs/data/scenario-mapping-masters.json", "r", encoding="utf-8") as f:
        return json.load(f)


def generate_report(data):
    """Markdownレポートを生成"""
    matched = data.get("matched", [])
    unmatched_catalog = data.get("unmatched_catalog", [])
    unmatched_db = data.get("unmatched_db", [])
    stats = data.get("stats", {})
    
    lines = []
    
    # ヘッダー
    lines.append("# シナリオマッピングレポート")
    lines.append("")
    lines.append(f"生成日: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append("")
    lines.append("カタログ（https://queenswaltz.jp/catalog）とDBのシナリオマスタをマッピングした結果です。")
    lines.append("")
    
    # 統計
    lines.append("## 統計サマリー")
    lines.append("")
    lines.append(f"- **カタログシナリオ数**: {stats.get('total_catalog', 0)}")
    lines.append(f"- **DBシナリオ数**: {stats.get('total_db', 0)}")
    lines.append(f"- **マッチした数**: {stats.get('matched_count', 0)}")
    lines.append(f"- **カタログのみ（未登録）**: {stats.get('unmatched_catalog_count', 0)}")
    lines.append(f"- **DBのみ（非公開/終了）**: {stats.get('unmatched_db_count', 0)}")
    lines.append("")
    
    # マッチング精度の分布
    lines.append("## マッチング精度の分布")
    lines.append("")
    
    perfect_match = sum(1 for m in matched if m["similarity"] == 1.0)
    high_match = sum(1 for m in matched if 0.9 <= m["similarity"] < 1.0)
    medium_match = sum(1 for m in matched if 0.7 <= m["similarity"] < 0.9)
    low_match = sum(1 for m in matched if m["similarity"] < 0.7)
    
    lines.append(f"- **完全一致（100%）**: {perfect_match}件")
    lines.append(f"- **高精度マッチ（90-99%）**: {high_match}件")
    lines.append(f"- **中精度マッチ（70-89%）**: {medium_match}件")
    lines.append(f"- **低精度マッチ（50-69%）**: {low_match}件")
    lines.append("")
    
    # カタログのみのシナリオ（DB未登録）
    if unmatched_catalog:
        lines.append("## カタログのみ（DB未登録）")
        lines.append("")
        lines.append("以下のシナリオはカタログにあるがDBに登録されていません：")
        lines.append("")
        lines.append("| タイトル | 作者 | 人数 | 料金 | タグ |")
        lines.append("|---------|------|------|------|------|")
        for s in unmatched_catalog:
            title = s.get("title", "")
            author = s.get("author", "")
            player = s.get("player_count", "")
            price = s.get("price", "")
            tags = ", ".join(s.get("tags", []))
            lines.append(f"| {title} | {author} | {player} | {price} | {tags} |")
        lines.append("")
    
    # DBのみのシナリオ（カタログ非公開）
    if unmatched_db:
        lines.append("## DBのみ（カタログ非公開）")
        lines.append("")
        lines.append("以下のシナリオはDBにあるがカタログには掲載されていません：")
        lines.append("")
        lines.append("| タイトル | 作者 |")
        lines.append("|---------|------|")
        for s in unmatched_db:
            title = s.get("title", "")
            author = s.get("author", "") or "不明"
            lines.append(f"| {title} | {author} |")
        lines.append("")
    
    # 低精度マッチ（要確認）
    low_matches = [m for m in matched if m["similarity"] < 0.9]
    if low_matches:
        lines.append("## 要確認（低精度マッチ）")
        lines.append("")
        lines.append("以下のマッチは自動判定のため確認が必要です：")
        lines.append("")
        lines.append("| 類似度 | カタログ | DB |")
        lines.append("|--------|----------|-----|")
        for m in sorted(low_matches, key=lambda x: x["similarity"]):
            sim = f"{m['similarity']:.0%}"
            cat = m.get("catalog_title", "")
            db = m.get("db_title", "")
            lines.append(f"| {sim} | {cat} | {db} |")
        lines.append("")
    
    # マッチ済みリスト（全件）
    lines.append("## マッチ済みリスト")
    lines.append("")
    lines.append("<details>")
    lines.append("<summary>クリックして展開（全 {} 件）</summary>".format(len(matched)))
    lines.append("")
    lines.append("| カタログ | DB | 作者 | タグ |")
    lines.append("|----------|-----|------|------|")
    for m in matched:
        cat = m.get("catalog_title", "")
        db = m.get("db_title", "")
        author = m.get("db_author", "") or ""
        tags = ", ".join(m.get("catalog_data", {}).get("tags", []))
        lines.append(f"| {cat} | {db} | {author} | {tags} |")
    lines.append("")
    lines.append("</details>")
    lines.append("")
    
    return "\n".join(lines)


def main():
    print("マッピングレポートを生成中...")
    
    data = load_mapping_data()
    report = generate_report(data)
    
    output_path = "docs/data/scenario-mapping-report.md"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(report)
    
    print(f"保存完了: {output_path}")
    
    # コンソールにも出力
    print("\n" + "="*60)
    print(report[:3000] + "\n..." if len(report) > 3000 else report)


if __name__ == "__main__":
    main()



