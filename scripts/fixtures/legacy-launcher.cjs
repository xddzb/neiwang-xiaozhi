// Synthetic launcher shape for adapter tests; not a runnable release.
const fs=require('node:fs');
function prepare(){
 const root=process.env.NEIWANG_APP_ROOT,manifest='',currentProfile={dependencies:{},dsh:{profile:{bundles:[]}}},deployment={bundles:[]};
 fs.writeFileSync(manifest,JSON.stringify(currentProfile,null,2));
 return {root};
}
module.exports={prepare};
