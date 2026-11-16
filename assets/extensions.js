import { escapeHTML as h, own } from './project.js';
import { safeTheme } from './editor.js';

function json(text) {
  try { return JSON.parse(text); }
  catch {
    // VS Code accepts comments and trailing commas in contribution files.
    const clean=text.replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, part=>part[0]==='"'?part:'');
    return JSON.parse(clean.replace(/"(?:\\.|[^"\\])*"|,(?=\s*[}\]])/g,part=>part[0]==='"'?part:''));
  }
}
function readManifest(manifest, snippets=[],themes=[]) {
  if(!manifest?.name) throw new Error('O manifesto precisa declarar um nome.');
  const id=(manifest.publisher?manifest.publisher+'.':'')+manifest.name;
  return {
    id,name:String(manifest.displayName||manifest.name),description:String(manifest.description||''),
    version:String(manifest.version||'1.0.0'),snippets,themes,enabled:true,
    runtime:!!(manifest.main||manifest.browser),
    insertions:readInsertions(manifest.kfecode?.commands),
    tasks:Array.isArray(manifest.kfecode?.tasks)?manifest.kfecode.tasks.filter(task=>typeof task.label==='string'&&typeof task.command==='string').slice(0,50):[],
    keybindings:(manifest.contributes?.keybindings||[]).map(item=>({key:String(item.key||''),command:String(item.command||'')})),
  };
}
function readInsertions(entries) {
  if(!Array.isArray(entries))return [];
  return entries.filter(entry=>entry?.action==='insertText'&&typeof entry.label==='string'&&entry.label.trim()&&
    typeof entry.text==='string'&&entry.text.length>0&&entry.text.length<=16000&&
    (entry.language===undefined||supportedLanguages.includes(entry.language))).slice(0,30)
    .map(({label,text,language})=>({label:label.trim().slice(0,100),text,language}));
}
function snippetRows(scope,data) {
  const result=[];
  for(const item of Object.values(data||{})) {
    if(!item||typeof item!=='object'||!item.prefix)continue;
    for(const prefix of Array.isArray(item.prefix)?item.prefix:[item.prefix]) {
      const body=Array.isArray(item.body)?item.body.join('\n'):item.body;
      if(typeof prefix!=='string'||typeof body!=='string')continue;
      result.push({scope:String(item.scope||scope||''),prefix,body,description:String(item.description||'')});
    }
  }
  return result;
}
export async function readExtension(file) {
  if(file.name.endsWith('.json')) {
    const data=json(await file.text());
    const snippets=Object.entries(data.kfecode?.snippets||{}).flatMap(([scope,items])=>snippetRows(scope,items));
    const themes=Object.entries(data.kfecode?.themes||{}).map(([name,value])=>({name,...safeTheme(value)}));
    return readManifest(data,snippets,themes);
  }
  const {default:Zip}=await import('./vendor/jszip.js');
  const archive=await Zip.loadAsync(await file.arrayBuffer());
  const manifestFile=archive.file('extension/package.json')||archive.file('package.json');
  if(!manifestFile)throw new Error('Pacote VSIX sem manifesto de extensão.');
  const manifest=json(await manifestFile.async('string'));
  const prefix=manifestFile.name.startsWith('extension/')?'extension/':'';
  const get=path=>archive.file(prefix+String(path).replace(/^\.\//,''));
  const snippets=[], themes=[];
  for(const item of manifest.contributes?.snippets || []) {
    const file=get(item.path);
    if(file)snippets.push(...snippetRows(item.language,json(await file.async('string'))));
  }
  for(const item of manifest.contributes?.themes||[]) {
    const file=get(item.path);
    if(!file)continue;
    const theme=json(await file.async('string'));
    themes.push({name:String(item.label||theme.name||item.id||manifest.name),...safeTheme(theme)});
  }
  return readManifest(manifest,snippets,themes);
}
const supportedLanguages=['javascript','html','css','json','markdown','plaintext'];
const snippetForLanguage=(item,id)=>!item.scope||item.scope.split(',').some(part=>part.trim()===id);
export function installSnippets(monaco,extensions) {
  const active=extensions.filter(item=>item.enabled).flatMap(item=>item.snippets);
  if(!active.length)return [];
  return supportedLanguages.map(id=>monaco.languages.registerCompletionItemProvider(id,{
    provideCompletionItems(model,position) {
      const word=model.getWordUntilPosition(position);
      return {suggestions:active.filter(item=>snippetForLanguage(item,id)).map(item=>({
        label:item.prefix,kind:monaco.languages.CompletionItemKind.Snippet,insertText:item.body,documentation:item.description,
        insertTextRules:monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,range:new monaco.Range(position.lineNumber,word.startColumn,position.lineNumber,word.endColumn),
      }))};
    }
  }));
}
const commands={
  'workbench.action.quickOpen':'file-palette','workbench.action.showCommands':'palette','workbench.action.findInFiles':'search-pane',
  'workbench.action.files.save':'save','workbench.action.files.saveAll':'save-all','editor.action.formatDocument':'format','editor.action.rename':'rename-symbol',
  'editor.action.revealDefinition':'definition','workbench.action.terminal.toggleTerminal':'terminal-pane','workbench.action.splitEditor':'split',
};
function compatibleKeys(extension) {
  const keymap={};
  for(const entry of extension.keybindings) {
    if(!own(commands,entry.command))continue;
    const parts=entry.key.toLowerCase().split('+').map(part=>part.trim());
    const base=parts.pop().toUpperCase();
    const lookup={ctrl:'Ctrl',cmd:'Ctrl',alt:'Alt',shift:'Shift'};
    if(parts.some(modifier=>!own(lookup,modifier)))continue;
    const modifiers=new Set(parts.map(modifier=>lookup[modifier]));
    const key=[...['Ctrl','Alt','Shift'].filter(modifier=>modifiers.has(modifier)),base].join('+');
    if(!/^(?:(?:Ctrl|Alt|Shift)\+)*(?:[A-Z0-9]|F(?:[1-9]|1[0-2]))$/.test(key))continue;
    keymap[key]=commands[entry.command];
  }
  return keymap;
}
export function importKeymap(extension,settings) {
  const keymap=compatibleKeys(extension);
  Object.assign(settings.keybindings,keymap);
  return Object.keys(keymap).length;
}
export function extensionFeatures(item,{shell=false}={}) {
  const features=[];
  if(item.themes.length)features.push('Temas');
  if(item.snippets.some(snippet=>supportedLanguages.some(id=>snippetForLanguage(snippet,id))))features.push('Snippets');
  if(Object.keys(compatibleKeys(item)).length)features.push('Atalhos');
  if(item.insertions?.length)features.push('Comandos KFEcode');
  if(shell&&item.tasks?.length)features.push('Tarefas');
  return features;
}
export function codespaceURL(input) {
  const repo=input.trim().replace(/^https:\/\/github\.com\//i,'').replace(/\/$/,'').replace(/\.git$/i,'');
  const match=repo.match(/^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100})$/);
  if(!match||['.','..'].includes(match[2]))throw new Error('Informe o link do repositório GitHub ou use usuario/repositorio.');
  return 'https://codespaces.new/'+match[1]+'/'+match[2]+'?quickstart=1';
}
export function extensionCard(item,button,features) {
  const value='data-value="'+h(item.id)+'"';
  const indexed=index=>value+' data-index="'+index+'"';
  const status=features.length?(item.enabled?features.join(' · '):'Desativada'):'Sem recursos compatíveis com este editor.';
  const actions=!features.length||!item.enabled?'':[
    features.includes('Atalhos')?button('Aplicar atalhos','extension-keymap','keyboard',value):'',
    ...item.themes.map((theme,index)=>button(theme.name,'extension-theme',null,indexed(index))),
    ...(item.insertions||[]).map((command,index)=>button(command.label,'extension-command','code',indexed(index))),
  ].join('');
  return '<article class="extension-card"><h3>'+h(item.name)+'</h3><p>'+h(item.description)+'</p><p>'+h(item.id)+' · '+h(item.version)+'</p>'+
  '<p>'+h(status)+'</p>'+(item.runtime?'<p>O código do pacote roda em um host VS Code, como o Codespaces.</p>':'')+
  '<div class="row">'+(features.length?button(item.enabled?'Desativar':'Ativar','extension-toggle',null,value):'')+
  button('Remover','extension-remove',null,value)+actions+'</div></article>';
}
