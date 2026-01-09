#!/usr/bin/env python3
"""
mdms.jp (マダミス.jp) でシナリオを検索 - 改良版
"""

import json
import asyncio
import re
from urllib.parse import quote
from playwright.async_api import async_playwright
from datetime import datetime


def load_unmatched_scenarios():
    """DBのみのシナリオを読み込み"""
    with open("docs/data/scenario-mapping-masters.json", "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("unmatched_db", [])


def simplify_title(title):
    """検索用にタイトルを簡略化"""
    # 括弧内を除去
    title = re.sub(r'[（\(][^）\)]*[）\)]', '', title)
    # 記号を除去
    title = re.sub(r'[～〜・\-\s　]', '', title)
    # partX などを除去
    title = re.sub(r'part\d+', '', title, flags=re.IGNORECASE)
    return title.strip()[:15]  # 最初の15文字のみ


async def search_all_scenarios(scenarios):
    """全シナリオを検索"""
    results = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        # まず1件検索してサイト構造を確認
        test_title = "機巧人形の心臓"
        print(f"テスト検索: {test_title}")
        
        try:
            search_url = f"https://mdms.jp/works?keyword={quote(test_title)}"
            await page.goto(search_url, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(3000)
            
            # HTML構造を確認
            html = await page.content()
            with open("mdms_debug.html", "w", encoding="utf-8") as f:
                f.write(html)
            print("デバッグHTML保存: mdms_debug.html")
            
            # ページテキストを取得
            body_text = await page.inner_text('body')
            print(f"\nページテキスト（最初の1000文字）:\n{body_text[:1000]}")
            
        except Exception as e:
            print(f"テスト検索エラー: {e}")
        
        # テストデータをスキップしてスキャン
        valid_scenarios = [s for s in scenarios 
                         if "テスト" not in s.get("title", "") 
                         and not s.get("title", "").startswith("00")
                         and not s.get("title", "").startswith("02")]
        
        print(f"\n検索対象: {len(valid_scenarios)}件\n")
        
        for i, scenario in enumerate(valid_scenarios):
            title = scenario.get("title", "")
            simple_title = simplify_title(title)
            
            print(f"[{i+1}/{len(valid_scenarios)}] {title} → 検索: {simple_title}")
            
            try:
                search_url = f"https://mdms.jp/works?keyword={quote(simple_title)}"
                await page.goto(search_url, wait_until="networkidle", timeout=30000)
                await page.wait_for_timeout(2000)
                
                # 検索結果ページのテキストを取得
                body_text = await page.inner_text('body')
                
                # シナリオタイトルが含まれているかチェック
                found = False
                mdms_url = None
                
                # タイトルの一部でチェック
                title_parts = [title[:5], simple_title[:5]]
                for part in title_parts:
                    if part and len(part) >= 3 and part in body_text:
                        found = True
                        break
                
                # 発見した場合、URLを取得
                if found:
                    links = await page.query_selector_all('a[href*="/works/"]')
                    for link in links[:10]:
                        try:
                            href = await link.get_attribute('href')
                            link_text = await link.inner_text()
                            
                            if any(p in link_text for p in title_parts if p and len(p) >= 3):
                                mdms_url = f"https://mdms.jp{href}" if not href.startswith('http') else href
                                break
                        except:
                            pass
                
                results.append({
                    "db_title": title,
                    "db_author": scenario.get("author", ""),
                    "db_id": scenario.get("id", ""),
                    "found_on_mdms": found,
                    "mdms_url": mdms_url,
                    "search_query": simple_title
                })
                
                if found:
                    print(f"  ✓ 発見! {mdms_url or ''}")
                else:
                    print(f"  - 見つからず")
                
            except Exception as e:
                print(f"  ✗ エラー: {e}")
                results.append({
                    "db_title": title,
                    "db_author": scenario.get("author", ""),
                    "db_id": scenario.get("id", ""),
                    "found_on_mdms": False,
                    "error": str(e)
                })
            
            await asyncio.sleep(0.8)
        
        await browser.close()
    
    return results


def save_results(results):
    """結果を保存"""
    output_json = "docs/data/mdms-search-results.json"
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump({
            "searched_at": datetime.now().isoformat(),
            "total": len(results),
            "found": sum(1 for r in results if r.get("found_on_mdms")),
            "results": results
        }, f, ensure_ascii=False, indent=2)
    print(f"\n保存: {output_json}")
    
    output_md = "docs/data/mdms-search-results.md"
    with open(output_md, "w", encoding="utf-8") as f:
        f.write("# mdms.jp 検索結果\n\n")
        f.write(f"検索日時: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n")
        
        found_results = [r for r in results if r.get("found_on_mdms")]
        not_found = [r for r in results if not r.get("found_on_mdms")]
        
        f.write(f"- 検索対象: {len(results)}件\n")
        f.write(f"- 発見: {len(found_results)}件\n")
        f.write(f"- 未発見: {len(not_found)}件\n\n")
        
        if found_results:
            f.write("## mdms.jpで発見されたシナリオ\n\n")
            f.write("| タイトル | 作者 | mdms.jp |\n")
            f.write("|---------|------|--------|\n")
            for r in found_results:
                title = r.get("db_title", "")
                author = r.get("db_author", "") or "不明"
                url = r.get("mdms_url", "")
                if url:
                    f.write(f"| {title} | {author} | [リンク]({url}) |\n")
                else:
                    f.write(f"| {title} | {author} | 発見 |\n")
        
        f.write("\n## mdms.jpで見つからなかったシナリオ\n\n")
        f.write("| タイトル | 作者 |\n")
        f.write("|---------|------|\n")
        for r in not_found:
            title = r.get("db_title", "")
            author = r.get("db_author", "") or "不明"
            f.write(f"| {title} | {author} |\n")
    
    print(f"保存: {output_md}")


async def main():
    print("=== mdms.jp シナリオ検索 v2 ===\n")
    
    scenarios = load_unmatched_scenarios()
    print(f"全シナリオ: {len(scenarios)}件\n")
    
    results = await search_all_scenarios(scenarios)
    save_results(results)
    
    found = sum(1 for r in results if r.get("found_on_mdms"))
    print(f"\n=== 完了 ===")
    print(f"発見: {found}/{len(results)} 件")


if __name__ == "__main__":
    asyncio.run(main())

