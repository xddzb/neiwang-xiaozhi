window.__ModuleLoader__.load({id:'@deepseek-ai/neiwang-dingtalk-ui',factory:(require)=>{
  const React=require('react'),h=React.createElement;
  function Panel({rpcCall}){
    const [state,setState]=React.useState(null),[error,setError]=React.useState(''),[notice,setNotice]=React.useState('');
    const [binding,setBinding]=React.useState(null),[generating,setGenerating]=React.useState(false),[now,setNow]=React.useState(Date.now());
    const commandRef=React.useRef(null);
    async function refresh(){try{const result=await rpcCall('status',{});if(!result.ok)throw Error('诊断读取失败');setState(result.value);setError('');}catch{setError('无法读取钉钉状态，请检查本机后台连接。');}}
    React.useEffect(()=>{void refresh();},[]);
    React.useEffect(()=>{if(!binding?.expiresAt)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[binding]);
    const bound=state?.report.accounts?.some(a=>a.id==='default'&&a.checks.some(c=>c.code==='owner.configured'));
    React.useEffect(()=>{if(bound)setBinding(null);},[bound]);
    async function generateBinding(){
      if(generating)return;setGenerating(true);setError('');
      try{const result=await rpcCall('binding.generate',{});if(!result.ok)throw Error();
        if(result.value.bound){setBinding(null);setNotice('管理员已经绑定，可以直接私聊机器人发送测试消息。');await refresh();}
        else{setBinding(result.value);setNow(Date.now());setNotice('已生成新口令，之前未使用的口令已失效。请复制命令，私聊机器人发送。');}
      }catch{setError('生成绑定口令失败，请确认正在本机使用内网小智后重试。');}finally{setGenerating(false);}
    }
    async function copyBinding(){
      if(!binding||Date.now()>=binding.expiresAt)return;
      try{await navigator.clipboard.writeText(binding.command);setNotice('命令已复制，请在钉钉中私聊机器人发送。');}
      catch{commandRef.current?.focus();commandRef.current?.select();setNotice('已选中命令，请按 Ctrl+C 复制。');}
    }
    const remaining=binding?Math.max(0,Math.ceil((binding.expiresAt-now)/1000)):0;
    async function setup(){try{const result=await rpcCall('setup',{});if(!result.ok)throw Error();setNotice('已请求打开本机配置终端。请在终端扫码或输入凭据；保存后完全退出并重启内网小智。');}catch{setError('无法打开配置终端，可双击 APP 目录中的“配置钉钉.cmd”。');}}
    const checks=state?[...(state.report.checks||[]),...(state.report.accounts||[]).flatMap(a=>a.checks.map(c=>({...c,message:a.id+'：'+c.message})))]:[];
    return h('div',{style:{padding:20,lineHeight:1.7,maxWidth:850,fontFamily:'system-ui,"Microsoft YaHei",sans-serif'}},
      h('h2',null,'钉钉官方连接器'),h('p',null,'DingTalk-Real-AI/dsh-dingtalk · '+(state?.version||'0.10.2')),
      h('p',null,'通过 Stream 长连接接收私聊和群内 @ 消息，交给内网小智执行并回复。'),
      h('p',null,'首次配置在独立本机终端完成，支持扫码创建或填写已有机器人凭据。默认仅管理员可用、群聊关闭，可在配置时调整。'),
      h('button',{onClick:setup,style:{padding:'8px 16px',marginRight:12}},'打开配置引导'),
      h('button',{onClick:refresh,style:{padding:'8px 16px'}},'刷新本机诊断'),
      h('button',{onClick:generateBinding,disabled:generating||bound,style:{padding:'8px 16px',marginLeft:12}},bound?'管理员已绑定':generating?'正在生成…':'生成绑定口令'),
      binding&&h('div',{style:{marginTop:16,padding:16,border:'1px solid #d9dfe8',borderRadius:8},'data-binding-panel':true},
        h('p',null,remaining>0?'复制下面完整命令，在钉钉中私聊机器人发送：':'绑定口令已过期，请重新生成。'),
        remaining>0&&h('input',{ref:commandRef,'aria-label':'绑定命令',readOnly:true,value:binding.command,onClick:event=>event.target.select(),style:{fontFamily:'monospace',fontSize:18,padding:8,width:240}}),
        h('button',{onClick:copyBinding,disabled:remaining===0,style:{padding:'8px 16px',marginLeft:12}},'复制命令'),
        h('p',{'data-binding-expiry':true},'有效期至 '+new Date(binding.expiresAt).toLocaleString('zh-CN')+' · 剩余 '+Math.floor(remaining/60)+' 分 '+remaining%60+' 秒'),
        h('p',null,'仅在此页面临时显示；关闭页面后需重新生成。不要发到群聊或 AI 聊天中。')),
      notice&&h('p',{role:'status'},notice),error&&h('p',{role:'alert'},error),
      !state&&!error&&h('p',null,'正在读取状态…'),
      h('ul',null,...checks.map((c,i)=>h('li',{key:i},c.status+' · '+c.message))),
      h('p',null,'离线诊断仅检查本机配置；真实收发需要完成机器人授权、管理员绑定和一条消息验收。'),
      h('a',{href:'https://github.com/DingTalk-Real-AI/dsh-dingtalk',target:'_blank',rel:'noreferrer'},'官方项目说明'));
  }
  return {name:'neiwang-dingtalk-settings',inject:['slots','connection'],apply(ctx){
    const rpcCall=(endpoint,payload)=>ctx.connection.rpc.call('/neiwang-dingtalk',endpoint,payload);
    ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'neiwang-dingtalk',order:45,label:'钉钉机器人',inject:()=>({rpcCall})},Panel));
    for(const key of ['@dingtalk-real-ai/dsh-dingtalk','@deepseek-ai/neiwang-dingtalk-ui']){
      ctx.slots.inject('plugins.bundle.config',()=>ctx.slots.register({name:'plugins.bundle.config',key,inject:()=>({rpcCall})},Panel));
    }
  }};
}});
