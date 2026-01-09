#!/usr/bin/env python3
"""
mdms.jp (マダミス.jp) でシナリオを検索
DBにあってカタログにないシナリオの情報を取得
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


async def search_mdms(title):
    """mdms.jpでシナリオを検索"""
    search_url = f"https://mdms.jp/works?keyword={quote(title)}"
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            await page.goto(search_url, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(2000)
            
            # 検索結果を取得
            results = []
            
            # 作品カードを探す
            cards = await page.query_selector_all('a[href^="/works/"]')
            
            for card in cards[:5]:  # 最初の5件のみ
                try:
                    href = await card.get_attribute('href')
                    text = await card.inner_text()
                    
                    if href and '/works/' in href:
                        work_id = href.split('/works/')[-1].split('?')[0]
                        results.append({
                            "id": work_id,
                            "url": f"https://mdms.jp{href}",
                            "text": text.strip()[:100]
                        })
                except:
                    pass
            
            await browser.close()
            return results
            
        except Exception as e:
            await browser.close()
            return {"error": str(e)}


async def search_all_scenarios(scenarios):
    """全シナリオを検索"""
    results = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        for i, scenario in enumerate(scenarios):
            title = scenario.get("title", "")
            
            # テストデータはスキップ
            if "テスト" in title or title.startswith("00") or title.startswith("02"):
                continue
            
            print(f"[{i+1}/{len(scenarios)}] 検索中: {title}")
            
            search_url = f"https://mdms.jp/works?keyword={quote(title)}"
            
            try:
                await page.goto(search_url, wait_until="networkidle", timeout=30000)
                await page.wait_for_timeout(1500)
                
                # 検索結果の件数を取得
                body_text = await page.inner_text('body')
                
                # 作品が見つかったかチェック
                found = False
                work_url = None
                work_info = None
                
                # 作品リンクを探す
                cards = await page.query_selector_all('a[href^="/works/"]')
                
                for card in cards[:3]:
                    try:
                        href = await card.get_attribute('href')
                        card_text = await card.inner_text()
                        
                        # タイトルが含まれているかチェック
                        if href and '/works/' in href:
                            # タイトルの一部がカードテキストに含まれるか
                            title_check = title.replace(" ", "").replace("　", "")[:5]
                            card_check = card_text.replace(" ", "").replace("　", "")
                            
                            if title_check in card_check or card_check[:10] in title:
                                found = True
                                work_url = f"https://mdms.jp{href}"
                                work_info = card_text.strip()[:200]
                                break
                    except:
                        pass
                
                results.append({
                    "db_title": title,
                    "db_author": scenario.get("author", ""),
                    "found_on_mdms": found,
                    "mdms_url": work_url,
                    "mdms_info": work_info
                })
                
                if found:
                    print(f"  ✓ 発見: {work_url}")
                else:
                    print(f"  - 見つからず")
                
            except Exception as e:
                print(f"  ✗ エラー: {e}")
                results.append({
                    "db_title": title,
                    "db_author": scenario.get("author", ""),
                    "found_on_mdms": False,
                    "error": str(e)
                })
            
            # レート制限対策
            await asyncio.sleep(1)
        
        await browser.close()
    
    return results


def save_results(results):
    """結果を保存"""
    # JSON保存
    output_json = "docs/data/mdms-search-results.json"
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump({
            "searched_at": datetime.now().isoformat(),
            "total": len(results),
            "found": sum(1 for r in results if r.get("found_on_mdms")),
            "results": results
        }, f, ensure_ascii=False, indent=2)
    print(f"\n保存: {output_json}")
    
    # Markdown保存
    output_md = "docs/data/mdms-search-results.md"
    with open(output_md, "w", encoding="utf-8") as f:
        f.write("# mdms.jp 検索結果\n\n")
        f.write(f"検索日時: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n")
        
        found_count = sum(1 for r in results if r.get("found_on_mdms"))
        f.write(f"- 検索対象: {len(results)}件\n")
        f.write(f"- 発見: {found_count}件\n")
        f.write(f"- 未発見: {len(results) - found_count}件\n\n")
        
        f.write("## mdms.jpで発見されたシナリオ\n\n")
        f.write("| タイトル | 作者 | mdms.jp |\n")
        f.write("|---------|------|--------|\n")
        for r in results:
            if r.get("found_on_mdms"):
                title = r.get("db_title", "")
                author = r.get("db_author", "") or "不明"
                url = r.get("mdms_url", "")
                f.write(f"| {title} | {author} | [リンク]({url}) |\n")
        
        f.write("\n## mdms.jpで見つからなかったシナリオ\n\n")
        f.write("| タイトル | 作者 |\n")
        f.write("|---------|------|\n")
        for r in results:
            if not r.get("found_on_mdms"):
                title = r.get("db_title", "")
                author = r.get("db_author", "") or "不明"
                f.write(f"| {title} | {author} |\n")
    
    print(f"保存: {output_md}")


async def main():
    print("=== mdms.jp シナリオ検索 ===\n")
    
    # DBのみのシナリオを読み込み
    scenarios = load_unmatched_scenarios()
    print(f"検索対象: {len(scenarios)}件\n")
    
    # 検索実行
    results = await search_all_scenarios(scenarios)
    
    # 結果を保存
    save_results(results)
    
    # サマリー表示
    found = sum(1 for r in results if r.get("found_on_mdms"))
    print(f"\n=== 完了 ===")
    print(f"発見: {found}/{len(results)} 件")


if __name__ == "__main__":
    asyncio.run(main())

