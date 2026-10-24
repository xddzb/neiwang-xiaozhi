"""Explicit local Dify setup for the R11.3 offline release; never prints keys."""
import getpass
import rag_tool
base=input('Dify application API URL (including /v1): ').strip()
kind=input('Application type [workflow/chatflow, default workflow]: ').strip() or 'workflow'
value={'base_url':base,'api_key':getpass.getpass('Dify API key (hidden): ').strip(),'app_type':kind,'inputs':{}}
if kind=='workflow':
 value['query_input']=input('Workflow question input [user_query]: ').strip() or 'user_query'
 value['answer_output']=input('Workflow answer output [answer]: ').strip() or 'answer'
rag_tool.save_config(value)
print('Dify configuration saved locally. No request was sent. Enable RAG and start a new chat.')
