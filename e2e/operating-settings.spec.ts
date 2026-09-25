import {test,expect} from '@playwright/test'
test('公演の0分指定、解除後の継承値と各階層の設定を表示する',async({page})=>{
 await page.goto('/e2e/fixtures/operating-settings.html')
 const prep=page.locator('#operating-performance-preparation_minutes')
 await expect(prep).toHaveValue('0')
 await page.getByText('項目ごとの設定元を確認・変更').click()
 await page.getByRole('combobox').last().click()
 await page.getByRole('option',{name:/共通設定を使う/}).click()
 await expect(prep).toHaveValue('30')
 await page.getByRole('button',{name:'保存',exact:true}).click()
 await expect.poll(async()=>JSON.parse(await page.locator('html').getAttribute('data-saved')||'{}')).toMatchObject({scope:'performance',settings:{preparation_minutes:null}})
 for(const [name,scope,value] of [['組織共通','organization','90'],['店舗','store','60'],['シナリオ','scenario','30']]){
  await page.getByRole('button',{name,exact:true}).click()
  await expect(page.locator(`#operating-${scope}-preparation_minutes`)).toHaveValue(value)
 }
 await page.setViewportSize({width:375,height:812})
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.screenshot({path:'/private/tmp/qw-operating-settings-mobile.png',fullPage:true})
})
test('閲覧権限だけでは設定を書き換えられない',async({page})=>{
 await page.goto('/e2e/fixtures/operating-settings.html?readonly')
 await expect(page.locator('#operating-performance-preparation_minutes')).toBeDisabled()
 await expect(page.getByRole('button',{name:'保存',exact:true})).toHaveCount(0)
})
