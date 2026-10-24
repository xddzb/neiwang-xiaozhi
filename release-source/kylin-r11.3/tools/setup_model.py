from pathlib import Path
import sys,getpass,json
sys.path.insert(0,str(Path(__file__).parent))
import model_config
root=Path(__file__).resolve().parents[1]
base=input('Model API base URL [https://api.deepseek.com]: ').strip() or 'https://api.deepseek.com'
model=input('Model name [deepseek-chat]: ').strip() or 'deepseek-chat'
key=getpass.getpass('API key (hidden): ').strip()
value={'version':1,'base_url':base,'api_key':key,'models':[model],'default_model':model}
target=root/'data/config/model.enc';target.parent.mkdir(parents=True,exist_ok=True)
target.write_bytes(model_config.encode(value))
print('Model configuration saved locally. Start the APP.')
