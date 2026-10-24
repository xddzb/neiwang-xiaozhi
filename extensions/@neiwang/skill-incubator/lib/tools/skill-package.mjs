import { makeHostFs } from '../lib/fs-adapter.mjs';
import { textBlock, optString } from '../lib/tool-spec.mjs';
import { packSkillDir } from '../lib/package-skill.mjs';
export const skillPackageTool = {
    name: 'skill_package',
    description: 'Package a validated skill directory into a distributable .skill (ZIP) file. Runs skill_validate first and refuses to package invalid skills. Excludes __pycache__/, node_modules/, *.pyc, .DS_Store and root-level evals/.',
    parameters: {
        path: {
            type: 'string',
            required: true,
            description: 'Absolute path of the skill directory to package.'
        },
        outDir: {
            type: 'string',
            description: 'Directory for the produced <skillName>.skill. Default: the skill\'s parent directory.'
        }
    },
    outputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            ok: {
                type: 'boolean'
            },
            skillName: {
                type: 'string'
            },
            outPath: {
                type: 'string'
            },
            entries: {
                type: 'array',
                items: {
                    type: 'string'
                }
            },
            error: {
                type: 'string'
            }
        }
    },
    render (_args, value) {
        return [
            textBlock(renderPackageText(value))
        ];
    },
    presentationMeta (_args, value) {
        const record = value;
        return {
            ok: record.ok === true,
            skillName: typeof record.skillName === 'string' ? record.skillName : null,
            outPath: typeof record.outPath === 'string' ? record.outPath : null
        };
    },
    async run (ctx, args, signal) {
        const dir = optString(args, 'path');
        if (dir === undefined) {
            return {
                ok: false,
                error: 'path is required'
            };
        }
        const fs = makeHostFs(ctx, signal);
        try {
            const result = await packSkillDir(fs, dir, optString(args, 'outDir'));
            return {
                ok: true,
                skillName: result.skillName,
                outPath: result.outPath,
                entries: result.entries
            };
        } catch (error) {
            return {
                ok: false,
                error: String(error)
            };
        }
    }
};
function renderPackageText(value) {
    const record = value;
    const lines = [];
    if (record.ok === true) {
        lines.push(`[skill_package] OK`);
        if (typeof record.skillName === 'string') lines.push(`skillName: ${record.skillName}`);
        if (typeof record.outPath === 'string') lines.push(`outPath: ${record.outPath}`);
        if (Array.isArray(record.entries)) {
            lines.push(`zip entries (${record.entries.length}):`);
            for (const entry of record.entries)lines.push(`  ${entry}`);
        }
    } else {
        lines.push(`[skill_package] FAILED`);
        lines.push(String(record.error ?? 'unknown error'));
    }
    return lines.join('\n');
}
