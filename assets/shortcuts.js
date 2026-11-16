const groups=[
  ['Busca e navegação','search',[
    ['find-file','Buscar no arquivo','Ctrl+F','actions.find'],
    ['replace-file','Substituir no arquivo','Ctrl+H','editor.action.startFindReplaceAction'],
    ['search-pane','Buscar em todo o projeto','Ctrl+Shift+F'],
    ['palette','Abrir paleta de comandos','Ctrl+K'],
    ['file-palette','Ir para arquivo','Ctrl+P'],
    ['symbols','Ir para símbolo','Ctrl+Shift+O'],
    ['definition','Ir para definição','F12'],
    ['go-line','Ir para linha','Ctrl+G','editor.action.gotoLine'],
  ]],
  ['Edição de código','code',[
    ['undo-edit','Desfazer','Ctrl+Z','undo'],
    ['redo-edit','Refazer','Ctrl+Shift+Z','redo'],
    ['select-next','Selecionar próxima ocorrência','Ctrl+D','editor.action.addSelectionToNextFindMatch'],
    ['comment-line','Comentar ou descomentar linha','Ctrl+/','editor.action.commentLine'],
    ['suggest','Mostrar sugestões','Ctrl+Space','editor.action.triggerSuggest'],
    ['rename-symbol','Renomear símbolo','F2'],
    ['format','Formatar arquivo','Alt+Shift+F'],
    ['refactor','Refatorar seleção'],
    ['organize','Organizar imports'],
  ]],
  ['Arquivos e projetos','files',[
    ['save','Salvar arquivo','Ctrl+S'],
    ['save-all','Salvar todos os arquivos','Ctrl+Shift+S'],
    ['save-as','Salvar como…'],
    ['new-project','Criar projeto'],
    ['workspaces','Abrir workspaces'],
    ['zip','Exportar projeto ZIP'],
  ]],
  ['Execução e layout','terminal',[
    ['run','Executar prévia','F5'],
    ['breakpoint','Alternar breakpoint','F9'],
    ['terminal-pane','Abrir terminal','Ctrl+Shift+`'],
    ['split','Dividir editor lado a lado'],
    ['split-vertical','Dividir editor acima e abaixo'],
    ['focus-mode','Alternar modo foco'],
    ['bottom-toggle','Mostrar ou recolher console'],
    ['preview-toggle','Mostrar ou ocultar prévia'],
    ['tests-pane','Abrir testes'],
    ['settings-pane','Abrir configurações'],
    ['shortcuts','Abrir códigos e atalhos','Ctrl+Alt+K'],
  ]],
];
export const shortcutGroups=groups.map(([title,icon,entries])=>({
  title,icon,entries:entries.map(([id,label,key='',editorAction=''])=>({id,label,key,editorAction})),
}));
const shortcuts=shortcutGroups.flatMap(group=>group.entries);
export const editorCommands=Object.fromEntries(shortcuts.filter(item=>item.editorAction).map(item=>[item.id,item.editorAction]));
const applicationKeys=Object.fromEntries(shortcuts.filter(item=>item.key&&(!item.editorAction||['find-file','replace-file','go-line'].includes(item.id))).map(item=>[item.key,item.id]));
const macEquivalent={'Ctrl+H':'Ctrl+Alt+F'};
const macDefaults=Object.fromEntries(Object.entries(applicationKeys).map(([key,action])=>[macEquivalent[key]||key,action]));
const sublimeKeys={'Ctrl+Shift+P':'palette','Ctrl+R':'symbols','Ctrl+Shift+D':'split'};

export function commandFor(settings,key,mac=isMac) {
  const custom=settings.keybindings;
  const fallback=(settings.keymap==='sublime'&&sublimeKeys[key])||(mac?macDefaults:applicationKeys)[key];
  return custom[key]||(Object.values(custom).includes(fallback)?undefined:fallback);
}
export function keysFor(settings,id,mac=isMac) {
  const keys=new Set(Object.keys(settings.keybindings));
  for(const key of Object.keys(mac?macDefaults:applicationKeys))keys.add(key);
  if(settings.keymap==='sublime')for(const key of Object.keys(sublimeKeys))keys.add(key);
  const registered=[...keys].filter(key=>commandFor(settings,key,mac)===id);
  const builtin=shortcuts.find(item=>item.id===id&&item.editorAction)?.key;
  if(builtin&&!applicationKeys[builtin]&&!keys.has(builtin)&&settings.keymap!=='vim')registered.push(builtin);
  return registered;
}
export const defaultKeyFor=id=>shortcuts.find(item=>item.id===id)?.key||'';
export const isMac=/Mac|iPhone|iPad/i.test(navigator.userAgentData?.platform||navigator.platform||'');
export function keyParts(key,mac) {
  const names=mac?{Ctrl:'⌘',Alt:'⌥',Shift:'⇧',Space:'Espaço'}:{Space:'Espaço'};
  return key.split('+').map(part=>names[part]||part);
}
