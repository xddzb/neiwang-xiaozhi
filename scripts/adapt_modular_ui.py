from pathlib import Path
import shutil
FONT_ENV=''' if(process.platform==='linux'){
  const xml=v=>v.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const fontConfig=path.join(data,'runtime/fonts.conf');
  fs.writeFileSync(fontConfig,'<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><include ignore_missing="yes">/etc/fonts/fonts.conf</include><dir>'+xml(path.join(root,'runtime/ui-fonts'))+'</dir><cachedir>'+xml(path.join(data,'runtime/font-cache'))+'</cachedir></fontconfig>');
  env.FONTCONFIG_FILE=fontConfig;
 }
'''
def adapt(app,linux):
 p=app/'launcher/shell/main.js';s=p.read_text(encoding='utf8')
 if 'const fullFeatures=' not in s:
  s=s.replace('const deploymentBrand=JSON.parse','const fullFeatures=JSON.parse(fs.readFileSync(path.join(process.env.NEIWANG_APP_ROOT,"config/app.json"),"utf8")).bundles.includes("@deepseek-ai/neiwang-business");\nconst deploymentBrand=JSON.parse')
  s=s.replace('trustedRag(event)?ragPolicy.read():null','fullFeatures&&trustedRag(event)?ragPolicy.read():null').replace('if(!trustedRag(event)||typeof value','if(!fullFeatures||!trustedRag(event)||typeof value');p.write_text(s,encoding='utf8')
 if linux:
  shutil.copytree(app/'plugin-pack/payload/extensions/office-fonts',app/'runtime/ui-fonts',dirs_exist_ok=True)
  p=app/'launcher/bootstrap.cjs';s=p.read_text(encoding='utf8')
  if 'env.FONTCONFIG_FILE=' not in s:s=s.replace(' delete env.ELECTRON_RUN_AS_NODE;',FONT_ENV+' delete env.ELECTRON_RUN_AS_NODE;');p.write_text(s,encoding='utf8')
