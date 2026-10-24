const path=require('node:path'),{spawn}=require('node:child_process');
const p=require(path.join(process.env.NEIWANG_APP_ROOT,'launcher/bootstrap.cjs')).prepare();
const child=spawn(p.node,[p.cli,'web','--patch',process.env.NEIWANG_TEST_PATCH,'--no-open','--port','0'],{cwd:path.join(p.root,'workspace'),env:p.env,stdio:'inherit'});
child.on('exit',code=>process.exit(code||0));
