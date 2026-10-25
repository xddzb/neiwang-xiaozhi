"""Run shipped tools with app-local packages; never install on startup."""
from pathlib import Path
import runpy
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'extensions/python'))
sys.path.insert(1, str(ROOT/'tools'))
allowed = {'pdf': 'pdf_tool.py', 'document': 'document_tools.py', 'api': 'api_tool.py', 'rag': 'rag_tool.py', 'python': 'python_tool.py', 'package': 'package_tool.py'}
if len(sys.argv) < 2 or sys.argv[1] not in allowed:
    raise SystemExit('Usage: python -I tools/tool_entry.py pdf|document|api|rag|python [arguments]')
name = sys.argv.pop(1)
sys.argv[0] = str(ROOT/'tools'/allowed[name])
runpy.run_path(sys.argv[0], run_name='__main__')
