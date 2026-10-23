window.__ModuleLoader__.load({id:'@neiwang/brand',factory:(require)=>{
 const React=require('react'),h=React.createElement;
 const config=globalThis.__NEIWANG_BRAND__||{name:'内网小智',icon:''};
 function Mark({size=34}){return h('img',{src:config.icon,alt:'中广核白鹭',width:size,height:size,style:{objectFit:'contain'}});}
 function Name(){return h('span',{style:{fontSize:24,fontWeight:700}},config.name);}
 return {inject:['slots'],apply(ctx){
  ctx.slots.inject('sidebar.brand.mark',()=>ctx.slots.register({name:'sidebar.brand.mark'},Mark));
  ctx.slots.inject('sidebar.brand.name',()=>ctx.slots.register({name:'sidebar.brand.name'},Name));
  ctx.slots.inject('conversation.hero.brand.mark',()=>ctx.slots.register({name:'conversation.hero.brand.mark'},Mark));
 }};
}});
