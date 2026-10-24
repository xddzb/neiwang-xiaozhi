export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function isSkillName(name) {
    return SKILL_NAME_PATTERN.test(name);
}
export function slugifySkillName(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
}
export function suggestSkillName(goal, used = new Set()) {
    const firstLine = goal.split(/[\n。.；;，,]/)[0] ?? 'custom-skill';
    let base = slugifySkillName(firstLine);
    if (base.length === 0) base = 'custom-skill';
    if (base.length > 40) base = base.slice(0, 40).replace(/-+$/, '');
    if (base.length === 0) base = 'custom-skill';
    if (!used.has(base)) return base;
    let i = 2;
    while(used.has(`${base}-${i}`))i += 1;
    return `${base}-${i}`;
}
