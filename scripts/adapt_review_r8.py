from pathlib import Path
import sys,json,subprocess
ROOT=Path(__file__).resolve().parents[1]
file=Path(sys.argv[1]).resolve()
source=ROOT/'downloads/r8-review-source/lib/index.js'
text=source.read_text(encoding='utf8')
text=text.replace('    "settings",','    "settings",\n    "connection",')
text=text.replace('export async function apply(ctx, config = {}) {','''export async function apply(ctx, config = {}) {
    const webServer = ctx.webServer;
    const connection = ctx.connection;
    const protect = handler => async (req, res) => {
        const admission = connection.admit(req);
        if (admission.rejection) { res.writeHead(admission.rejection); res.end(); return; }
        res.setHeader('Cache-Control', 'no-store');
        return handler(req, res);
    };''')
old='''    const settingsScope = ctx.settings.register(SETTINGS_NAMESPACE, Config, {
        base,
        applies: "live",
    });'''
assert old in text
text=text.replace(old,'''    // DSH 0.2 uses entry-based settings. Keep this extension's appearance preferences
    // in its own data directory, preserving its existing configuration API.
    const preferencesFile = join(STORAGE_ROOT, 'appearance.json');
    let preferences = base;
    try { preferences = Config(JSON.parse(await readFile(preferencesFile, 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') console.warn('[code-review] appearance reset to defaults'); }
    const settingsScope = {
        get: () => preferences,
        replace: async value => {
            const validated = Config(value);
            await mkdir(STORAGE_ROOT, {recursive:true});
            await writeFile(preferencesFile + '.tmp', JSON.stringify(validated), {mode:0o600});
            await rename(preferencesFile + '.tmp', preferencesFile);
            preferences = validated;
        },
    };''')
text=text.replace('ctx.effect(() => ctx.webServer.register({','ctx.effect(() => webServer.register({')
text=text.replace('handler: routeHandler(runtime),','handler: protect(routeHandler(runtime)),').replace('handler: configRouteHandler(settingsScope),','handler: protect(configRouteHandler(settingsScope)),')
file.write_text(text,encoding='utf8')
package=file.parent.parent
client=(ROOT/'downloads/r8-review-source/lib/client.js').read_text(encoding='utf8')
client=client.replace('const inject = ["slots"];','const inject = ["slots", "uiConversation"];')
client=client.replace('"settings.plugin.item"','"settings.section"').replace('key: "code-review",','id: "code-review", label: "代码变更",')
client=client.replace('snapshot.chat.order.length','(snapshot.chat?.order?.length ?? snapshot.events?.length ?? 0)').replace('snapshot.turnEnds.size','(snapshot.turnEnds?.size ?? 0)')
icons={'IconCodeOutline16':'IconCodeOutlineRegular','IconRefreshOutline16':'IconRefreshOutlineRegular','IconChevronDownOutline14':'IconChevronDownOutlineRegular','IconChevronRightOutline14':'IconChevronRightOutlineRegular','IconWarningOutline16':'IconWarningOutlineRegular','IconFolderClose16':'IconFolderCloseRegular','IconFolderOpen16':'IconFolderOpenRegular','IconFolderOpenOutline16':'IconFolderOpenOutlineRegular','IconCloseOutline16':'IconCloseOutlineRegular'}
for old,new in icons.items():client=client.replace(old,new)
(package/'lib/client.js').write_text(client,encoding='utf8')
source_client=(ROOT/'downloads/r8-review-source/src/client.ts').read_text(encoding='utf8').replace('const inject = ["slots"];','const inject = ["slots", "uiConversation"];').replace('"settings.plugin.item"','"settings.section"').replace('key: "code-review",','id: "code-review", label: "代码变更",')
source_client=source_client.replace('snapshot.chat.order.length','(snapshot.chat?.order?.length ?? snapshot.events?.length ?? 0)').replace('snapshot.turnEnds.size','(snapshot.turnEnds?.size ?? 0)')
for old,new in icons.items():source_client=source_client.replace(old,new)
(package/'src/client.ts').write_text(source_client,encoding='utf8')
manifest=json.loads((package/'package.json').read_text(encoding='utf8'))
manifest['dsh']['client']['inject'].append('@deepseek-ai/dsh-client-ui-conversation') if '@deepseek-ai/dsh-client-ui-conversation' not in manifest['dsh']['client']['inject'] else None
(package/'package.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
entry=package/'src/client-entry.js'
entry.write_text((ROOT/'downloads/r8-review-source/src/client-entry.js').read_text(encoding='utf8'),encoding='utf8')
subprocess.run([str(ROOT/'scripts/build-tools/esbuild/esbuild.exe'),'./src/client-entry.js','--bundle','--format=iife','--platform=browser','--target=es2022','--minify','--legal-comments=none','--outfile=./lib/client.bundle.js'],cwd=package,check=True)
(file.parent.parent/'NEIWANG-ADAPTATIONS.json').write_text(json.dumps({'sourceCommit':(source.parents[1]/'SOURCE_COMMIT.txt').read_text().strip(),'changes':['Cordis scoped-service capture','Entry-based settings compatibility with extension-owned appearance file','Host authentication on review and preference HTTP endpoints'],'coreModified':False},indent=2),encoding='utf8')
print('Review compatibility adapter applied outside core')
