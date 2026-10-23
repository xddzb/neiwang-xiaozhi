from pathlib import Path
import tarfile,sys
ROOT=Path(__file__).resolve().parents[1];BASE='Neiwang-Xiaozhi-Kylin-ARM64-R11.2/'
file=ROOT/'dist/R11.2-Kylin-ARM64-Internal-LF-Fix-RAG/Neiwang-Xiaozhi-Kylin-ARM64-R11.2-Core.tar.gz'
with tarfile.open(file,'r:gz') as tf:
 bootstrap=tf.extractfile(BASE+'launcher/bootstrap.cjs').read()
 assert b"['model.enc','dify.enc']" in bootstrap
 rag=tf.extractfile(BASE+'config/defaults/dify.enc').read();model=tf.extractfile(BASE+'config/defaults/model.enc').read()
assert rag==(ROOT/'outputs/rag-restore/dify.enc').read_bytes()
sys.path.insert(0,str(ROOT/'builds/Neiwang-Xiaozhi-Win10-x64-R11/tools'));import model_config
config=model_config.decode(model)
assert config['default_model']=='qwen3.8' and config['models']==['qwen3.8','deepseek_v4']
print('PASS both startup seeds present; original RAG seed retained; existing model configuration unchanged')
