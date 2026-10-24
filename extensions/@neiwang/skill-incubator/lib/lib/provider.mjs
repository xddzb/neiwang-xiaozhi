import { dirname, join } from 'node:path';
import { parseSimpleYaml, splitFrontmatter } from './frontmatter.mjs';
import { isSkillName } from './skill-name.mjs';
export class OutputDirSkillSource {
    fs;
    roots;
    constructor(fs, roots){
        this.fs = fs;
        this.roots = roots;
    }
    async list() {
        const listings = [];
        for (const root of this.roots){
            let entries;
            try {
                entries = await this.fs.listDir(root);
            } catch  {
                continue;
            }
            for (const entry of entries){
                const dir = join(root, entry);
                let info;
                try {
                    info = await this.fs.stat(dir);
                } catch  {
                    continue;
                }
                if (info === undefined || info.type !== 'dir') continue;
                const path = join(dir, 'SKILL.md');
                try {
                    info = await this.fs.stat(path);
                } catch  {
                    continue;
                }
                if (info === undefined || info.type !== 'file') continue;
                let raw;
                try {
                    raw = await this.fs.readText(path);
                } catch  {
                    continue;
                }
                const parsed = parseSkillListing(raw);
                if (parsed === undefined) continue;
                listings.push({
                    ...parsed,
                    path,
                    dir,
                    provider: 'skill-creator',
                    source: 'custom',
                    rank: 300
                });
            }
        }
        return listings;
    }
    async get(name) {
        const listing = (await this.list()).find((candidate)=>candidate.name === name);
        if (listing === undefined) return undefined;
        let raw;
        try {
            raw = await this.fs.readText(listing.path);
        } catch  {
            return undefined;
        }
        const split = splitFrontmatter(raw);
        if (split === undefined) return undefined;
        return {
            name: listing.name,
            description: listing.description,
            content: split.body,
            path: listing.path,
            provider: listing.provider,
            source: listing.source,
            resourceBase: {
                kind: 'directory',
                path: dirname(listing.path)
            }
        };
    }
}
function parseSkillListing(raw) {
    const split = splitFrontmatter(raw);
    if (split === undefined) return undefined;
    let data;
    try {
        data = parseSimpleYaml(split.yaml);
    } catch  {
        return undefined;
    }
    const name = typeof data.name === 'string' && data.name.length > 0 ? data.name : undefined;
    const description = typeof data.description === 'string' && data.description.length > 0 ? data.description : undefined;
    if (name === undefined || description === undefined || !isSkillName(name)) return undefined;
    return {
        name,
        description
    };
}
export function isSkillRegistryLike(value) {
    if (typeof value !== 'object' || value === null) return false;
    return typeof value.registerProvider === 'function';
}
export function mountRuntimeProvider(ctx, fs, roots) {
    const registry = ctx.get('skills');
    if (!isSkillRegistryLike(registry)) {
        return {
            mounted: false,
            reason: 'skills registry unavailable (is @deepseek-ai/dsh-skill installed?) — 请改用 skill-filesystem 的 customSkillDirs 手工挂载'
        };
    }
    const source = new OutputDirSkillSource(fs, roots);
    registry.registerProvider((_control)=>({
            name: 'skill-creator',
            async list () {
                return await source.list();
            },
            async get (candidate) {
                const name = typeof candidate?.name === 'string' ? candidate.name : undefined;
                if (name === undefined) return undefined;
                return await source.get(name);
            }
        }));
    return {
        mounted: true
    };
}
