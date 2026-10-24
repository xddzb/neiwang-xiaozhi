export function textBlock(text) {
    return {
        type: 'text',
        text
    };
}
export function optString(args, key) {
    const value = args[key];
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
export function optBool(args, key, fallback = false) {
    const value = args[key];
    return typeof value === 'boolean' ? value : fallback;
}
export function errorResult(message) {
    return {
        status: 'error',
        message
    };
}
