window.__ModuleLoader__.load({id:'@neiwang/dws-aitable',factory:require=>{
 const R=require('react'),h=R.createElement;
 function Panel({rpc}){const [state,setState]=R.useState(null),[profile,setProfile]=R.useState(''),[notice,setNotice]=R.useState('');
  async function refresh(){try{const response=await rpc('status',{});if(response.ok){setState(response.value);setProfile(response.value.profile||'');}else setNotice('诊断读取失败。');}catch{setNotice('无法连接本机后台。');}}
  R.useEffect(()=>{void refresh();},[]);
  const logged=state?.auth?.result?.authenticated;
  return h('div',{style:{padding:24,maxWidth:850,lineHeight:1.8}},h('h2',null,'钉钉AI表格'),h('p',null,'官方 DingTalk Workspace CLI 1.0.65 · 独立插件'),h('p',null,'查询和维护 AI 表格中的数据表、字段、记录与视图。首次使用需钉钉组织管理员允许 CLI 访问，并由你完成用户授权。'),
   h('button',{onClick:async()=>{const r=await rpc('login',{});setNotice(r.ok?'已打开本机授权终端。请按提示完成浏览器授权，完成后刷新诊断。':r.message||'打开失败。');}},'登录／授权AI表格'),h('button',{onClick:refresh,style:{marginLeft:12}},'刷新登录状态'),
   h('p',null,'登录状态：',state?(logged?'已登录':'未登录或需要重新授权'):'检查中…'),
   h('label',null,'执行账号（corpId:userId）',h('input',{'aria-label':'AI表格执行账号',value:profile,onChange:e=>setProfile(e.target.value),style:{display:'block',width:460,padding:8}})),
   h('button',{onClick:async()=>{const r=await rpc('save',{profile});setNotice(r.ok?'执行账号已保存。':'保存失败：'+r.message);},style:{marginTop:12}},'保存执行账号'),
   h('p',null,'从下面账号列表复制完整 profile，避免跨组织操作。机器人绑定与这里的用户授权分别管理。'),
   state&&h('div',{'aria-label':'AI表格账号列表'},(state.profiles?.result?.profiles||[]).length?(state.profiles.result.profiles.map(row=>h('p',{key:row.profile},h('button',{onClick:()=>setProfile(row.profile),style:{textAlign:'left',padding:8}},(row.corpName||row.corpId)+' / '+(row.userName||row.userId)+' · '+row.profile)))):h('p',null,'尚无可用账号，请先完成登录授权。')),
   notice&&h('p',{role:'status'},notice),h('p',null,'授权后可对小智说：“查询AI表格里的设备台账”“把这条记录的状态改为已完成”。写入后会查询核对结果。'),
   h('a',{href:'https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli',target:'_blank',rel:'noreferrer'},'官方项目说明'));
 }
 return {inject:['slots','connection'],apply(ctx){const rpc=(endpoint,payload)=>ctx.connection.rpc.call('/neiwang-aitable',endpoint,payload);ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'neiwang-aitable',order:46,label:'钉钉AI表格',inject:()=>({rpc})},Panel));ctx.slots.inject('plugins.bundle.config',()=>ctx.slots.register({name:'plugins.bundle.config',key:'@neiwang/dws-aitable',inject:()=>({rpc})},Panel));}};
}});
