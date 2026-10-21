const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron}=require(path.resolve('downloads/validation-playwright/node_modules/playwright'));
(async()=>{let app;try{
 const root=process.env.NEIWANG_APP_ROOT,env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 app=await _electron.launch({executablePath:path.join(root,'launcher/electron/electron.exe'),args:[path.join(root,'launcher/shell')],env});
 const page=await app.firstWindow();await page.getByAltText('中广核白鹭').first().waitFor({timeout:60000});
 const native=await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.map(i=>i.label));assert.deepEqual(native,['编辑']);
 await page.getByRole('button',{name:'设置',exact:true}).click();
 const full=process.env.TEST_MODULAR_FULL==='1';
 if(full){await page.getByText('钉钉机器人',{exact:true}).click();await page.getByRole('heading',{name:'钉钉官方连接器'}).waitFor();await page.getByText('钉钉AI表格',{exact:true}).click();await page.getByRole('heading',{name:'钉钉AI表格',exact:true}).waitFor();}
 else{assert.equal(await page.getByText('钉钉机器人',{exact:true}).count(),0);assert.equal(await page.getByText('钉钉AI表格',{exact:true}).count(),0);assert.equal(await page.locator('#neiwang-rag-toggle').count(),0);}
 await page.screenshot({path:'outputs/R10-Windows-'+(full?'full':'core')+'.png'});
 console.log('PASS native desktop, brand, optional settings visibility');
}finally{if(app)await app.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
