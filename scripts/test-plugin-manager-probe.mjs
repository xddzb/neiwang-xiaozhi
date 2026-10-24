// Focused real-plugin regression: managed skill bundle plus untouched PDF text engine.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const [app,fixtures,output]=process.argv.slice(2).map(value=>resolve(value));
await fs.mkdir(output,{recursive:true});process.env.NEIWANG_APP_ROOT=app;process.env.DSH_HOME=join(output,'dsh');
globalThis.fetch=async()=>{throw Error('Network forbidden in regression probe')};
const load=name=>import(pathToFileURL(join(app,'extensions/node_modules',name)).href);
const inc=await load('@neiwang/skill-incubator/index.mjs');
const draft=await inc.invoke('skill_new',{goal:'Create an equipment weekly report',name:'upgrade-probe',confirm:false});assert.equal(draft.status,'needs-confirmation');
const saved=await inc.invoke('skill_new',{goal:'Create an equipment weekly report',name:'upgrade-probe',description:'Use for equipment weekly reports',confirm:true});assert.equal(saved.status,'created');
assert.equal((await inc.invoke('skill_validate',{path:saved.dir})).ok,true);assert.equal((await inc.invoke('skill_package',{path:saved.dir})).ok,true);
const pdf=await load('dsh-attachment-formats/lib/index.js');
const result=await pdf.convertFile({logger:{warn(){},info(){}},get(){}},{name:'text.pdf',bytes:await fs.readFile(join(fixtures,'text.pdf'))},output,16000);
assert.equal(result.kind,'text');assert(result.text.includes('NEIWANG OFFLINE PDF TEST'));
await fs.writeFile(join(output,'result.json'),JSON.stringify({status:'PASS',skill:true,pdfText:true,ocrRun:false}));
console.log('PASS real skill invocation and unchanged PDF text parsing');
