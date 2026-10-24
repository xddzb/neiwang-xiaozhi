// Interactive OAuth output stays in the user's own terminal.
const path=require('node:path'),{spawnSync}=require('node:child_process');
(async()=>{const root=path.resolve(__dirname,'..');const {environment}=await import(require('node:url').pathToFileURL(path.join(root,'extensions/node_modules/@neiwang/dws-aitable/runner.mjs')));const binary=path.join(root,'extensions/dws',process.platform==='win32'?'dws.exe':'dws');
 console.log('钉钉AI表格授权：请确认目标组织；授权信息仅保存本机。');
 const result=spawnSync(binary,['auth','login'],{cwd:root,env:environment(root),stdio:'inherit'});
 if(result.status===0){spawnSync(binary,['profile','list','--format','json'],{cwd:root,env:environment(root),stdio:'inherit'});console.log('回到设置 → 钉钉AI表格，刷新并保存目标 corpId:userId。');}
 console.log('按回车关闭窗口。');process.stdin.resume();process.stdin.once('data',()=>process.exit(result.status||0));
})().catch(()=>{console.error('授权终端启动失败。');process.exitCode=1;});
