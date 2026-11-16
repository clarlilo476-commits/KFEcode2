import { icon } from './icons.js';
import { own, base, parent, join, ext, language, languages, escapeHTML as h, validName, validPath, makeProject, normalize, initialState, load, persist, blobFor, readFile, download, zipProject, entryPoint } from './project.js';
import { themes, loadMonaco, applyTheme, options, outline, audit, formatSource, fileLabel } from './editor.js';
import { buildPreview } from './preview.js';
import { createTools } from './tools.js';
import { shortcutGroups, editorCommands, commandFor, keysFor, defaultKeyFor, isMac, keyParts } from './shortcuts.js';

const $=selector=>document.querySelector(selector);
const sidebar=$('#sidebar'), dialog=$('#dialog'), popover=$('#popover');
const narrow=()=>matchMedia('(max-width:820px)').matches;
let state, monaco, primary, secondary, activeEditor, tools;
let pane='files', bottom='console', bottomHidden=false, sidebarHidden=matchMedia('(max-width:555px)').matches, previewVisible=true, mobilePreview=false, phone=false, outlineOpen=true;
let split='', secondFile='', diffView=null, saveTimer, previewTimer, previewKey, previewHTML='', lastPreview='', activePage='', cursor={lineNumber:1,column:1}, vimInstances=[];
let focusRestore=null, macShortcuts=isMac;
let searchState={query:'',replace:'',regex:false,case:false};
let logs=[], issues=[], mutations=0, storageFailed=false, outlineTimer, modelListeners=[];
const models=new Map(), editorStates=new Map();
const workspace=()=>state.workspaces.find(item=>item.id===state.workspace)||state.workspaces[0];
const project=()=>workspace().projects.find(item=>item.id===workspace().project)||workspace().projects[0];
const current=()=>activeEditor===secondary && split && secondFile ? secondFile : project().active;
const source=path=>project().files[path];
const dirty=path=>JSON.stringify(source(path))!==JSON.stringify(project().saved[path]);
const button=(label,action,glyph,extra='')=>'<button type="button" class="small-button" data-action="'+action+'" '+extra+'>'+ (glyph?icon(glyph,14):'')+h(label)+'</button>';
const actionIcon=(action,glyph,label,extra='')=>'<button type="button" data-action="'+action+'" '+extra+' title="'+h(label)+'" aria-label="'+h(label)+'">'+icon(glyph,16)+'</button>';
const fileIcon=path=>icon(fileLabel(path,state.settings),15);
const toast=(message,error=false)=>{
  const node=document.createElement('div');node.className='toast'+(error?' error':'');node.textContent=message;
  $('#toasts').append(node);setTimeout(()=>node.remove(),4300);
};
function queueSave() {
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>saveState().catch(reportStorage),160);
}
function saveState(){return persist(state);}
function reportStorage(error){if(!storageFailed) toast('Não foi possível armazenar o workspace neste navegador. Exporte seu projeto para preservar os arquivos.',true); storageFailed=true; console.warn(error);}
function addLog(message,level='info') {
  logs.push({message,level,time:new Date().toLocaleTimeString('pt-BR',{hour12:false})});
  logs=logs.slice(-500);
  if(bottom==='console') renderBottom();
}
function head(title,actions='') {
  return '<div class="pane-header"><strong>'+h(title)+'</strong><div>'+actions+'</div></div>';
}
function render() {
  renderLayout(); renderSidebar(); renderTabs(); renderBreadcrumb(); renderBottom(); renderStatus();
  $('#workspace-button').innerHTML=icon('folder',15)+'<span>'+h(workspace().name)+'</span>'+icon('down',12);
  renderShortcutHints();
}
function renderLayout() {
  const container=$('.workspace');
  container.classList.toggle('sidebar-hidden',sidebarHidden);
  container.classList.toggle('preview-hidden',!previewVisible);
  container.classList.toggle('mobile-preview',mobilePreview);
  $('#editor-area').classList.toggle('bottom-hidden',bottomHidden);
  $('.window-zoom').setAttribute('aria-pressed',String(Boolean(focusRestore)));
  $('#editors').classList.toggle('vertical',split==='vertical');
  $('#editor-secondary').hidden=!split;
  for(const button of document.querySelectorAll('[data-pane]')) {
    button.classList.toggle('active',button.dataset.pane===pane&&!sidebarHidden);
    button.setAttribute('aria-pressed',String(button.dataset.pane===pane&&!sidebarHidden));
  }
  $('#viewport').classList.toggle('mobile',phone);
  $('#preview-mode').textContent=phone?'Celular':'Desktop';
}
function fileTree() {
  const p=project();
  const groupByParent=paths=>{
    const groups=new Map();
    for(const path of paths.sort((a,b)=>a.localeCompare(b))) {
      const directory=parent(path);
      if(!groups.has(directory))groups.set(directory,[]);
      groups.get(directory).push(path);
    }
    return groups;
  };
  const files=groupByParent(Object.keys(p.files));
  const dirs=groupByParent([...p.folders]);
  return treeRows('',0,files,dirs);
}
function treeRows(root,depth,files,dirs) {
  const p=project();
  const padding=' style="padding-left:'+((root?depth+1:depth)*15+18)+'px"';
  const rows=[];
  for(const dir of dirs.get(root)||[]) {
    const expanded=!p.collapsed.includes(dir);
    rows.push('<div class="tree-group"><button class="tree-row" draggable="true" data-drop="'+h(dir)+'" data-action="tree-folder" data-value="'+h(dir)+'" aria-expanded="'+expanded+'"'+padding+'>'+icon(expanded?'down':'chevron',13)+icon(expanded?'folderopen':'folder',15)+'<span class="name">'+h(base(dir))+'</span><span class="tree-menu" title="Opções da pasta" data-action="file-menu" data-value="'+h(dir)+'">'+icon('more',14)+'</span></button>'+(expanded?treeRows(dir,depth+1,files,dirs):'')+'</div>');
  }
  for(const file of files.get(root)||[]) rows.push('<button class="tree-row '+(p.active===file?'active':'')+'" draggable="true" data-action="file" data-value="'+h(file)+'" title="'+h(file)+'"'+padding+'><span style="width:13px"></span>'+fileIcon(file)+'<span class="name">'+h(base(file))+'</span><span class="tree-menu" title="Opções do arquivo" data-action="file-menu" data-value="'+h(file)+'">'+icon('more',14)+'</span></button>');
  return rows.join('');
}
function renderOutline() {
  const element=$('#outline');
  if(!element) return;
  const path=project().active;
  const symbols=outline(source(path),path);
  element.innerHTML='<button class="outline-header" data-action="outline">'+icon(outlineOpen?'down':'chevron',13)+'ESTRUTURA</button>'+
    (outlineOpen?'<div class="outline-list">'+(symbols.map(({name,line})=>'<button class="outline-item" data-action="location" data-value="'+h(path)+'" data-line="'+line+'">'+icon('code',14)+'<span>'+h(name)+'</span></button>').join('') || '<p class="muted">Sem símbolos neste arquivo.</p>')+'</div>':'');
}
function renderSidebar() {
  if(!tools) return;
  const p=project();
  if(pane==='files') {
    const group=workspace();
    const projects=group.projects.length>1
      ? '<section class="project-switcher" aria-label="Projetos"><div class="project-label">Projetos</div>'+group.projects.map(item=>
          '<button type="button" data-action="switch-project" data-value="'+h(item.id)+'" data-workspace="'+h(group.id)+'" class="'+(item.id===p.id?'active':'')+'" aria-current="'+(item.id===p.id)+'">'+icon('folder',14)+'<span>'+h(item.name)+'</span></button>').join('')+'</section>'
      : '';
    const rootOpen=!p.collapsed.includes('');
    sidebar.innerHTML=head('Explorador',actionIcon('add-menu','plus','Adicionar','class="add-button"')+actionIcon('project-menu','more','Opções do projeto'))+
      projects+'<div class="tree"><button class="tree-row root" data-drop="" data-action="tree-folder" data-value="" aria-expanded="'+rootOpen+'">'+icon(rootOpen?'down':'chevron',13)+icon(rootOpen?'folderopen':'folder',15)+'<span class="name">'+h(p.name)+'</span></button>'+
      (rootOpen?fileTree():'')+'</div><section class="outline" id="outline"></section><div class="sidebar-footer">'+icon('grid',14)+'<span>'+workspace().projects.length+' '+(workspace().projects.length===1?'projeto':'projetos')+' · '+Object.keys(p.files).length+' arquivos</span></div>';
    renderOutline(); return;
  }
  if(pane==='search') {
    sidebar.innerHTML=head('Busca global')+'<div class="pane-body"><form id="search-form"><input name="query" type="search" aria-label="Buscar no projeto" placeholder="Buscar em todos os arquivos" value="'+h(searchState.query)+'"><input name="replacement" aria-label="Substituir por" placeholder="Substituir por…" value="'+h(searchState.replace)+'"><div class="row"><label class="setting-check"><input name="regex" type="checkbox" '+(searchState.regex?'checked':'')+'> Regex</label><label class="setting-check"><input name="case" type="checkbox" '+(searchState.case?'checked':'')+'> Aa</label></div><div class="row"><button class="accent-button" type="submit">Buscar</button>'+button('Substituir tudo','replace')+'</div></form><div id="search-results"></div></div>';
    renderSearch(); return;
  }
  if(pane==='settings') { renderSettings(); return; }
  sidebar.innerHTML=tools.pane(pane);
}
function renderSettings() {
  const settings=state.settings;
  const check=(key,label)=>'<label class="setting-check"><input type="checkbox" data-setting="'+key+'" '+(settings[key]?'checked':'')+'>'+label+'</label>';
  sidebar.innerHTML=head('Configurações')+'<div class="pane-body"><div class="settings-title">'+icon('settings',14)+' Aparência</div><div class="theme-grid">'+Object.entries(themes).map(([id,theme])=>'<button class="theme-button '+(settings.theme===id&&!settings.extensionTheme?'active':'')+'" data-action="theme" data-value="'+id+'"><span class="theme-sample" style="--theme-a:'+theme.palette[0]+';--theme-b:'+theme.palette[1]+'"></span>'+h(theme.name)+'</button>').join('')+'</div><label class="setting-row">Fonte<input data-setting="family" value="'+h(settings.family)+'" aria-label="Fonte do código"></label><label class="setting-row">Tamanho<input type="number" data-setting="font" min="9" max="32" value="'+settings.font+'"></label>'+
    check('ligatures','Ligaduras')+check('fileIcons','Ícones de arquivos')+
    '<hr><div class="settings-title">'+icon('code',14)+' Editor</div>'+check('minimap','Minimapa')+check('wrap','Quebra de linha')+check('formatOnSave','Formatar ao salvar')+check('autoPreview','Atualizar prévia automaticamente')+
    '<label class="setting-row">Espaços por tabulação<input data-setting="tabSize" type="number" min="1" max="8" value="'+settings.tabSize+'"></label><label class="setting-row">Atalhos<select data-setting="keymap">'+[['default','KFEcode'],['vim','Vim'],['sublime','Sublime Text']].map(([value,label])=>'<option '+(settings.keymap===value?'selected ':'')+'value="'+value+'">'+label+'</option>').join('')+'</select></label>'+
    button('Códigos e atalhos','shortcuts','keyboard')+button('Personalizar atalhos','keybindings','settings')+'<hr><div class="settings-title">'+icon('terminal',14)+' Serviço local</div>'+tools.localSettings()+'</div>';
}
function renderTabs() {
  const p=project();
  $('#tabs').innerHTML=p.open.map(path=>'<div class="tab '+(p.active===path?'active':'')+'" role="presentation"><button class="tab-open" role="tab" aria-selected="'+(p.active===path)+'" data-action="file" data-value="'+h(path)+'" title="'+h(path)+'">'+fileIcon(path)+'<span>'+h(base(path))+'</span></button><button class="tab-close '+(dirty(path)?'dirty':'')+'" data-action="close-tab" data-value="'+h(path)+'" title="Fechar '+h(base(path))+'" aria-label="Fechar '+h(base(path))+'">'+icon('x',13)+'</button></div>').join('')+
    actionIcon('add-menu','plus','Nova aba','class="top-icon tab-add"');
}
function renderBreadcrumb() {
  const p=project(), path=p.active;
  $('#breadcrumb').innerHTML='<span>'+h(p.name)+'</span>'+(path?icon('chevron',11)+path.split('/').map((part,index,list)=>index===list.length-1?fileIcon(path)+'<strong>'+h(part)+'</strong>':'<span>'+h(part)+'</span>').join(icon('chevron',11)):'')+
    (split&&secondFile?'<span class="split-crumb"> · '+h(base(secondFile))+'</span>':'');
}
const bottomItems=[['console','Console','terminal'],['problems','Problemas','alert'],['terminal','Terminal','code'],['debugger','Depuração','bug'],['tests','Testes','flask']];
function renderBottom() {
  if(!tools) return;
  const tabsMarkup=bottomItems.map(([id,label,glyph])=>'<button class="bottom-tab '+(bottom===id?'active':'')+'" data-action="bottom" data-value="'+id+'">'+icon(glyph,14)+label+(id==='problems'&&issues.length?'<span class="counter">'+issues.length+'</span>':'')+'</button>').join('');
  if($('#bottom-tabs').innerHTML!==tabsMarkup) $('#bottom-tabs').innerHTML=tabsMarkup;
  const terminalActions=bottom==='terminal'&&tools.hasShell()
    ? actionIcon('task-list','bolt','Executar tarefa')+actionIcon('deps','extensions','Gerenciar dependências')+actionIcon('terminal-restart','refresh','Reiniciar shell') : '';
  $('#bottom-tools').innerHTML=(bottom==='console'?actionIcon('clear-console','trash','Limpar console'):terminalActions)+actionIcon('bottom-toggle',bottomHidden?'chevron':'down',bottomHidden?'Expandir painel':'Recolher painel');
  const el=$('#bottom-content');
  if(bottom==='console') el.innerHTML=logs.map(({time,level,message})=>'<div class="log-row '+level+'"><time>'+h(time)+'</time>'+icon(({ok:'check',error:'alert',warn:'warning',debug:'bug'})[level]||'terminal',13)+'<span>'+h(message)+'</span></div>').join('') || '<p class="muted">A saída da prévia aparece aqui.</p>';
  else if(bottom==='problems') el.innerHTML=issues.map(issue=>'<button class="list-button" data-action="location" data-value="'+h(issue.path)+'" data-line="'+issue.line+'">'+icon(issue.severity==='error'?'alert':'warning',13)+'<span><strong>'+h(issue.path)+':'+issue.line+'</strong> '+h(issue.message)+'<small>'+h(issue.source)+'</small></span></button>').join('')||'<div class="log-row ok">'+icon('check',13)+'<span>Nenhum problema encontrado.</span></div>';
  else { tools.renderBottom(bottom,el); return; }
  if(bottom==='console') el.scrollTop=el.scrollHeight;
}
function renderStatus() {
  const path=current(), p=project(), kind=language(path);
  const errors=issues.filter(issue=>issue.severity==='error').length;
  const changed=Object.keys(p.files).filter(dirty).length;
  $('#statusbar').innerHTML='<div class="status-group"><button data-pane="git" title="Controle de versão">'+icon('branch',13)+h(tools?.branch() || 'Local')+'</button><button data-action="bottom" data-value="problems" title="Problemas">'+icon('alert',13)+errors+' '+icon('warning',13)+(issues.length-errors)+'</button><span class="status-saved '+(changed?'dirty':'')+'"><i></i> '+(changed?'Alterações no rascunho':'Salvo no workspace')+'</span></div>'+
    '<div class="status-group"><span id="status-cursor">Ln '+cursor.lineNumber+', Col '+cursor.column+'</span><span class="status-encoding">'+(typeof source(path)==='object'?'Binário':'UTF-8')+'</span><button data-action="language-menu" class="status-lang">'+icon(kind.icon,13)+h(path?kind.label:'Sem arquivo')+'</button><button data-pane="settings" aria-label="Configurações">'+icon('settings',13)+'</button></div>';
}
function updateCursor() {
  cursor=activeEditor?.getPosition()||{lineNumber:1,column:1};
  if($('#status-cursor')) $('#status-cursor').textContent='Ln '+cursor.lineNumber+', Col '+cursor.column;
}
function model(path) {
  if (!monaco||typeof source(path)!=='string') return null;
  if(models.has(path)) return models.get(path);
  const p=project();
  const uri=monaco.Uri.from({scheme:'file',path:'/workspace/'+p.id+'/'+path});
  const m=monaco.editor.createModel(source(path),language(path).id,uri);
  m.updateOptions({tabSize:Number(state.settings.tabSize),insertSpaces:true});
  models.set(path,m);
  modelListeners.push(m.onDidChangeContent(()=>{
    if(project().id!==p.id||!own(p.files,path)) return;
    p.files[path]=m.getValue(undefined,true); mutations++;
    queueSave();renderTabs();renderStatus();
    clearTimeout(outlineTimer);outlineTimer=setTimeout(()=>{renderOutline();refreshIssues();},220);
    if(state.settings.autoPreview&&previewVisible) schedulePreview();
  }));
  return m;
}
function setupModels() {
  if(!monaco)return;
  for(const [path,content] of Object.entries(project().files)) if(typeof content==='string') model(path);
}
function disposeModels() {
  if(!monaco)return;
  primary?.setModel(null);secondary?.setModel(null);
  for(const disposable of modelListeners) disposable.dispose();
  for(const m of models.values()) m.dispose();
  models.clear();editorStates.clear();modelListeners=[];
}
function place(editor,path) {
  if(!editor) return;
  const old=editor.getModel();
  if(old) editorStates.set((editor===primary?'a:':'b:')+old.uri.toString(),editor.saveViewState());
  const next=model(path);
  if(next!==old) {
    editor.setModel(next);
    const saved=next&&editorStates.get((editor===primary?'a:':'b:')+next.uri.toString());
    if(saved) editor.restoreViewState(saved);
  }
  const node=editor===primary?$('#editor-primary'):$('#editor-secondary');
  node.querySelector('.editor-empty')?.remove();
  if(!next) {
    const empty=document.createElement('div');
    empty.className='editor-empty';
    empty.innerHTML=typeof source(path)==='object' ? icon('doc',30)+'<span>Arquivo binário</span>'+button('Baixar arquivo','download','download') : icon('code',32)+'<span>Abra ou crie um arquivo para editar.</span>'+button('Criar arquivo','add-menu','plus');
    node.append(empty);
  }
}
function activateFile(path,{line=0,focus=true,secondaryPane=false}={}) {
  const p=project();
  if(!own(p.files,path))return;
  if(!p.open.includes(path)) p.open.push(path);
  if(secondaryPane&&split){secondFile=path;place(secondary,path);activeEditor=secondary;}
  else {p.active=path;place(primary,path);activeEditor=primary;}
  p.selected=parent(path);
  if(line&&activeEditor?.getModel()){activeEditor.setPosition({lineNumber:Number(line),column:1});activeEditor.revealLineInCenter(Number(line));}
  if(focus)activeEditor?.focus();
  if(focus&&matchMedia('(max-width:555px)').matches){sidebarHidden=true;renderLayout();}
  if(previewVisible&&state.settings.autoPreview&&entryPoint(p)!==lastPreview) schedulePreview();
  queueSave();renderTabs();renderBreadcrumb();renderSidebar();updateCursor();renderStatus();updateBreakpoints();
}
function closeTab(path) {
  const p=project(), index=p.open.indexOf(path);
  p.open=p.open.filter(item=>item!==path);
  if(secondFile===path) closeSplit();
  if(p.active===path) {
    p.active=p.open[index]||p.open[index-1]||'';
    place(primary,p.active);activeEditor=primary;
  }
  queueSave();render();
}
function closeSplit() {split='';secondFile='';secondary?.setModel(null);activeEditor=primary;renderLayout();renderBreadcrumb();updateCursor();}
function splitEditor(direction) {
  if(!monaco)return;
  if(split===direction){closeSplit();return;}
  split=direction;
  secondFile ||= project().open.find(path=>path!==project().active)||project().active;
  place(secondary,secondFile);renderLayout();renderBreadcrumb();updateBreakpoints();
}
function applySettings() {
  applyTheme(monaco,state.settings.theme,tools?.extensionTheme());
  primary?.updateOptions(options(state.settings));secondary?.updateOptions(options(state.settings));
  for(const m of models.values())m.updateOptions({tabSize:Number(state.settings.tabSize),insertSpaces:true});
}
async function applyVim() {
  for(const instance of vimInstances) instance.dispose();
  vimInstances=[];$('#vim-status')?.remove();
  if(!primary||state.settings.keymap!=='vim')return;
  try {
    const {default:vim}=await import('./vendor/vim.js');
    if(state.settings.keymap!=='vim')return;
    const node=document.createElement('div');node.id='vim-status';node.className='status-group';
    $('#statusbar').prepend(node);vimInstances=[vim.initVimMode(primary,node),vim.initVimMode(secondary,node)];
  } catch(error){toast('Modo Vim indisponível: '+error.message,true);}
}
let decorations = new Map();
function updateBreakpoints(pausedPath=tools?.paused()?.path,pausedLine=tools?.paused()?.line) {
  for(const editor of [primary,secondary]) {
    if(!editor) continue;
    const currentModel=editor.getModel();
    const path=[...models].find(([,value])=>value===currentModel)?.[0];
    let collection=decorations.get(editor);
    if(!collection) {collection=editor.createDecorationsCollection();decorations.set(editor,collection);}
    const marks=(project().breakpoints[path]||[]).filter(line=>line<=currentModel.getLineCount()).map(line=>({range:new monaco.Range(line,1,line,1),options:{glyphMarginClassName:'kfe-breakpoint',glyphMarginHoverMessage:{value:'Ponto de interrupção'}}}));
    if(path===pausedPath&&pausedLine&&currentModel) marks.push({range:new monaco.Range(pausedLine,1,pausedLine,1),options:{isWholeLine:true,className:'kfe-paused'}});
    collection.set(marks);
  }
}
function breakpoint(path,line) {
  if(!path||language(path).id!=='javascript') {toast('Pontos de interrupção são usados em JavaScript.');return;}
  const bp=project().breakpoints[path]||[];
  project().breakpoints[path]=bp.includes(line)?bp.filter(item=>item!==line):[...bp,line].sort((a,b)=>a-b);
  queueSave();updateBreakpoints();tools.syncBreakpoints().catch(error=>toast(error.message,true));
  if(pane==='debug')renderSidebar();
}
function setupEditor() {
  $('#editor-primary').replaceChildren();
  primary=monaco.editor.create($('#editor-primary'),options(state.settings));
  secondary=monaco.editor.create($('#editor-secondary'),options(state.settings));
  activeEditor=primary;
  for(const editor of [primary,secondary]) {
    editor.onDidFocusEditorText(()=>{activeEditor=editor;updateCursor();});
    editor.onDidChangeCursorPosition(()=>{if(editor===activeEditor)updateCursor();});
    editor.onMouseDown(event=>{
      if(event.target.type===monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN&&event.target.position) {
        const path=[...models].find(([,value])=>value===editor.getModel())?.[0];
        breakpoint(path,event.target.position.lineNumber);
      }
    });
    editor.addAction({id:'kfe-refactor',label:'KFEcode: Refatorar seleção',contextMenuGroupId:'1_modification',run:()=>dispatch('refactor')});
    editor.addAction({id:'kfe-organize',label:'KFEcode: Organizar imports',contextMenuGroupId:'1_modification',run:()=>dispatch('organize')});
    editor.addAction({id:'kfe-rename',label:'KFEcode: Renomear símbolo no projeto',contextMenuGroupId:'1_modification',run:()=>dispatch('rename-symbol')});
  }
  monaco.editor.onDidChangeMarkers(refreshIssues);
  applySettings();setupModels();place(primary,project().active);updateBreakpoints();applyVim();tools.refreshSnippets();refreshIssues();
}
function refreshIssues() {
  if(!state)return;
  const p=project();
  const rows=monaco?monaco.editor.getModelMarkers({}).flatMap(marker=>{
    const modelPath=marker.resource.path, root='/workspace/'+p.id+'/';
    if(!modelPath.startsWith(root))return [];
    return [{path:modelPath.slice(root.length),line:marker.startLineNumber,message:marker.message,severity:marker.severity===monaco.MarkerSeverity.Error?'error':'warn',source:marker.source||'Editor'}];
  }):[];
  issues=[...rows,...audit(p)];
  renderStatus();renderBottom();
}
function schedulePreview(){clearTimeout(previewTimer);previewTimer=setTimeout(()=>runPreview({silent:true}),480);}
function runPreview({silent=false,path}={}) {
  clearTimeout(previewTimer);
  const p=project(), file=path??entryPoint(p);
  if(!silent){previewVisible=true;if(narrow())mobilePreview=true;renderLayout();}
  previewKey=crypto.randomUUID();
  previewHTML=buildPreview(p,file,previewKey);
  lastPreview=file;activePage=file;
  $('#preview').srcdoc=previewHTML;
  $('#preview-path').textContent='/'+(file||p.active||'');
  $('#preview-state').innerHTML='<i></i> '+(file||p.active?'Ao vivo':'Pronta');
  if(!silent) {logs=[]; addLog(file?'Prévia iniciada · '+file:'Prévia iniciada · '+(p.active||'projeto'),'ok');}
}
function openPreview() {
  if(!previewHTML)runPreview({silent:true});
  const wrapper='<!doctype html><meta charset="utf-8"><title>Prévia KFEcode</title><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;display:block}</style><iframe title="Prévia" sandbox="allow-scripts allow-forms allow-modals" srcdoc="'+h(previewHTML)+'"></iframe>';
  const url=URL.createObjectURL(new Blob([wrapper],{type:'text/html'}));
  window.open(url,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(url),30000);
}
window.addEventListener('message',event=>{
  const message=event.data;
  if(event.source!==$('#preview').contentWindow||!message||message.key!==previewKey)return;
  if(message.path && own(project().files,message.path)) runPreview({path:message.path,silent:true});
  if(typeof message.message==='string') addLog(message.message,({log:'info',info:'info',warn:'warn',error:'error',debug:'debug'})[message.level]||'info');
});
new ResizeObserver(()=>{
  const frame=$('#preview');
  $('#viewport-size').textContent=Math.round(frame.clientWidth)+' × '+Math.round(frame.clientHeight);
}).observe($('#preview'));
function closePopover(){popover.hidden=true;popover.replaceChildren();}
function menuAt(anchor,items) {
  popover.innerHTML=items.map(item=>item===null?'<hr>':'<button data-action="'+item[0]+'" data-value="'+h(item[3]??'')+'">'+icon(item[2],15)+'<span>'+h(item[1])+'</span>'+(item[4]?'<kbd>'+h(item[4])+'</kbd>':'')+'</button>').join('');
  popover.hidden=false;
  const box=anchor?.getBoundingClientRect?.()||{left:80,bottom:80};
  popover.style.left=Math.max(4,Math.min(box.left,innerWidth-popover.offsetWidth-6))+'px';
  popover.style.top=Math.max(4,Math.min(box.bottom+5,innerHeight-popover.offsetHeight-6))+'px';
  popover.querySelector('button')?.focus();
}
function showDialog(title,markup,{wide=false}={}) {
  if(dialog.open)dialog.close();
  dialog.classList.remove('shortcuts-dialog');
  dialog.classList.toggle('wide',wide);
  dialog.innerHTML='<div class="dialog-header"><h2>'+h(title)+'</h2>'+actionIcon('dialog-close','x','Fechar')+'</div>'+markup;
  dialog.showModal();
  return dialog;
}
function form(title, fields, onSubmit, label='Confirmar') {
  showDialog(title,'<form class="dialog-form">'+fields+'<div>'+button('Cancelar','dialog-close')+'<button class="accent-button" type="submit">'+h(label)+'</button></div></form>');
  const element=dialog.querySelector('form');
  for (const item of element.querySelectorAll('button[data-action]')) item.type='button';
  element.addEventListener('submit',async event=>{
    event.preventDefault();
    const submit=element.querySelector('[type=submit]');
    submit.disabled=true;
    try{await onSubmit(new FormData(element));if(dialog.contains(element))dialog.close();}
    catch(error){toast(error.message,true);submit.disabled=false;}
  });
  element.querySelector('input,select,textarea')?.focus();
}
function textField(name,label,value='',extra='') {return '<label>'+h(label)+'<input name="'+h(name)+'" value="'+h(value)+'" '+extra+'></label>';}
function confirm(title,message,callback,label) {form(title,'<p class="muted">'+h(message)+'</p>',callback,label);}
function parents(path){const result=[];for(let dir=parent(path);dir;dir=parent(dir))result.unshift(dir);return result;}
function assertDestination(p,path,isFolder=false) {
  if(!validPath(path))throw new Error('O caminho contém um nome inválido.');
  if(own(p.files,path)||p.folders.includes(path))throw new Error('Já existe um item com esse caminho.');
  if(parents(path).some(dir=>own(p.files,dir)))throw new Error('Um arquivo já ocupa uma das pastas desse caminho.');
  if(isFolder&&Object.keys(p.files).some(name=>name.startsWith(path+'/')))throw new Error('A pasta já está em uso.');
}
function foldersFor(p,path) {
  const dirs=parents(path);
  for(const dir of dirs) if(!p.folders.includes(dir))p.folders.push(dir);
  p.collapsed=p.collapsed.filter(dir=>dir&&!dirs.includes(dir));
}
function createFile(type) {
  const p=project(), kind=languages[type]||languages.txt;
  form('Novo arquivo '+kind.label,textField('name','Nome do arquivo','', 'required placeholder="exemplo.'+kind.extension+'"')+'<p class="muted">Local de criação · '+h(p.name+(p.selected?'/'+p.selected:''))+'</p>',data=>{
    const input=String(data.get('name')).trim(), filename=base(input).includes('.')?input:input+'.'+kind.extension;
    const path=join(p.selected,filename);
    assertDestination(p,path);foldersFor(p,path);p.files[path]='';mutations++;
    activateFile(path); refreshIssues();
  },'Criar arquivo');
}
function createFolder() {
  const p=project();
  form('Nova pasta',textField('name','Nome da pasta','','required')+'<p class="muted">Local de criação · '+h(p.name+(p.selected?'/'+p.selected:''))+'</p>',data=>{
    const path=join(p.selected,String(data.get('name')).trim());
    assertDestination(p,path,true);foldersFor(p,path);p.folders.push(path);p.selected=path;mutations++;queueSave();render();
  },'Criar pasta');
}
function switchProject(id,workspaceId=workspace().id) {
  const next=state.workspaces.find(item=>item.id===workspaceId);
  if(!next||!next.projects.some(item=>item.id===id)) return;
  tools.detachProject();disposeModels();closeSplit();
  state.workspace=workspaceId;next.project=id;
  logs=[]; activeEditor=primary;
  setupModels();place(primary,project().active);render();updateBreakpoints();refreshIssues();
  runPreview({silent:true});queueSave();tools.refresh().catch(()=>{});
}
function addProject(p) {workspace().projects.push(p);switchProject(p.id);}
function replaceProject(data) {
  const p=project();
  const open=p.open.filter(path=>own(data.files,path));
  const active=own(data.files,p.active)?p.active:open[0]||Object.keys(data.files)[0]||'';
  Object.assign(p,{files:data.files,saved:structuredClone(data.files),folders:data.folders,active,open:active&&!open.includes(active)?[active,...open]:open});
  mutations++;switchProject(p.id);
}
function newProject() {
  form('Novo projeto',textField('name','Nome do projeto','','required placeholder="meu-projeto"')+'<label>Linguagem inicial<select name="template"><option value="html">HTML</option><option value="css">CSS</option><option value="js">JavaScript</option><option value="">Projeto vazio</option></select></label>',data=>{
    const name=String(data.get('name')).trim();
    if(!validName(name))throw new Error('Escolha um nome de projeto válido.');
    addProject(makeProject(name,data.get('template')));
  },'Criar projeto');
}
function showWorkspaces() {
  showDialog('Workspaces e projetos','<div class="dialog-body">'+state.workspaces.map(group=>'<div class="stack"><strong>'+h(group.name)+'</strong>'+group.projects.map(item=>'<button class="list-button" data-action="switch-project" data-value="'+h(item.id)+'" data-workspace="'+h(group.id)+'">'+icon(item.id===project().id?'check':'folder',15)+'<span>'+h(item.name)+'</span></button>').join('')+'</div>').join('')+'<div class="row">'+button('Novo workspace','new-workspace','grid')+button('Novo projeto','new-project','plus')+'</div></div>');
}
function newWorkspace() {
  form('Novo workspace',textField('name','Nome do workspace','','required'),data=>{
    const name=String(data.get('name')).trim();
    if(!name)throw new Error('Digite um nome.');
    const p=makeProject('meu-projeto');
    const group={id:crypto.randomUUID(),name,projects:[p],project:p.id};
    state.workspaces.push(group);switchProject(p.id,group.id);
  },'Criar workspace');
}
async function importFiles(list,asProject=false) {
  if(!list.length)return;
  const p=project();
  const label=asProject?(list[0].webkitRelativePath.split('/')[0]||'projeto-importado'):p.name;
  const entries=await Promise.all([...list].map(async file=>({
    path:asProject?(file.webkitRelativePath.split('/').slice(1).join('/')||file.name):join(p.selected,file.name),
    data:await readFile(file),
  })));
  const valid=entries.filter(entry=>validPath(entry.path)&&!entry.path.split('/').some(name=>['.git','node_modules'].includes(name)));
  if(!valid.length)throw new Error('Nenhum arquivo compatível foi encontrado.');
  const insert=()=>{
    const target=asProject?makeProject(label):p;
    for(const {path,data} of valid) {
      if(target.folders.includes(path)||parents(path).some(dir=>own(target.files,dir)))continue;
      foldersFor(target,path);target.files[path]=data;
      if(asProject)target.saved[path]=structuredClone(data);
      const m=target.id===project().id?models.get(path):null;
      if(m&&typeof data==='string') m.setValue(data);
      else if(m) {m.dispose();models.delete(path);}
    }
    const first=Object.keys(target.files).find(path=>ext(path)==='html')||Object.keys(target.files)[0];
    mutations++;
    if(asProject) {target.active=first;target.open=first?[first]:[];addProject(target);}
    else {setupModels();activateFile(valid.find(entry=>own(target.files,entry.path))?.path||target.active);render();}
    queueSave();toast(valid.length+' arquivo(s) importado(s).');
  };
  if(!asProject&&valid.some(({path})=>own(p.files,path)))confirm('Substituir arquivos?','A importação inclui nomes que já existem no projeto. Confirme para atualizar esses arquivos.',insert,'Substituir');
  else insert();
}
async function openDisk() {
  if(!window.showDirectoryPicker) {$('#folder-import').click();return;}
  const root=await window.showDirectoryPicker({mode:'readwrite'});
  const files={}, dirs=[];
  async function readDirectory(dir,prefix='') {
    for await(const [name,handle] of dir.entries()) {
      if(!validName(name)||['.git','node_modules'].includes(name))continue;
      const path=join(prefix,name);
      if(handle.kind==='directory'){dirs.push(path);await readDirectory(handle,path);}
      else files[path]=await readFile(await handle.getFile());
    }
  }
  await readDirectory(root);
  const p=makeProject(root.name,'',files,dirs);
  p.disk=root;
  p.active=Object.keys(files).find(path=>path==='index.html')||Object.keys(files)[0]||'';
  p.open=p.active?[p.active]:[];
  addProject(p);
}
async function writeToDisk(p,paths,folders=[]) {
  if(!p.disk)return false;
  let permission=await p.disk.queryPermission({mode:'readwrite'});
  if(permission!=='granted')permission=await p.disk.requestPermission({mode:'readwrite'});
  if(permission!=='granted')throw new Error('O navegador não concedeu acesso de escrita à pasta.');
  for(const path of folders) {
    let directory=p.disk;
    for(const part of path.split('/'))directory=await directory.getDirectoryHandle(part,{create:true});
  }
  for(const path of paths) {
    let folder=p.disk;
    for(const part of parents(path).map(base))folder=await folder.getDirectoryHandle(part,{create:true});
    const file=await folder.getFileHandle(base(path),{create:true}), output=await file.createWritable();
    await output.write(blobFor(p.files[path]));await output.close();
  }
  return true;
}
async function saveFiles(all=false,downloadFile=false) {
  const p=project(), path=current();
  const names=all?Object.keys(p.files):path?[path]:[];
  if(!names.length&&!(all&&p.folders.length))throw new Error('Abra um arquivo para salvar.');
  if(state.settings.formatOnSave&&!downloadFile) {
    for(const name of names) if(dirty(name)&&['html','css','javascript','json','markdown'].includes(language(name).id)&&typeof p.files[name]==='string') await formatFile(name);
  }
  const saved=Object.fromEntries(names.map(name=>[name,structuredClone(p.files[name])]));
  if(downloadFile) {download(blobFor(saved[path]),base(path));toast(base(path)+' baixado.');return;}
  const local=await tools.saveLocal(p,names,saved,all?p.folders:[]);
  const disk=await writeToDisk(p,names,all?p.folders:[]);
  Object.assign(p.saved,saved);
  await saveState();renderTabs();renderStatus();
  toast(all?'Projeto salvo'+(disk||local?' no disco.':'.'):base(path)+(disk||local?' salvo no disco.':' salvo no workspace.'));
}
async function saveAs() {
  const path=current();
  if(!path)throw new Error('Abra um arquivo para salvar.');
  if(!window.showSaveFilePicker){await saveFiles(false,true);return;}
  const file=await window.showSaveFilePicker({suggestedName:base(path)});
  const output=await file.createWritable();
  await output.write(blobFor(source(path)));await output.close();toast(base(path)+' salvo no disco.');
}
function applyEdits(changes) {
  const p=project();
  const selected=changes.filter(edit=>validPath(edit.fileName.replace(/^\//,'')));
  for(const {fileName,textChanges,isNewFile} of selected) {
    const path=fileName.replace(/^\//,'');
    if(isNewFile&&!own(p.files,path)) {foldersFor(p,path);p.files[path]='';}
    if(typeof p.files[path]!=='string') continue;
    const m=model(path);
    if(m) {
      const edits=textChanges.map(({span,newText})=>{
        const a=m.getPositionAt(span.start),b=m.getPositionAt(span.start+span.length);
        return {range:new monaco.Range(a.lineNumber,a.column,b.lineNumber,b.column),text:newText};
      });
      m.pushStackElement();m.pushEditOperations([],edits,()=>null);m.pushStackElement();
    } else {
      let text=p.files[path];
      for(const {span,newText} of [...textChanges].sort((a,b)=>b.span.start-a.span.start))text=text.slice(0,span.start)+newText+text.slice(span.start+span.length);
      p.files[path]=text;
    }
  }
  setupModels();queueSave();render();
  return selected.length;
}
async function moveItem(path,destination) {
  const p=project(), folder=p.folders.includes(path);
  if(path===destination)return;
  if(destination.startsWith(path+'/'))throw new Error('Selecione um destino fora da pasta que será movida.');
  assertDestination(p,destination,folder);
  let edits=[];
  if(!folder&&language(path).id==='javascript'&&typeof p.files[path]==='string') {
    const {movedFileChanges}=await import('./refactor.js');
    edits=await movedFileChanges(p,path,destination);
  }
  if(project().id!==p.id)throw new Error('O projeto mudou durante a operação.');
  await tools.moveLocal(p,path,destination);
  if(project().id!==p.id)throw new Error('O projeto mudou durante a operação.');
  if(edits.length)applyEdits(edits);
  const remap=name=>name===path||name?.startsWith(path+'/')?destination+name.slice(path.length):name;
  disposeModels();foldersFor(p,destination);
  for(const key of ['files','saved','breakpoints']) p[key]=Object.fromEntries(Object.entries(p[key]).map(([name,value])=>[remap(name),value]));
  p.folders=p.folders.map(remap);p.open=p.open.map(remap);p.collapsed=p.collapsed.map(remap);p.active=remap(p.active);p.selected=parent(destination);p.entry=remap(p.entry);secondFile=remap(secondFile);
  mutations++;setupModels();place(primary,p.active);if(split)place(secondary,secondFile);
  queueSave();render();refreshIssues();runPreview({silent:true});toast('Item movido para '+destination+'.');
}
function removeItem(path) {
  const p=project();
  confirm('Excluir '+base(path)+'?','O item será removido do projeto atual.',async()=>{
    await tools.deleteLocal(p,path);
    const keep=name=>name!==path&&!name?.startsWith(path+'/');
    disposeModels();
    for(const key of ['files','saved','breakpoints'])p[key]=Object.fromEntries(Object.entries(p[key]).filter(([name])=>keep(name)));
    p.folders=p.folders.filter(keep);p.open=p.open.filter(keep);p.collapsed=p.collapsed.filter(keep);
    if(!keep(p.active))p.active=p.open[0]||'';
    if(!keep(secondFile))closeSplit();
    p.selected=parent(path);mutations++;
    setupModels();place(primary,p.active);if(split)place(secondary,secondFile);
    queueSave();render();refreshIssues();runPreview({silent:true});
  },'Excluir');
}
function readSearch() {
  const element=$('#search-form');
  if(!element)return;
  const data=new FormData(element);
  searchState={query:String(data.get('query')),replace:String(data.get('replacement')),regex:data.has('regex'),case:data.has('case')};
}
function pattern() {
  const search=searchState.query;
  if(!search)return null;
  const literal=searchState.regex?search:search.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp(literal,'g'+(searchState.case?'':'i')+'m');
}
function renderSearch() {
  const output=$('#search-results');
  if(!output)return;
  try{
    const re=pattern();
    if(!re){output.innerHTML='<p class="muted">Digite um termo para localizar ocorrências no projeto.</p>';return;}
    const matches=[];
    for(const [path,text] of Object.entries(project().files)) {
      if(typeof text!=='string')continue;
      for(const match of text.matchAll(re)) {
        const line=text.slice(0,match.index).split('\n').length;
        const sample=text.split('\n')[line-1].trim().slice(0,140);
        matches.push({path,line,sample});
        if(matches.length>=500)break;
      }
      if(matches.length>=500)break;
    }
    output.innerHTML='<p class="muted">'+matches.length+(matches.length===500?'+':'')+' ocorrências</p>'+matches.map(item=>'<button class="list-button" data-action="location" data-value="'+h(item.path)+'" data-line="'+item.line+'">'+fileIcon(item.path)+'<span><strong>'+h(item.path)+':'+item.line+'</strong><small>'+h(item.sample)+'</small></span></button>').join('');
  }catch(error){output.innerHTML='<p class="muted">'+h(error.message)+'</p>';}
}
function replaceAll() {
  readSearch();const re=pattern();if(!re)return;
  const p=project(), changes=[];
  for(const [path,content] of Object.entries(p.files)) {
    if(typeof content!=='string')continue;
    const text=searchState.regex?content.replace(re,searchState.replace):content.replace(re,()=>searchState.replace);
    if(content!==text)changes.push({path,text});
  }
  if(!changes.length){toast('Nenhum arquivo seria alterado.');return;}
  confirm('Substituir ocorrências?','A operação altera '+changes.length+' arquivo(s) no projeto.',()=>{
    for(const {path,text} of changes)setText(path,text);
    queueSave();renderSearch();refreshIssues();toast(changes.length+' arquivo(s) atualizado(s).');
  },'Substituir');
}
function setText(path,text) {
  const m=model(path);
  if(m){
    m.pushStackElement();m.pushEditOperations([],[{range:m.getFullModelRange(),text}],()=>null);m.pushStackElement();
  }else {project().files[path]=text;mutations++;}
  queueSave();
}
async function formatFile(path=current()) {
  const p=project(), before=source(path);
  if(typeof before!=='string')throw new Error('Abra um arquivo de texto para formatar.');
  const output=await formatSource(path,before,Number(state.settings.tabSize));
  if(project().id!==p.id||before!==source(path))throw new Error('O arquivo mudou durante a formatação. Tente novamente.');
  if(output!==before)setText(path,output);
}
function diff(path=current(),before=project().saved[path],after=source(path),label='Alterações desde o último salvamento') {
  if(typeof after!=='string'&&typeof before!=='string')throw new Error('Abra um arquivo de texto para comparar.');
  const node=showDialog(label+' · '+base(path),'<div class="diff-editor"></div>',{wide:true}).querySelector('.diff-editor');
  if(!monaco){node.innerHTML='<pre class="conflict-code">'+h(before)+'</pre><pre class="conflict-code">'+h(after)+'</pre>';return;}
  const original=monaco.editor.createModel(typeof before==='string'?before:'',language(path).id);
  const modified=monaco.editor.createModel(typeof after==='string'?after:'',language(path).id);
  diffView=monaco.editor.createDiffEditor(node,{...options(state.settings),readOnly:true,minimap:{enabled:false},renderSideBySide:true,originalEditable:false});
  diffView.setModel({original,modified});
  dialog.addEventListener('close',()=>{diffView?.dispose();diffView=null;original.dispose();modified.dispose();},{once:true});
}
function palette(mode='all') {
  const commands=[
    ['Códigos e atalhos','shortcuts','keyboard'],['Buscar no arquivo','find-file','search'],['Substituir no arquivo','replace-file','search'],['Modo foco','focus-mode','expand'],['Executar prévia','run','play'],['Salvar arquivo','save','save','Ctrl S'],['Salvar como…','save-as','download',''],['Novo projeto','new-project','folder',''],['Workspaces e projetos','workspaces','grid',''],['Buscar no projeto','search-pane','search','Ctrl Shift F'],['Formatar arquivo','format','code','Shift Alt F'],['Refatorar seleção','refactor','code',''],['Renomear símbolo','rename-symbol','code','F2'],['Organizar imports','organize','code',''],['Alterar ordem de parâmetros','parameters','code',''],['Ir para definição','definition','arrow','F12'],['Dividir lado a lado','split','split',''],['Dividir acima e abaixo','split-vertical','split',''],['Diferenças do arquivo','diff','branch',''],['Testes','tests-pane','flask',''],['Terminal','terminal-pane','terminal',''],['Configurações','settings-pane','settings',''],['Exportar projeto (.zip)','zip','download',''],['Importar pasta','import-folder','upload',''],
  ];
  showDialog(mode==='symbols'?'Ir para símbolo':mode==='files'?'Ir para arquivo':'Arquivos e comandos','<input id="palette-input" class="field palette-input" autocomplete="off" placeholder="'+(mode==='symbols'?'Digite um símbolo…':'Digite um nome ou comando…')+'"><div id="palette-list" class="palette-list"></div>');
  const input=$('#palette-input'), output=$('#palette-list');
  let index=0;
  const entries=[];
  if(mode==='symbols') {
    for(const [path,text] of Object.entries(project().files)) for(const symbol of outline(text,path))entries.push({label:symbol.name,glyph:'code',action:'location',value:path,line:symbol.line,detail:path});
  } else {
    for(const path of Object.keys(project().files))entries.push({label:path,glyph:language(path).icon,action:'file',value:path});
    if(mode==='all')for(const [label,action,glyph] of commands)entries.push({label,glyph,action,detail:keysFor(state.settings,action).map(key=>keyParts(key,isMac).join(' + ')).join(' / ')});
  }
  function paint() {
    const term=input.value.toLocaleLowerCase().trim();
    const filtered=entries.filter(item=>item.label.toLocaleLowerCase().includes(term)).slice(0,100);
    index=Math.max(0,Math.min(index,filtered.length-1));
    output.innerHTML=filtered.map((item,i)=>'<button class="list-button '+(i===index?'selected':'')+'" data-palette="true" data-action="'+item.action+'" data-value="'+h(item.value||'')+'" data-line="'+(item.line||0)+'">'+icon(item.glyph,15)+'<span>'+h(item.label)+(item.detail?'<small>'+h(item.detail)+'</small>':'')+'</span></button>').join('')||'<p class="muted">Nenhum resultado.</p>';
  }
  input.addEventListener('input',()=>{index=0;paint();});
  input.addEventListener('keydown',event=>{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();index+=event.key==='ArrowDown'?1:-1;paint();output.querySelector('.selected')?.scrollIntoView({block:'nearest'});}
    if(event.key==='Enter'){event.preventDefault();output.querySelector('.selected')?.click();}
  });
  paint();input.focus();
}
function shortcut(event) {
  const parts=[];
  if(event.ctrlKey||event.metaKey)parts.push('Ctrl');
  if(event.altKey)parts.push('Alt');
  if(event.shiftKey)parts.push('Shift');
  const key=event.code==='Backquote'&&event.shiftKey?String.fromCharCode(96):event.key===' '?'Space':event.key.length===1?event.key.toUpperCase():event.key;
  if(!['Control','Meta','Alt','Shift'].includes(key))parts.push(key);
  return parts.join('+');
}
const customizable=[['find-file','Buscar no arquivo'],['replace-file','Substituir no arquivo'],['palette','Paleta de comandos'],['file-palette','Abrir arquivo'],['run','Executar'],['save','Salvar'],['format','Formatar'],['terminal-pane','Abrir terminal'],['search-pane','Busca global'],['rename-symbol','Renomear símbolo'],['shortcuts','Abrir códigos e atalhos']];
function renderShortcutHints() {
  for(const label of document.querySelectorAll('[data-shortcut]')) {
    const key=keysFor(state.settings,label.dataset.shortcut)[0];
    label.hidden=!key;
    label.textContent=key?keyParts(key,isMac).join(isMac?'':' '):'';
  }
}
function shortcutGuide() {
  showDialog('Códigos e atalhos','<div class="shortcut-toolbar"><label class="shortcut-search">'+icon('search',17)+'<input id="shortcut-search" type="search" placeholder="Buscar comando ou tecla…" aria-label="Buscar comando ou tecla" autocomplete="off"></label><div class="shortcut-platform" aria-label="Plataforma"><button type="button" data-platform="pc">Windows / Linux</button><button type="button" data-platform="mac">macOS</button></div></div><div class="shortcut-list" id="shortcut-list"></div><div class="shortcut-footer">'+button('Personalizar atalhos','keybindings','settings')+'</div>',{wide:true});
  dialog.classList.add('shortcuts-dialog');
  const input=$('#shortcut-search'), output=$('#shortcut-list');
  const plain=value=>value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[+\s]/g,'');
  function paint() {
    const term=plain(input.value);
    for(const button of dialog.querySelectorAll('[data-platform]'))button.setAttribute('aria-pressed',String((button.dataset.platform==='mac')===macShortcuts));
    const sections=shortcutGroups.map(group=>{
      const entries=group.entries.map(item=>({...item,keys:keysFor(state.settings,item.id,macShortcuts)})).filter(item=>
        [item.label,group.title,...item.keys,...item.keys.map(key=>keyParts(key,macShortcuts).join('')), ...item.keys.map(key=>macShortcuts?key.replace('Ctrl','Cmd').replace('Alt','Option'):key)].some(value=>plain(value).includes(term))
      );
      if(!entries.length)return '';
      const rows=entries.map(item=>'<button type="button" class="shortcut-row" data-action="'+item.id+'" data-palette="true"><span>'+h(item.label)+'</span><span class="shortcut-keys">'+(item.keys.length?item.keys.map(key=>'<span class="shortcut-chord">'+keyParts(key,macShortcuts).map(part=>'<kbd>'+h(part)+'</kbd>').join('')+'</span>').join(''):'<span class="shortcut-no-key">Executar</span>')+'</span></button>').join('');
      return '<section class="shortcut-section"><h3>'+icon(group.icon,15)+h(group.title)+'</h3>'+rows+'</section>';
    }).join('');
    output.innerHTML=sections||'<p class="shortcut-empty">Nenhum comando encontrado.</p>';
  }
  input.addEventListener('input',paint);
  input.addEventListener('keydown',event=>{if(event.key==='Enter')output.querySelector('button')?.click();});
  for(const button of dialog.querySelectorAll('[data-platform]'))button.addEventListener('click',()=>{macShortcuts=button.dataset.platform==='mac';paint();});
  paint();input.focus();
}
function toggleFocus() {
  if(focusRestore) {
    ({sidebarHidden,previewVisible,bottomHidden,mobilePreview}=focusRestore);
    focusRestore=null;
  } else {
    focusRestore={sidebarHidden,previewVisible,bottomHidden,mobilePreview};
    sidebarHidden=true;previewVisible=false;bottomHidden=true;mobilePreview=false;
  }
  renderLayout();renderBottom();
}
async function runEditorCommand(id) {
  if(!activeEditor?.getModel())throw new Error('Abra um arquivo de texto para usar este comando.');
  activeEditor.focus();
  if(id==='undo'||id==='redo')activeEditor.trigger('kfecode',id);
  else await activeEditor.getAction(id)?.run();
}
function customKeys() {
  form('Atalhos personalizados',customizable.map(([action,label])=>textField(action,label,keysFor(state.settings,action)[0]||defaultKeyFor(action),'placeholder="Ctrl+Shift+K"')).join(''),data=>{
    const next={};
    for(const [action] of customizable) {
      const value=String(data.get(action)).trim();
      if(!value)continue;
      if(!/^(?:(?:Ctrl|Alt|Shift)\+)*(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|\x60)$/.test(value))throw new Error('Use um atalho como Ctrl+K, Alt+Shift+F ou F5.');
      if(next[value])throw new Error('Há atalhos duplicados.');
      next[value]=action;
    }
    state.settings.keybindings=next;queueSave();renderShortcutHints();toast('Atalhos atualizados.');
  },'Salvar atalhos');
}
function usePane(next) {
  const former=pane;
  if(pane===next&&!sidebarHidden)sidebarHidden=true;
  else {pane=next;sidebarHidden=false;}
  if(matchMedia('(max-width:555px)').matches)mobilePreview=false;
  if(former!==pane||sidebarHidden)closePopover();
  renderLayout();renderSidebar();
  if(!sidebarHidden)tools.activate(pane).catch(error=>toast(error.message,true));
}
function chooseBottom(next) {
  const el=$('#bottom-content');
  if(bottom!==next)tools.leaveBottom(bottom,el);
  bottom=next;bottomHidden=false;
  renderLayout();renderBottom();tools.activateBottom(bottom).catch(error=>toast(error.message,true));
}
function selectedJS() {
  const path=current(), m=activeEditor?.getModel(), sel=activeEditor?.getSelection();
  if(!m||!sel||language(path).id!=='javascript')throw new Error('Selecione um trecho em um arquivo JavaScript.');
  return {path,m,start:m.getOffsetAt(sel.getStartPosition()),end:m.getOffsetAt(sel.getEndPosition())};
}
async function advanced(action) {
  const {path,start,end}=selectedJS();
  const service=await import('./refactor.js');
  const p=project(), stamp=mutations;
  const ensure=()=>{if(p.id!==project().id||stamp!==mutations)throw new Error('O projeto mudou durante a análise. Tente novamente.');};
  if(action==='organize'){
    const changes=await service.importsChanges(p,path);ensure();toast(applyEdits(changes)?'Imports organizados.':'Os imports já estão organizados.');
  }
  if(action==='rename-symbol'){
    const {m}=selectedJS();
    const initial=m.getWordAtPosition(m.getPositionAt(start))?.word || '';
    form('Renomear símbolo',textField('name','Novo nome',initial,'required'),async data=>{
      ensure();const changes=await service.renameChanges(p,path,start,String(data.get('name')).trim());
      ensure();toast(applyEdits(changes)+' arquivo(s) atualizado(s).');
    },'Renomear');
  }
  if(action==='refactor'){
    const range=start===end?start:{pos:start,end};
    const choices=await service.refactorChoices(p,path,range);ensure();
    if(!choices.length)throw new Error('Selecione uma expressão, instrução ou declaração completa para ver as refatorações disponíveis.');
    form('Refatorar seleção','<label>Ação<select name="choice">'+choices.map((item,index)=>'<option value="'+index+'">'+h(item.label)+'</option>').join('')+'</select></label>',async data=>{
      ensure();const changes=await service.refactorChanges(p,path,range,choices[Number(data.get('choice'))]);
      ensure();toast(applyEdits(changes)?'Refatoração aplicada.':'Nenhuma alteração foi gerada.');
    },'Aplicar');
  }
  if(action==='parameters') {
    form('Alterar ordem dos parâmetros','<p class="muted">Posicione o cursor em uma função JavaScript nomeada. A troca atualiza chamadas diretas no projeto.</p>'+textField('first','Posição do primeiro parâmetro','1','type="number" min="1" required')+textField('second','Posição do segundo parâmetro','2','type="number" min="1" required'),async data=>{
      ensure();const changes=await service.swapParameters(p,path,start,Number(data.get('first'))-1,Number(data.get('second'))-1);ensure();toast(applyEdits(changes)+' arquivo(s) atualizado(s).');
    },'Trocar parâmetros');
  }
}
async function dispatch(action,value='',element=null) {
  const p=project();
  try{
    if(editorCommands[action]){await runEditorCommand(editorCommands[action]);return;}
    switch(action) {
      case 'file': activateFile(value);break;
      case 'location': activateFile(value,{line:element?.dataset.line||1});break;
      case 'close-tab':closeTab(value);break;
      case 'tree-folder':
        p.selected=value;p.collapsed=p.collapsed.includes(value)?p.collapsed.filter(item=>item!==value):[...p.collapsed,value];
        queueSave();renderSidebar();break;
      case 'outline':outlineOpen=!outlineOpen;renderOutline();break;
      case 'add-menu':menuAt(element,[
        ['new-file','Novo HTML','html','html'],['new-file','Novo CSS','css','css'],['new-file','Novo JavaScript','js','js'],['new-file','Novo arquivo…','doc','txt'],['new-folder','Nova pasta','folder'],null,
        ['import-files','Importar arquivos…','upload'],['import-folder','Importar pasta…','folderopen'],['open-disk','Abrir pasta do computador…','folderopen'],null,['new-project','Novo projeto','grid'],
      ]);break;
      case 'project-menu':menuAt(element,[
        ['workspaces','Workspaces e projetos','grid'],['new-project','Novo projeto','plus'],['project-rename','Renomear projeto','doc'],['save-all','Salvar todos','save'],['zip','Exportar projeto (.zip)','download'],['open-disk','Abrir pasta do computador…','folderopen'],
      ]);break;
      case 'editor-menu':menuAt(element,[
        ['save-as','Salvar como…','save'],['download','Baixar arquivo','download'],['format','Formatar arquivo','code'],['diff','Comparar com versão salva','branch'],null,['split','Dividir lado a lado','split'],['split-vertical','Dividir acima e abaixo','split'],['second-file','Abrir outro arquivo na divisão','files'],null,
        ['refactor','Refatorar seleção','code'],['rename-symbol','Renomear símbolo','code'],['organize','Organizar imports','code'],['parameters','Alterar ordem de parâmetros','code'],
      ]);break;
      case 'file-menu':menuAt(element,[
        ...(!p.folders.includes(value)?[['file','Abrir','doc',value],['split-file','Abrir em divisão','split',value],['file-download','Baixar arquivo','download',value]]:[]),
        ...(language(value).id==='html'?[['entry','Usar como página inicial','play',value]]:[]),
        ['move','Renomear ou mover…','folder',value],['remove','Excluir…','trash',value],
      ]);break;
      case 'language-menu':menuAt(element,Object.entries(languages).slice(0,3).map(([key,kind])=>['new-file','Novo '+kind.label,kind.icon,key]));break;
      case 'new-file':createFile(value);break;
      case 'new-folder':createFolder();break;
      case 'new-project':newProject();break;
      case 'new-workspace':newWorkspace();break;
      case 'workspaces':showWorkspaces();break;
      case 'switch-project':if(value!==p.id)switchProject(value,element?.dataset.workspace);if(dialog.open)dialog.close();break;
      case 'project-rename':
        form('Renomear projeto',textField('name','Nome',p.name,'required'),data=>{
          const name=String(data.get('name')).trim();if(!validName(name))throw new Error('Nome de projeto inválido.');
          p.name=name;queueSave();render();
        },'Renomear');break;
      case 'import-files':$('#file-import').click();break;
      case 'import-folder':$('#folder-import').click();break;
      case 'open-disk':await openDisk();break;
      case 'move':form('Renomear ou mover',textField('path','Caminho no projeto',value,'required'),data=>moveItem(value,String(data.get('path')).trim()),'Aplicar');break;
      case 'remove':removeItem(value);break;
      case 'save':await saveFiles();break;
      case 'save-all':await saveFiles(true);break;
      case 'download':await saveFiles(false,true);break;
      case 'file-download':download(blobFor(source(value)),base(value));break;
      case 'save-as':await saveAs();break;
      case 'zip':download(await zipProject(p),p.name+'.zip');toast('Projeto exportado.');break;
      case 'format':await formatFile();toast('Arquivo formatado.');break;
      case 'diff':diff();break;
      case 'refactor':case 'rename-symbol':case 'organize':case 'parameters':await advanced(action);break;
      case 'definition':if(activeEditor?.getModel())await activeEditor.getAction('editor.action.revealDefinition')?.run();break;
      case 'breakpoint':breakpoint(current(),activeEditor?.getPosition()?.lineNumber||1);break;
      case 'split':splitEditor('horizontal');break;
      case 'split-vertical':splitEditor('vertical');break;
      case 'split-file':if(!split)splitEditor('horizontal');activateFile(value,{secondaryPane:true});break;
      case 'second-file':
        if(!split)splitEditor('horizontal');
        showDialog('Arquivo na segunda divisão','<div class="dialog-body">'+Object.keys(p.files).map(path=>'<button class="list-button" data-palette="true" data-action="split-file" data-value="'+h(path)+'">'+fileIcon(path)+h(path)+'</button>').join('')+'</div>');break;
      case 'palette':palette();break;
      case 'shortcuts':shortcutGuide();break;
      case 'focus-mode':toggleFocus();break;
      case 'file-palette':palette('files');break;
      case 'symbols':palette('symbols');break;
      case 'search-pane':pane='search';sidebarHidden=false;renderLayout();renderSidebar();$('#search-form input')?.focus();break;
      case 'settings-pane':pane='settings';sidebarHidden=false;renderLayout();renderSidebar();break;
      case 'replace':replaceAll();break;
      case 'run':runPreview();break;
      case 'entry':p.entry=value;queueSave();runPreview({path:value});break;
      case 'preview-open':openPreview();break;
      case 'preview-toggle':
        if(narrow()){mobilePreview=!mobilePreview;if(mobilePreview)previewVisible=true;}
        else previewVisible=!previewVisible;
        renderLayout();if(previewVisible)runPreview({silent:true});break;
      case 'device':phone=!phone;renderLayout();break;
      case 'bottom':chooseBottom(value);break;
      case 'bottom-toggle':bottomHidden=!bottomHidden;renderLayout();renderBottom();break;
      case 'clear-console':logs=[];renderBottom();break;
      case 'terminal-pane':chooseBottom('terminal');break;
      case 'tests-pane':chooseBottom('tests');break;
      case 'dialog-close':dialog.close();break;
      case 'theme':state.settings.theme=value;delete state.settings.extensionTheme;applySettings();queueSave();renderSettings();break;
      case 'keybindings':customKeys();break;
      default:await tools.action(action,value,element);
    }
  }catch(error){if(error.name!=='AbortError')toast(error.message||String(error),true);}
}
document.addEventListener('click',event=>{
  const buttonNode=event.target.closest('[data-action],[data-pane]');
  if(!buttonNode){if(!popover.contains(event.target))closePopover();return;}
  const {action,pane:next,value,palette:fromPalette}=buttonNode.dataset;
  if(next){usePane(next);return;}
  if(fromPalette&&dialog.open)dialog.close();
  closePopover();dispatch(action,value,buttonNode);
});
document.addEventListener('contextmenu',event=>{
  const target=event.target.closest('.tree-row');
  if(!target||!target.dataset.value)return;
  event.preventDefault();dispatch('file-menu',target.dataset.value,target);
});
let draggedPath='';
document.addEventListener('dragstart',event=>{
  const row=event.target.closest('.tree-row[draggable]');
  if(!row)return;
  draggedPath=row.dataset.value;
  event.dataTransfer.setData('text/x-kfecode',draggedPath);event.dataTransfer.effectAllowed='move';
});
document.addEventListener('dragover',event=>{
  const row=event.target.closest('[data-drop]');
  if(!row||!draggedPath)return;
  event.preventDefault();row.classList.add('drop-target');
});
document.addEventListener('dragleave',event=>event.target.closest('[data-drop]')?.classList.remove('drop-target'));
document.addEventListener('dragend',()=>{draggedPath='';document.querySelectorAll('.drop-target').forEach(node=>node.classList.remove('drop-target'));});
document.addEventListener('drop',event=>{
  const row=event.target.closest('[data-drop]');
  if(!row||!draggedPath)return;
  event.preventDefault();row.classList.remove('drop-target');
  const path=draggedPath;draggedPath='';
  moveItem(path,join(row.dataset.drop,base(path))).catch(error=>toast(error.message,true));
});
document.addEventListener('submit',event=>{
  if(event.target.id==='search-form'){event.preventDefault();readSearch();renderSearch();}
  else tools?.submit(event);
});
document.addEventListener('change',event=>{
  const input=event.target,key=input.dataset.setting;
  if(key) {
    const value=input.type==='checkbox'?input.checked:input.type==='number'?Math.max(Number(input.min),Math.min(Number(input.max),Number(input.value))):input.value.trim();
    if(typeof value==='string'&&!value)return;
    state.settings[key]=value;applySettings();if(key==='keymap')applyVim();queueSave();renderTabs();renderSidebar();renderShortcutHints();return;
  }
  if(input.id==='file-import'||input.id==='folder-import'){
    const list=[...input.files];input.value='';
    importFiles(list,input.id==='folder-import').catch(error=>toast(error.message,true));
  } else tools?.change(event);
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){closePopover();return;}
  if(!state||event.defaultPrevented||dialog.open)return;
  const key=shortcut(event);
  const action=commandFor(state.settings,key);
  if(action){event.preventDefault();event.stopPropagation();dispatch(action);}
},true);
window.addEventListener('pagehide',()=>{if(state) saveState().catch(()=>{});});
window.addEventListener('resize',renderLayout);

async function init() {
  try{state=await load();}catch(error){state=normalize(initialState());reportStorage(error);}
  for(const group of state.workspaces)for(const p of group.projects){p.breakpoints ||= {};p.snapshots ||= [];}
  tools=createTools({$,state,project,toast,renderSidebar,renderBottom,renderStatus,addLog,head,button,actionIcon,showDialog,form,textField,confirm,chooseBottom,activateFile,applySettings,queueSave,diff,addProject,replaceProject,saveFiles,setText,runPreview,renderShortcutHints,refreshIssues,updateBreakpoints,current,pane:()=>pane,bottom:()=>bottom,editor:()=>activeEditor,monaco:()=>monaco,activePage:()=>activePage});
  for(const node of document.querySelectorAll('[data-icon]')) node.innerHTML=icon(node.dataset.icon);
  applySettings();render();
  addLog('Ambiente de edição iniciado.','ok');
  if(entryPoint(project())) addLog('Prévia carregada · '+entryPoint(project()));
  runPreview({silent:true});tools.refresh().catch(()=>{});
  try{monaco=await loadMonaco();setupEditor();}
  catch(error){$('#editor-primary').textContent=error.message;toast(error.message,true);}
}
init().catch(error=>{$('#editor-primary').textContent=error.message;console.error(error);});
