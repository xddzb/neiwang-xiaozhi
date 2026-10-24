import { join } from 'node:path';
import { parseSimpleYaml, splitFrontmatter, YamlError } from './frontmatter.mjs';
import { isSkillName } from './skill-name.mjs';
function stringField(data, key) {
    const value = data[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
export function formatChecks(checks) {
    return checks.map((check)=>`${check.ok ? 'PASS' : 'FAIL'} ${check.item} — ${check.message}`).join('\n');
}
export async function validateSkillDir(fs, dir) {
    const checks = [];
    const skillPath = join(dir, 'SKILL.md');
    const stat = await fs.stat(skillPath);
    if (stat === undefined || stat.type !== 'file') {
        return {
            ok: false,
            checks: [
                {
                    item: 'SKILL.md exists',
                    ok: false,
                    message: `skill file SKILL.md not found at ${dir}`
                }
            ]
        };
    }
    checks.push({
        item: 'SKILL.md exists',
        ok: true,
        message: `found at ${skillPath}`
    });
    let raw;
    try {
        raw = await fs.readText(skillPath);
    } catch (error) {
        return {
            ok: false,
            checks: [
                ...checks,
                {
                    item: 'SKILL.md readable',
                    ok: false,
                    message: `cannot read: ${String(error)}`
                }
            ]
        };
    }
    checks.push({
        item: 'SKILL.md readable',
        ok: true,
        message: `${raw.length} chars`
    });
    const split = splitFrontmatter(raw);
    if (split === undefined) {
        return {
            ok: false,
            checks: [
                ...checks,
                {
                    item: 'frontmatter',
                    ok: false,
                    message: 'missing YAML frontmatter'
                }
            ]
        };
    }
    checks.push({
        item: 'frontmatter',
        ok: true,
        message: 'YAML frontmatter present'
    });
    let data;
    try {
        data = parseSimpleYaml(split.yaml);
    } catch (error) {
        const detail = error instanceof YamlError ? error.message : String(error);
        return {
            ok: false,
            checks: [
                ...checks,
                {
                    item: 'frontmatter',
                    ok: false,
                    message: `invalid YAML frontmatter: ${detail}`
                }
            ]
        };
    }
    checks.push({
        item: 'frontmatter',
        ok: true,
        message: 'parses as a YAML mapping'
    });
    const name = stringField(data, 'name');
    const description = stringField(data, 'description');
    if (name === undefined || description === undefined) {
        const missing = [
            name === undefined ? 'name' : null,
            description === undefined ? 'description' : null
        ].filter((entry)=>entry !== null);
        return {
            ok: false,
            checks: [
                ...checks,
                {
                    item: 'frontmatter fields',
                    ok: false,
                    message: `frontmatter requires ${missing.join(' and ')}`
                }
            ]
        };
    }
    checks.push({
        item: 'name',
        ok: true,
        message: `present: ${name}`
    });
    checks.push({
        item: 'description',
        ok: true,
        message: `present (${description.length} chars)`
    });
    if (!isSkillName(name)) {
        return {
            ok: false,
            checks: [
                ...checks,
                {
                    item: 'name',
                    ok: false,
                    message: `invalid skill name "${name}"`
                }
            ]
        };
    }
    checks.push({
        item: 'name',
        ok: true,
        message: 'valid kebab-case skill name'
    });
    const body = split.body.trim();
    checks.push({
        item: 'body',
        ok: body.length > 0,
        message: body.length > 0 ? `body present (${body.length} chars)` : 'empty body (skill carries no instructions)'
    });
    return {
        ok: checks.every((check)=>check.ok),
        checks
    };
}
