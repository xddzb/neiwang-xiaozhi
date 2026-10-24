import { mkdir, readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
function abortIf(signal) {
    if (signal?.aborted) throw new Error('operation aborted');
}
export function isFileSystemLike(value) {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value;
    return typeof candidate.resolve === 'function' && typeof candidate.stat === 'function' && typeof candidate.readText === 'function' && typeof candidate.writeText === 'function';
}
export function nodeHostFs() {
    return {
        async stat (path) {
            try {
                const info = await stat(path);
                const type = info.isDirectory() ? 'dir' : info.isFile() ? 'file' : 'other';
                return {
                    type,
                    size: info.size
                };
            } catch (error) {
                if (isAbsent(error)) return undefined;
                throw error;
            }
        },
        async readText (path) {
            return await readFile(path, {
                encoding: 'utf8'
            });
        },
        async writeText (path, content) {
            await mkdir(dirname(path), {
                recursive: true
            });
            await writeFile(path, content, {
                encoding: 'utf8'
            });
        },
        async writeBin (path, data) {
            await mkdir(dirname(path), {
                recursive: true
            });
            await writeFile(path, data);
        },
        async listDir (path) {
            const entries = await readdir(path, {
                encoding: 'utf8'
            });
            return Array.from(entries);
        },
        async mkdirp (path) {
            await mkdir(path, {
                recursive: true
            });
        },
        async remove (path) {
            await rm(path, {
                recursive: true,
                force: true
            });
        }
    };
}
function isAbsent(error) {
    return typeof error === 'object' && error !== null && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}
export function serviceHostFs(fs, signal) {
    return {
        async stat (path) {
            abortIf(signal);
            const target = await fs.resolve(path, {
                signal
            });
            const info = await fs.stat(target, signal);
            if (info === undefined) return undefined;
            const type = info.type === 'file' ? 'file' : info.type === 'directory' ? 'dir' : 'other';
            return {
                type,
                size: info.size ?? 0
            };
        },
        async readText (path) {
            abortIf(signal);
            const target = await fs.resolve(path, {
                signal
            });
            return await fs.readText(target, signal);
        },
        async writeText (path, content) {
            abortIf(signal);
            const target = await fs.resolve(path, {
                signal
            });
            const existing = await fs.stat(target, signal);
            if (existing !== undefined) {
                await fs.readText(target, signal);
            }
            await fs.writeText(target, content, undefined, signal);
        },
        async writeBin (path, data) {
            abortIf(signal);
            await mkdir(dirname(path), {
                recursive: true
            });
            await writeFile(path, data);
        },
        async listDir (path) {
            abortIf(signal);
            const target = await fs.resolve(path, {
                signal
            });
            const entries = await fs.listDir(target, signal);
            return entries.map((entry)=>entry.name);
        },
        async mkdirp (path) {
            await mkdir(path, {
                recursive: true
            });
        },
        async remove (path) {
            await rm(path, {
                recursive: true,
                force: true
            });
        }
    };
}
export function makeHostFs(ctx, signal) { if(signal?.aborted)throw Error('cancelled'); const local=ctx?.get?.('neiwang-scoped-fs'); if(!local)throw Error('scoped skill filesystem required'); return local; }
