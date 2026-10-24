window.__ModuleLoader__.load({id:'@neiwang/skill-incubator',factory:require=>{
 const R=require('react'),h=R.createElement;
 function Panel(){return h('div',{style:{padding:24,maxWidth:850,lineHeight:1.8}},h('h2',null,'技能孵化器'),h('p',null,'纯内网 · 本地生成、校验、打包 · 无需外部账号'),h('p',null,'对小智说：“把刚才的工作流程整理成一个技能，先给我看草稿”。确认后写入本机技能库，重启后仍可发现。'),h('p',null,'示例：生成设备台账周报技能；验证这个技能格式；把这个技能打包；改进技能的触发描述。'),h('p',null,'保存后的流程可以重复使用，也可以导出技能包交给同事。'),h('p',null,'生成的是流程草稿；需用业务样例验收，不代表技能已经通过业务效果评估。脚本不会自动运行，发布或覆盖现有技能仍需你的明确要求。'));}
 return {inject:['slots'],apply(ctx){ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'neiwang-skill-incubator',order:48,label:'技能孵化器'},Panel));ctx.slots.inject('plugins.bundle.config',()=>ctx.slots.register({name:'plugins.bundle.config',key:'@neiwang/skill-incubator'},Panel));}};
}});
