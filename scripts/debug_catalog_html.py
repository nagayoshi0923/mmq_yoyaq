#!/usr/bin/env python3
"""HTMLをデバッグ用に保存"""

import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        url = "https://queenswaltz.jp/catalog"
        print(f"アクセス中: {url}")
        await page.goto(url, wait_until="networkidle")
        await page.wait_for_timeout(3000)
        
        # もっと見るを数回クリック
        for i in range(5):
            try:
                btn = await page.query_selector('button:has-text("もっと見る")')
                if btn and await btn.is_visible():
                    await btn.click()
                    print(f"クリック {i+1}")
                    await page.wait_for_timeout(1500)
            except:
                pass
        
        # HTMLを保存
        html = await page.content()
        with open('/tmp/catalog.html', 'w') as f:
            f.write(html)
        print(f"HTML保存: {len(html)} bytes -> /tmp/catalog.html")
        
        # テキストを取得
        text = await page.inner_text('body')
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        
        print(f"\n=== テキスト抽出 (最初100行) ===")
        for i, line in enumerate(lines[:100]):
            print(f"{i}: {line}")
        
        await browser.close()

asyncio.run(main())



