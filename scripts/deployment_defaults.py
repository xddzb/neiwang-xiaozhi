"""Merge reviewed model UI/compaction defaults without copying private settings."""
import json
from pathlib import Path

def merge_defaults(raw):
    rows = json.loads(raw)
    reviewed = json.loads((Path(__file__).resolve().parents[1]/'config/overrides.json').read_text(encoding='utf-8'))
    for policy in reviewed:
        if policy['id'] not in ('ui-settings-models', 'compaction-basic'):
            continue
        matches = [i for i, row in enumerate(rows) if row['id'] == policy['id']]
        if len(matches) > 1:
            raise ValueError('Duplicate deployment policy')
        if matches:
            rows[matches[0]] = {**rows[matches[0]], **policy}
        else:
            rows.append(policy)
    return (json.dumps(rows, ensure_ascii=False, indent=2)+'\n').encode('utf-8')
