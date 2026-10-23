// Private user-operated terminal. Never pipe or capture its credentials or QR output.
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const prepared=(await import(pathToFileURL(join(root,'launcher/bootstrap.cjs')))).default.prepare();
Object.assign(process.env,prepared.env);
const base=join(prepared.core,'node_modules/@deepseek-ai/dsh');
const lib=join(root,'extensions/node_modules/@dingtalk-real-ai/dsh-dingtalk/lib');
process.env.DSH_HOME=prepared.home;
process.env.DSH_DINGTALK_STATE_DIR=prepared.env.DSH_DINGTALK_STATE_DIR;
const {collectDoctorReport}=await import(pathToFileURL(join(lib,'doctor-report.js')));
if(process.argv.includes('--bind')){
  if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('请在本机独立终端生成绑定口令。');
  const {OwnerBinding,issueBindingChallenge}=await import(pathToFileURL(join(lib,'owner.js')));
  const {loadWebProfileConfig}=await import(pathToFileURL(join(lib,'setup-state.js')));
  const {ConsoleSetupUi}=await import(pathToFileURL(join(lib,'console-ui.js')));
  const profile=await loadWebProfileConfig(process.env.DSH_HOME);
  const account=profile.accounts.find(a=>a.id==='default');
  const file=join(process.env.DSH_DINGTALK_STATE_DIR,'owner.json');
  const binding=new OwnerBinding({file,configuredOwner:account?.ownerStaffId||profile.ownerStaffId||'',senderAccess:'owner',allowedSenders:[],legacyAllowedSenders:[],allowedGroups:[]});
  if(binding.status().bound){console.log('管理员已经绑定，不需要再次发送 /bind。可以直接私聊机器人发送“你好”测试。');}
  else{
    const ui=new ConsoleSetupUi();
    try{
      if(await ui.confirm('regenerateBinding','生成新的 10 分钟绑定口令？之前的未使用口令将失效。',true)){
        const challenge=issueBindingChallenge(file);
        console.log('\n请复制下面整行，在钉钉中私聊机器人发送（不要发到群聊或 AI 聊天）：\n');
        console.log('/bind '+challenge.code);
        console.log('\n有效期 10 分钟。内网小智已连接时，无需重启即可绑定。');
      }
    }finally{ui.close();}
  }
}else if(process.argv.includes('--doctor')){
  const report=await collectDoctorReport({dshHome:process.env.DSH_HOME,stateDir:process.env.DSH_DINGTALK_STATE_DIR,mode:'offline'});
  console.log(JSON.stringify(report,null,2));
}else{
  if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('请在本机独立终端运行此配置引导。');
  const {ConsoleSetupUi}=await import(pathToFileURL(join(lib,'console-ui.js')));
  const {runPrivateAccountSetup}=await import(pathToFileURL(join(lib,'setup.js')));
  const {loadWebProfileConfig,updateWebProfileConfig,updateWebProfileAccountAccess}=await import(pathToFileURL(join(lib,'setup-state.js')));
  const runner={run(command,args){
    if(command!=='dsh'||args.join(' ')!=='--version')throw Error('本机适配器不执行额外安装命令');
    const result=spawnSync(process.execPath,[join(base,'lib/bin.js'),'--version'],{encoding:'utf8',windowsHide:true});
    return {code:result.status??1,stdout:result.stdout||'',stderr:result.stderr||''};
  }};
  const ui=new ConsoleSetupUi();
  try{
    console.log('内网小智 · 钉钉官方连接器 0.10.2\n插件已离线集成，无需另装 DSH 或 pnpm。此窗口由你亲自操作。');
    await updateWebProfileConfig(process.env.DSH_HOME,{dwsEnabled:false,imageMode:'auto'});
    await runPrivateAccountSetup({ui,runner,dshHome:process.env.DSH_HOME,stateDir:process.env.DSH_DINGTALK_STATE_DIR,accountId:'default'});
    const profile=await loadWebProfileConfig(process.env.DSH_HOME);
    const current=profile.accounts.find(a=>a.id==='default');
    const senderAccess=await ui.select('senderAccess','允许哪些人使用机器人？',[{value:'owner',label:'仅管理员'},{value:'allowlist',label:'管理员和指定员工'},{value:'all',label:'所有能访问机器人的人'}],current?.senderAccess||'owner');
    const parse=value=>[...new Set(value.split(/[,，\s]+/u).filter(Boolean))];
    const allowedSenders=senderAccess==='allowlist'?parse(await ui.text('allowedSenders','允许的 senderStaffId，逗号分隔')):[];
    const groupAccess=await ui.select('groupAccess','允许哪些群聊？',[{value:'none',label:'关闭群聊'},{value:'allowlist',label:'指定测试群'},{value:'all',label:'所有可加入的群'}],current?.groupAccess||'none');
    const groupAllowlist=groupAccess==='allowlist'?parse(await ui.text('groupAllowlist','允许的 openConversationId，逗号分隔')):[];
    await updateWebProfileAccountAccess(process.env.DSH_HOME,'default',{senderAccess,allowedSenders,groupAccess,groupAllowlist,sessionScope:'chat-sender'});
    console.log('\n配置已保存。请完全退出并重新启动内网小智，待连接后在钉钉私聊中完成上方 /bind 绑定，再发送测试消息。');
  }finally{ui.close();}
}
