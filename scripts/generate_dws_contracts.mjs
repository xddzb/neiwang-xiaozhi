// Generate local CLI schema material from the pinned official CLI. Never commit the output.
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const source=new URL('../extensions/@neiwang/dws-aitable/runner.mjs',import.meta.url);
const text=readFileSync(source,'utf8');
const block=text.split('const entries={')[1]?.split('};')[0];
if(!block)throw Error('Command registry not found');
const commands=[...block.matchAll(/'([^']+)'\s*:\s*(?:true|false)/g)].map(m=>m[1]);
const executable=process.argv[2];if(!executable)throw Error('Usage: node scripts/generate_dws_contracts.mjs <official-dws-path>');
const result={};
for(const command of commands){
 const run=spawnSync(executable,['schema','--cli-path','aitable '+command,'--compact','--format','json'],{encoding:'utf8',shell:false,timeout:30000,maxBuffer:4*1024*1024,windowsHide:true});
 if(run.error||run.status!==0)throw Error('DWS schema failed: '+command);
 const value=JSON.parse(run.stdout);
 if(!value.parameters||typeof value.parameters!=='object')throw Error('Unexpected DWS schema shape: '+command);
 result[command]=value;
}
if(!commands.length)throw Error('No commands found');
writeFileSync(new URL('../extensions/@neiwang/dws-aitable/contracts.json',import.meta.url),JSON.stringify(result,null,2));
console.log('Generated schemas for '+commands.length+' commands');
