"""AES-GCM compatibility using the bundled Node crypto; no pip or network required."""
import base64,json,os,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SCRIPT="""const fs=require('fs'),c=require('crypto');try{const v=JSON.parse(fs.readFileSync(0,'utf8')),k=Buffer.from(v.key,'base64'),n=Buffer.from(v.nonce,'base64'),b=Buffer.from(v.data,'base64'),a=v.aad===null?null:Buffer.from(v.aad,'base64');let out;if(v.operation==='encrypt'){const x=c.createCipheriv('aes-256-gcm',k,n);if(a!==null)x.setAAD(a);out=Buffer.concat([x.update(b),x.final(),x.getAuthTag()])}else{const x=c.createDecipheriv('aes-256-gcm',k,n);if(a!==null)x.setAAD(a);x.setAuthTag(b.subarray(-16));out=Buffer.concat([x.update(b.subarray(0,-16)),x.final()])}process.stdout.write(out.toString('base64'))}catch{process.stderr.write('AEAD operation failed');process.exitCode=1}"""
class AESGCM:
 def __init__(self,key):
  if len(key)!=32:raise ValueError('AES-256 key required')
  self.key=bytes(key)
 def _run(self,operation,nonce,data,aad):
  node=Path(os.environ.get('NEIWANG_AEAD_NODE',str(ROOT/('runtime/node/node.exe' if os.name=='nt' else 'runtime/node/bin/node'))))
  if not node.is_file():raise ValueError('Bundled Node runtime unavailable')
  encode=lambda b:base64.b64encode(b).decode('ascii')
  request={'operation':operation,'key':encode(self.key),'nonce':encode(nonce),'data':encode(data),'aad':None if aad is None else encode(aad)}
  result=subprocess.run([str(node),'-e',SCRIPT],input=json.dumps(request).encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30,**({'creationflags':subprocess.CREATE_NO_WINDOW} if os.name=='nt' else {}))
  if result.returncode:raise ValueError('Configuration authentication failed')
  return base64.b64decode(result.stdout,validate=True)
 def encrypt(self,nonce,data,aad):return self._run('encrypt',nonce,data,aad)
 def decrypt(self,nonce,data,aad):return self._run('decrypt',nonce,data,aad)
