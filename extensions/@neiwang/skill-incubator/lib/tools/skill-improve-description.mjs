import { join } from 'node:path';
import { makeHostFs } from '../lib/fs-adapter.mjs';
import { textBlock, optString, errorResult } from '../lib/tool-spec.mjs';
import { parseSimpleYaml, splitFrontmatter } from '../lib/frontmatter.mjs';
import { commitDescription, improveDescription } from '../lib/improve.mjs';
export const skillImproveDescriptionTool = {
    name: 'skill_improve_description',
    description: 'Rewrite a skill description to improve trigger accuracy. Provide the skill path and trigger-scenario examples; returns the rewrite plus reasons while preserving the original trigger coverage. With commit=true the approved rewrite is written back to the frontmatter.',
    parameters: {
        path: {
            type: 'string',
            required: true,
            description: 'Absolute path of the skill directory whose SKILL.md description should be improved.'
        },
        usage: {
            type: 'string',
            required: true,
            description: 'Trigger-scenario examples: when and how users would invoke this skill.'
        },
        commit: {
            type: 'boolean',
            description: 'false (default) = proposal only; true = write the proposal back into the frontmatter.'
        }
    },
    outputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
            status: {
                type: 'string'
            },
            original: {
                type: 'string'
            },
            proposed: {
                type: 'string'
            },
            reasons: {
                type: 'array',
                items: {
                    type: 'string'
                }
            },
            preserved: {
                type: 'array',
                items: {
                    type: 'string'
                }
            },
            added: {
                type: 'array',
                items: {
                    type: 'string'
                }
            },
            path: {
                type: 'string'
            },
            message: {
                type: 'string'
            },
            error: {
                type: 'string'
            }
        }
    },
    render (_args, value) {
        return [
            textBlock(renderImproveText(value))
        ];
    },
    presentationMeta (_args, value) {
        const record = value;
        return {
            status: typeof record.status === 'string' ? record.status : 'unknown',
            proposed: typeof record.proposed === 'string' ? record.proposed : null,
            path: typeof record.path === 'string' ? record.path : null
        };
    },
    async run (ctx, args, signal) {
        const dir = optString(args, 'path');
        if (dir === undefined) return errorResult('path is required');
        const usage = typeof args.usage === 'string' ? args.usage.trim() : '';
        if (usage.length === 0) return errorResult('usage is required (trigger-scenario examples)');
        const commit = args.commit === true;
        const fs = makeHostFs(ctx, signal);
        const skillPath = join(dir, 'SKILL.md');
        let raw;
        try {
            raw = await fs.readText(skillPath);
        } catch (error) {
            return errorResult(`cannot read ${skillPath}: ${String(error)}`);
        }
        let description = '';
        const split = splitFrontmatter(raw);
        if (split !== undefined) {
            try {
                const data = parseSimpleYaml(split.yaml);
                description = typeof data.description === 'string' ? data.description : '';
            } catch  {}
        }
        if (description.length === 0) {
            return errorResult('frontmatter has no description to improve (or the frontmatter is invalid)');
        }
        const improved = improveDescription(description, usage);
        if (!commit) {
            return {
                status: 'proposed',
                original: improved.original,
                proposed: improved.proposed,
                reasons: improved.reasons,
                preserved: improved.preserved,
                added: improved.added,
                path: skillPath,
                message: '改写稿已生成：如确认请将 commit=true 重新调用以写回 frontmatter。'
            };
        }
        const committed = await commitDescription(fs, dir, improved.proposed);
        return {
            status: 'committed',
            original: improved.original,
            proposed: improved.proposed,
            reasons: improved.reasons,
            preserved: improved.preserved,
            added: improved.added,
            path: committed.path,
            message: '已写回 frontmatter 的 description 字段；其余字段与正文保持不变。'
        };
    }
};
function renderImproveText(value) {
    const record = value;
    if (record.status === 'error') return `[skill_improve_description] error: ${String(record.error ?? record.message ?? '')}`;
    const lines = [];
    lines.push(`[skill_improve_description] status=${typeof record.status === 'string' ? record.status : 'unknown'}`);
    lines.push(`原始: ${String(record.original ?? '')}`);
    lines.push(`改写: ${String(record.proposed ?? '')}`);
    if (Array.isArray(record.reasons)) {
        for (const reason of record.reasons)lines.push(`- ${reason}`);
    }
    if (Array.isArray(record.preserved) && record.preserved.length > 0) {
        lines.push(`保留覆盖: ${record.preserved.join(', ')}`);
    }
    if (typeof record.path === 'string') lines.push(`path: ${record.path}`);
    if (typeof record.message === 'string') lines.push(`${record.message}`);
    return lines.join('\n');
}
