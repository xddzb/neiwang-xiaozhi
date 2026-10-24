import { basename, dirname, join, relative, sep } from 'node:path';
import { formatChecks, validateSkillDir } from './validate-skill.mjs';
import { buildZip } from './zip.mjs';
export const PACKAGE_EXCLUDE_DIRS = new Set([
    '__pycache__',
    'node_modules'
]);
export const PACKAGE_EXCLUDE_GLOBS = [
    '*.pyc'
];
export const PACKAGE_EXCLUDE_FILES = new Set([
    '.DS_Store'
]);
const SKILL_ROOT_EVALS = 'evals';
export function matchSimpleGlob(glob, name) {
    const pattern = '^' + glob.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
    return new RegExp(pattern).test(name);
}
export function shouldExcludeSkillPath(rel, isDirectory) {
    const segments = rel.split('/').filter((segment)=>segment.length > 0);
    if (segments.length === 0) return false;
    const base = segments[segments.length - 1];
    if (isDirectory) {
        if (PACKAGE_EXCLUDE_DIRS.has(base)) return true;
        if (segments.length === 1 && base === SKILL_ROOT_EVALS) return true;
        return false;
    }
    if (PACKAGE_EXCLUDE_FILES.has(base)) return true;
    for (const glob of PACKAGE_EXCLUDE_GLOBS){
        if (matchSimpleGlob(glob, base)) return true;
    }
    return false;
}
export async function collectSkillFiles(fs, skillDir) {
    const name = basename(skillDir);
    const files = [];
    async function walk(current) {
        let entries;
        try {
            entries = await fs.listDir(current);
        } catch  {
            return;
        }
        for (const entry of entries){
            const abs = join(current, entry);
            const rel = relative(skillDir, abs).split(sep).join('/');
            let isDir = false;
            let isFile = false;
            try {
                const info = await fs.stat(abs);
                if (info === undefined) continue;
                isDir = info.type === 'dir';
                isFile = info.type === 'file';
            } catch  {}
            if (shouldExcludeSkillPath(rel, isDir)) continue;
            if (isDir) {
                await walk(abs);
            } else if (isFile) {
                files.push({
                    abs,
                    rel
                });
            }
        }
    }
    await walk(skillDir);
    return {
        name,
        files
    };
}
export async function packSkillDir(fs, skillDir, outDir) {
    const validation = await validateSkillDir(fs, skillDir);
    if (!validation.ok) {
        throw new Error(`packSkill: validation failed:\n${formatChecks(validation.checks)}`);
    }
    const collected = await collectSkillFiles(fs, skillDir);
    if (collected.files.length === 0) {
        throw new Error('packSkill: no files to package');
    }
    const entries = [
        {
            name: `${collected.name}/`,
            data: new Uint8Array(0)
        }
    ];
    for (const file of collected.files){
        const content = await fs.readText(file.abs);
        entries.push({
            name: `${collected.name}/${file.rel}`,
            data: new TextEncoder().encode(content)
        });
    }
    const zipBytes = buildZip(entries);
    const outPath = outDir !== undefined && outDir.length > 0 ? join(outDir, `${collected.name}.skill`) : join(dirname(skillDir), `${collected.name}.skill`);
    await fs.mkdirp(dirname(outPath));
    await fs.writeBin(outPath, zipBytes);
    return {
        ok: true,
        skillName: collected.name,
        outPath,
        entries: entries.map((entry)=>entry.name),
        validation
    };
}
