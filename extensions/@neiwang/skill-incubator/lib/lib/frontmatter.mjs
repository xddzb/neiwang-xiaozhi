export class YamlError extends Error {
    constructor(message){
        super(message);
        this.name = 'YamlError';
    }
}
const BOOL_TOKENS = new Set([
    'true',
    'false',
    'yes',
    'no',
    'on',
    'off'
]);
const NULL_TOKENS = new Set([
    'null',
    '~',
    ''
]);
export function splitFrontmatter(raw) {
    const firstLineEnd = raw.indexOf('\n');
    if (firstLineEnd < 0) return undefined;
    const firstLine = raw.slice(0, firstLineEnd).replace(/\r$/, '');
    if (firstLine !== '---') return undefined;
    let lineStart = firstLineEnd + 1;
    let yamlEnd = -1;
    while(lineStart <= raw.length){
        const next = raw.indexOf('\n', lineStart);
        const lineEnd = next < 0 ? raw.length : next;
        const line = raw.slice(lineStart, lineEnd).replace(/\r$/, '');
        if (line === '---') {
            yamlEnd = lineStart;
            break;
        }
        if (next < 0) return undefined;
        lineStart = next + 1;
    }
    if (yamlEnd < 0) return undefined;
    const closingEnd = raw.indexOf('\n', yamlEnd);
    const bodyStart = closingEnd < 0 ? raw.length : closingEnd + 1;
    return {
        yaml: raw.slice(firstLineEnd + 1, yamlEnd),
        body: raw.slice(bodyStart)
    };
}
export function parseFrontmatter(raw) {
    const split = splitFrontmatter(raw);
    if (split === undefined) return undefined;
    return {
        data: parseSimpleYaml(split.yaml),
        body: split.body
    };
}
export function findColon(line) {
    let quote;
    for(let i = 0; i < line.length; i += 1){
        const ch = line[i];
        if (quote !== undefined) {
            if (ch === quote) quote = undefined;
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
            continue;
        }
        if (ch === ':') return i;
    }
    return -1;
}
function indentOf(line) {
    return line.length - line.trimStart().length;
}
function isCommentLine(line) {
    const trimmed = line.trim();
    return trimmed === '' || trimmed.startsWith('#');
}
function parseBlockMap(state, indent) {
    const map = {};
    const { lines } = state;
    while(state.index < lines.length){
        const line = lines[state.index];
        if (isCommentLine(line)) {
            state.index += 1;
            continue;
        }
        const ind = indentOf(line);
        if (ind < indent) break;
        if (ind > indent) {
            state.index += 1;
            continue;
        }
        const colon = findColon(line);
        if (colon < 0) throw new YamlError(`expected "key: value" at line ${state.index + 1}: ${line}`);
        const key = unquoteScalar(line.slice(ind, colon).trim());
        if (key.length === 0) throw new YamlError(`empty mapping key at line ${state.index + 1}`);
        const rest = line.slice(colon + 1).trim();
        if (rest === '' || rest === '|' || rest === '>' || rest === '|-' || rest === '>-' || rest === '|+' || rest === '>+') {
            const next = lines[state.index + 1];
            const nextIndent = next === undefined ? indent : indentOf(next);
            if (next === undefined || nextIndent <= indent || isCommentLine(lines[state.index + 1] ?? '')) {
                map[key] = null;
                state.index += 1;
                continue;
            }
            if (rest.startsWith('|') || rest.startsWith('>')) {
                map[key] = parseLiteralBlock(state, indent);
                continue;
            }
            map[key] = parseBlockMap(state, nextIndent);
            continue;
        }
        map[key] = parseScalar(rest);
        state.index += 1;
    }
    return map;
}
function parseLiteralBlock(state, parentIndent) {
    const { lines } = state;
    const chunks = [];
    state.index += 1;
    while(state.index < lines.length){
        const line = lines[state.index];
        if (isCommentLine(line)) {
            state.index += 1;
            continue;
        }
        const ind = indentOf(line);
        if (ind <= parentIndent) break;
        chunks.push(line.slice(parentIndent));
        state.index += 1;
    }
    let text = chunks.join('\n');
    text = text.replace(/\n+$/, '');
    return text;
}
function parseFlowList(text) {
    const items = [];
    let current = '';
    let quote;
    for(let i = 0; i < text.length; i += 1){
        const ch = text[i];
        if (quote !== undefined) {
            if (ch === quote) quote = undefined;
            current += ch;
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
            current += ch;
            continue;
        }
        if (ch === ',') {
            items.push(parseScalar(current.trim()));
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim().length > 0 || items.length > 0) items.push(parseScalar(current.trim()));
    return items;
}
function stripInlineComment(text) {
    let quote;
    for(let i = 0; i < text.length; i += 1){
        const ch = text[i];
        if (quote !== undefined) {
            if (ch === quote) quote = undefined;
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
            continue;
        }
        if (ch === ' ' && text[i + 1] === '#') return text.slice(0, i);
    }
    return text;
}
export function unquoteScalar(value) {
    const v = value.trim();
    if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
    if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
        return v.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    return v;
}
export function parseScalar(value) {
    const v = value.trim();
    if (v.startsWith('[') && v.endsWith(']')) {
        const inner = v.slice(1, -1);
        return parseFlowList(inner);
    }
    if (v.startsWith("'") || v.startsWith('"')) return unquoteScalar(v);
    const plain = stripInlineComment(v).trim();
    if (NULL_TOKENS.has(plain.toLowerCase())) return null;
    if (BOOL_TOKENS.has(plain.toLowerCase())) {
        return plain === 'true' || plain === 'yes' || plain === 'on';
    }
    if (/^-?(?:\d+)(?:\.\d+)?$/.test(plain)) return Number(plain);
    return plain;
}
export function parseSimpleYaml(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    const state = {
        lines,
        index: 0
    };
    const value = parseBlockMap(state, 0);
    return value;
}
export function quoteYamlScalar(value) {
    if (value.length === 0) return "''";
    const plainSafe = /^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/.test(value) && !BOOL_TOKENS.has(value.toLowerCase()) && !NULL_TOKENS.has(value.toLowerCase()) && !/^\d/.test(value);
    if (plainSafe) return value;
    return `'${value.replace(/'/g, "''")}'`;
}
export function yamlScalar(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
    if (Array.isArray(value)) return `[${value.map((item)=>yamlScalar(item)).join(', ')}]`;
    if (typeof value === 'object') {
        return Object.entries(value).map(([key, item])=>`${key}: ${yamlScalar(item)}`).join(' ');
    }
    return quoteYamlScalar(String(value));
}
export function formatFrontmatter(data) {
    const body = Object.entries(data).map(([key, value])=>`${key}: ${yamlScalar(value)}`).join('\n');
    return `---\n${body}\n---\n`;
}
export function replaceFrontmatterLine(raw, key, value) {
    const lines = raw.split('\n');
    let inFrontmatter = false;
    let found = false;
    for(let i = 0; i < lines.length; i += 1){
        const line = lines[i];
        const trimmed = line.trim();
        if (!inFrontmatter) {
            if (i === 0 && trimmed === '---') {
                inFrontmatter = true;
            }
            continue;
        }
        if (trimmed === '---') break;
        if (trimmed === '' || trimmed.startsWith('#')) continue;
        const ind = indentOf(line);
        if (ind > 0) continue;
        const colon = findColon(line);
        if (colon < 0) continue;
        const currentKey = unquoteScalar(line.slice(ind, colon).trim());
        if (currentKey !== key) continue;
        const rest = line.slice(colon + 1).trim();
        const isBlockHeader = rest === '|' || rest === '>' || rest === '|-' || rest === '>-' || rest === '|+' || rest === '>+';
        if (isBlockHeader) {
            let j = i + 1;
            while(j < lines.length){
                const candidate = lines[j];
                if (isCommentLine(candidate) && indentOf(candidate) <= ind) break;
                if (indentOf(candidate) <= ind) break;
                if (candidate.trim() === '---') break;
                j += 1;
            }
            lines.splice(i, j - i, `${' '.repeat(ind)}${key}: ${quoteYamlScalar(value)}`);
        } else {
            lines[i] = `${' '.repeat(ind)}${key}: ${quoteYamlScalar(value)}`;
        }
        found = true;
        break;
    }
    if (!found) return undefined;
    return lines.join('\n');
}
