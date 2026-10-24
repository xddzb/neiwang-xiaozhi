import { makeHostFs } from '../lib/fs-adapter.mjs';
import { textBlock, optString, errorResult } from '../lib/tool-spec.mjs';
import { validateSkillDir } from '../lib/validate-skill.mjs';
export const skillValidateTool = {
    name: 'skill_validate',
    description: 'Validate an existing skill directory: SKILL.md exists, frontmatter parses, name and description are present and valid. Returns per-item pass/fail.',
    parameters: {
        path: {
            type: 'string',
            required: true,
            description: 'Absolute path of the skill directory to validate.'
        }
    },
    outputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            status: {
                type: 'string'
            },
            ok: {
                type: 'boolean'
            },
            checks: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        item: {
                            type: 'string'
                        },
                        ok: {
                            type: 'boolean'
                        },
                        message: {
                            type: 'string'
                        }
                    }
                }
            },
            summary: {
                type: 'string'
            },
            message: {
                type: 'string'
            }
        }
    },
    render (_args, value) {
        return [
            textBlock(renderValidateText(value))
        ];
    },
    presentationMeta (_args, value) {
        const record = value;
        return {
            ok: record.ok === true
        };
    },
    async run (ctx, args, signal) {
        const dir = optString(args, 'path');
        if (dir === undefined) return errorResult('path is required');
        const fs = makeHostFs(ctx, signal);
        const result = await validateSkillDir(fs, dir);
        return {
            ok: result.ok,
            checks: result.checks,
            summary: result.ok ? 'valid skill: all checks passed' : 'validation failed (see checks)'
        };
    }
};
function renderValidateText(value) {
    const record = value;
    const lines = [];
    if (record.status === 'error') return `[skill_validate] error: ${String(record.message ?? '')}`;
    lines.push(`[skill_validate] ${record.ok === true ? 'OK' : 'FAILED'}`);
    if (Array.isArray(record.checks)) {
        for (const check of record.checks){
            lines.push(`${check.ok === true ? 'PASS' : 'FAIL'} ${String(check.item ?? '')} — ${String(check.message ?? '')}`);
        }
    }
    if (typeof record.summary === 'string') lines.push(record.summary);
    return lines.join('\n');
}
