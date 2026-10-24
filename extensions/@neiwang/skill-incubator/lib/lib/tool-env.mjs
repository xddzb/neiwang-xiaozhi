import { homedir } from 'node:os';
import { join } from 'node:path';
const CONFIG_KEY = 'skill-creator/config';
export function readCreatorConfig(ctx) {
    const value = ctx.get(CONFIG_KEY);
    if (typeof value === 'object' && value !== null) return value;
    return {};
}
export function defaultSkillsRoot() {
    const dshHome = typeof process !== 'undefined' && process.env.DSH_HOME !== undefined && process.env.DSH_HOME.length > 0 ? process.env.DSH_HOME : join(homedir(), '.dsh');
    return join(dshHome, 'skills');
}
export function resolveOutputRoot(ctx, explicit) {
    if (explicit !== undefined && explicit.trim().length > 0) return explicit.trim();
    const config = readCreatorConfig(ctx);
    if (config.outputDir !== undefined && config.outputDir.trim().length > 0) return config.outputDir.trim();
    if (config.customSkillDirs !== undefined && config.customSkillDirs.length > 0 && config.customSkillDirs[0].trim().length > 0) {
        return config.customSkillDirs[0].trim();
    }
    return defaultSkillsRoot();
}
export function mountHintYaml(skillDir, outputRoot) {
    return [
        '# 为 skill-filesystem 增加自定义技能根（profiles/<name>/cordis.patch.yml 或 home 覆盖层）：',
        '- id: skill-filesystem',
        "  name: '@deepseek-ai/dsh-skill-filesystem'",
        '  config:',
        '    customSkillDirs:',
        `      - ${outputRoot}`,
        `# 生效后 ${skillDir}/SKILL.md 即可被 skill 工具列出并加载。`
    ].join('\n');
}
export function extractSessionTail(session) {
    if (typeof session !== 'object' || session === null) return undefined;
    const candidate = session;
    const messages = Array.isArray(candidate.messages) ? candidate.messages : Array.isArray(candidate.history) ? candidate.history : Array.isArray(candidate.turns) ? candidate.turns : undefined;
    if (messages === undefined || messages.length === 0) return undefined;
    const tail = [];
    for (const message of messages.slice(-6)){
        const entry = message;
        const content = typeof entry.content === 'string' ? entry.content : typeof entry.text === 'string' ? entry.text : undefined;
        if (content !== undefined) tail.push(content);
    }
    const text = tail.join('\n').trim();
    return text.length > 0 ? text.slice(-3000) : undefined;
}
