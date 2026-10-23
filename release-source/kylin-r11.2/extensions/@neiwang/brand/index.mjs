import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export const name='neiwang-brand';
export const inject=['webServer'];
export function apply(ctx){
 const root=process.env.NEIWANG_APP_ROOT;
 const config=JSON.parse(readFileSync(join(root,'config/brand.json'),'utf8'));
 const icon='data:image/png;base64,'+readFileSync(join(root,config.icon)).toString('base64');
 ctx.webServer.tapIndex(html=>html.replace('</head>','<script>globalThis.__NEIWANG_BRAND__='+JSON.stringify({name:config.name,icon}).replaceAll('<','\\u003c')+';</script></head>'));
}
