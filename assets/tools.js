import { icon } from './icons.js';
import { escapeHTML as h, makeProject, base, own } from './project.js';
import { audit } from './editor.js';
import { readExtension, installSnippets, importKeymap, extensionCard, extensionFeatures, codespaceURL } from './extensions.js';

export function createTools(ctx) {
  const { $,state,project,toast,head,button,showDialog,form,textField,confirm,renderSidebar,renderBottom,renderStatus,chooseBottom,activateFile,applySettings,queueSave,diff,addProject,replaceProject,saveFiles,refreshIssues,updateBreakpoints,current }=ctx;
  let capabilities=null, git=null, snippets=[], catalog=[], catalogTerm='', catalogError='';
  let extensionNotice='';
  const localHost=['127.0.0.1','localhost'].includes(location.hostname);
  let virtualOutput='KFEcode · Terminal do workspace\nDigite help para listar comandos.\n', testOutput='', testResult='', termNode, term, fit, termId='', termCursor=0, termPoll, terminalOpening;
  let debugId='', debugCursor=0, debugPoll, debugState=null, debugPause=null, debugOutput='', watches=[], watchResults=[], scopeRows=[], debugBusy=false;
  const btn=(label,action,glyph,value='')=>button(label,action,glyph,'data-value="'+h(value)+'"');
  const show=(id)=>{if(ctx.pane()===id)renderSidebar();};
  const showB=(id)=>{if(ctx.bottom()===id)renderBottom();};
  const linked=()=>capabilities&&project().localRoot===capabilities.root;
  const api=async (path,data,query='')=>{
    if(!capabilities&&path!=='capabilities')throw new Error('Abra o KFEcode pelo serviço local para usar esta ferramenta.');
    const endpoint=new URL('./api/'+path+query,location.href);
    const response=await fetch(endpoint,{method:data===undefined?'GET':'POST',headers:{...(capabilities?{'X-KFE-Token':capabilities.token}:{}),...(data!==undefined?{'Content-Type':'application/json'}:{})},body:data===undefined?undefined:JSON.stringify(data),cache:'no-store'});
    if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Serviço local indisponível.');
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Falha no serviço local.');
    return result;
  };
  const bridgeHint=()=>capabilities?'<p>Serviço local conectado.</p>'+(!linked()?btn('Abrir projeto local','local-open','folderopen'):'<p class="mono">'+h(capabilities.root)+'</p>'):'<p>Shell do sistema, Git e Inspector do Node.js requerem o serviço local.</p>';
  const output=()=>'<pre class="terminal-output">'+h(virtualOutput)+'</pre><form id="virtual-terminal" class="terminal-form"><span>$</span><input name="command" aria-label="Comando" autocomplete="off" spellcheck="false"></form>';
  async function refresh() {
    if(!capabilities) {
      if(!localHost)return;
      try {capabilities=await api('capabilities');}
      catch {return;}
    }
    if(linked())await refreshGit();
    if(ctx.pane()!=='files'&&ctx.pane()!=='search')renderSidebar();
  }
  function dirtyFiles() {const p=project();return Object.keys(p.files).filter(path=>JSON.stringify(p.files[path])!==JSON.stringify(p.saved[path]));}
  async function refreshGit() {
    if(!linked())return;
    git=await api('git/status');show('git');renderStatus();
  }
  async function localOpen() {
    const data=await api('project');
    const existing=state.workspaces.flatMap(item=>item.projects).find(item=>item.localRoot===capabilities.root);
    if(data.skipped)toast(data.skipped+' arquivo(s) ficaram fora por limite de tamanho.',true);
    if(existing?.id===project().id) {replaceProject(data);return;}
    const p=makeProject(data.name,'',data.files,data.folders);
    p.localRoot=capabilities.root;
    p.active=own(p.files,'index.html')?'index.html':Object.keys(p.files)[0]||'';
    p.open=p.active?[p.active]:[];
    addProject(p);toast('Projeto local aberto.');
  }
  async function saveLocal(p,names,files,folders) {
    if(!capabilities||p.localRoot!==capabilities.root)return false;
    await api('project/save',{files:Object.fromEntries(names.map(path=>[path,files[path]])),folders});
    refreshGit().catch(()=>{});return true;
  }
  async function moveLocal(p,from,to) {if(capabilities&&p.localRoot===capabilities.root)await api('project/move',{from,to,allowMissing:!own(p.saved,from)&&!Object.keys(p.saved).some(path=>path.startsWith(from+'/'))});}
  async function deleteLocal(p,path) {if(capabilities&&p.localRoot===capabilities.root)await api('project/delete',{path});}
  async function ensureDisk() {if(dirtyFiles().length)await saveFiles(true);}
  const body=markup=>'<div class="pane-body">'+markup+'</div>';
  function gitPane() {
    const drafts=dirtyFiles();
    let content='<h3>Rascunhos</h3>'+(drafts.length?drafts.map(path=>btn(path,'draft-diff','branch',path)).join(''):'<p>Nenhuma alteração desde o último salvamento.</p>');
    content+='<h3>Versões do workspace</h3>'+btn('Criar versão','snapshot','clock')+(project().snapshots.map(item=>btn(item.name,'snapshot-view','clock',item.id)).join(''));
    content+='<hr><h3>Git</h3>';
    if(!linked())return head('Controle de versão')+body(content+bridgeHint());
    if(!git?.available)return head('Controle de versão')+body(content+'<p>'+h(git?.reason||'Consultando repositório…')+'</p>'+btn('Inicializar Git','git-init','branch'));
    content+='<div class="row between"><span>'+icon('branch',14)+' '+h(git.branch)+'</span>'+btn('Atualizar','git-refresh','refresh')+'</div>'+
      '<form id="git-commit"><input name="message" placeholder="Mensagem do commit" aria-label="Mensagem do commit" required><div class="row">'+btn('Stage tudo','git-stage-all','plus')+'<button class="accent-button">Commit</button></div></form>'+
      '<div class="row">'+btn('Push','git-push','upload')+btn('Pull','git-pull','download')+btn('Branches','git-branches','branch')+btn('Remoto','git-remote','globe')+'</div>';
    if(git.files.length)content+='<h3>Alterações no Git</h3>'+git.files.map(item=>'<article class="extension-card"><p class="mono">'+h(item.status+' '+item.path)+'</p><div class="row">'+btn('Diff','git-diff','branch',item.path)+btn('Stage','git-stage','plus',item.path)+(item.status[0]!==' '&&item.status[0]!=='?'?btn('Unstage','git-unstage',null,item.path):'')+(item.conflict?btn('Resolver','git-conflict','warning',item.path):'')+'</div></article>').join('');
    content+=btn('Blame do arquivo atual','git-blame','clock');
    return head('Controle de versão')+body(content);
  }
  function debugPane() {
    const p=project();
    const points=Object.entries(p.breakpoints).flatMap(([path,lines])=>lines.map(line=>'<button class="list-button" data-action="location" data-value="'+h(path)+'" data-line="'+line+'">'+icon('bug',14)+'<span>'+h(path)+':'+line+'</span></button>'));
    let content='<h3>Pontos de interrupção</h3>'+(points.join('')||'<p>Clique na margem de um arquivo JavaScript ou pressione F9.</p>')+'<hr>';
    if(!capabilities)content+=bridgeHint();
    else {
      content+='<div class="row">'+(linked()?btn('Iniciar Node.js','debug-start','play'):'')+btn('Conectar Inspector','debug-attach','cloud')+'</div>';
      if(debugId)content+='<p>'+h(debugState||'Conectado')+'</p><div class="row">'+btn('Continuar','debug-command','play','resume')+btn('Pausar','debug-command','bug','pause')+btn('Encerrar','debug-stop','x')+'</div>';
    }
    content+=btn('Painel de depuração','debug-panel','bug');
    return head('Depuração')+body(content);
  }
  function extensionsPane() {
    const manifestLink='<a class="small-button" href="assets/extension-example.json" download>Manifesto de exemplo</a>';
    let content='<div class="row">'+btn('Importar VSIX / JSON','extension-file','upload')+manifestLink+'</div>'+
      '<p>O KFEcode aceita temas, snippets, alguns atalhos e comandos dos seus manifestos JSON.</p>'+
      '<article class="extension-card"><h3>Extensões do VS Code</h3><p>Abra um repositório no Codespaces para usar extensões executáveis no VS Code pelo navegador.</p>'+
      btn('Abrir no GitHub Codespaces','open-codespaces','external')+'</article>';
    if(extensionNotice)content+='<p role="status">'+h(extensionNotice)+'</p>';
    if(capabilities?.vscode)content+='<a class="small-button" href="'+h(capabilities.vscode)+'" target="_blank" rel="noopener noreferrer">'+icon('external',14)+'Abrir host VS Code</a>';
    else if(capabilities?.extensionCli)content+='<p>O instalador do host VS Code está habilitado neste computador.</p>';
    content+='<hr><h3>Open VSX</h3><form id="market-search"><input name="query" value="'+h(catalogTerm)+'" placeholder="Buscar extensões…" aria-label="Buscar extensões" required><button class="accent-button">Buscar no catálogo</button></form>';
    if(catalogError)content+='<p>'+h(catalogError)+'</p><a href="https://open-vsx.org/" target="_blank" rel="noopener noreferrer">Abrir Open VSX</a>';
    content+=catalog.map((item,index)=>'<article class="extension-card"><h3>'+h(item.displayName||item.name)+'</h3><p>'+h(item.description||item.namespace)+'</p><div class="row">'+btn('Importar pacote','market-install','download',String(index))+'</div></article>').join('');
    const installed=[], incompatible=[];
    for(const item of state.extensions){
      const features=extensionFeatures(item,{shell:linked()});
      (features.length?installed:incompatible).push(extensionCard(item,button,features));
    }
    content+='<hr><h3>Instaladas no KFEcode</h3>'+(installed.join('')||'<p>Nenhuma extensão instalada.</p>');
    if(incompatible.length)content+='<h3>Importações anteriores incompatíveis</h3>'+incompatible.join('');
    return head('Extensões')+body(content);
  }
  function openCodespaces() {
    form('Abrir no GitHub Codespaces',
      '<p class="muted">O GitHub abre o editor VS Code em outra aba. Se seu projeto só existe no workspace do KFEcode, exporte-o e envie os arquivos ao repositório primeiro.</p>'+
      textField('repo','Repositório GitHub','','required placeholder="usuario/repositorio" spellcheck="false"'),
      data=>window.open(codespaceURL(String(data.get('repo'))),'_blank','noopener,noreferrer'),'Abrir no GitHub');
  }
  function pane(id) {
    return ({git:gitPane,debug:debugPane,extensions:extensionsPane}[id]||(()=>head(id)))();
  }
  function localSettings() {return bridgeHint();}
  function terminalMarkup() {
    if(!capabilities)return output();
    if(!linked())return '<p class="muted">Vincule a pasta local para executar comandos de sistema.</p>'+btn('Abrir projeto local','local-open','folderopen');
    if(termNode)return '';
    return '<p class="muted">Abra uma sessão de shell na pasta vinculada.</p><div class="row">'+btn('Abrir shell','terminal-open','terminal')+btn('Executar tarefa','task-list','bolt')+btn('Dependências','deps','extensions')+'</div>';
  }
  function renderTerminal(el) {
    if(termNode&&linked()){
      if(termNode.parentNode!==el){el.replaceChildren(termNode);requestAnimationFrame(()=>fit?.fit());}
    } else if(el.innerHTML!==terminalMarkup())el.innerHTML=terminalMarkup();
  }
  function detectedTests() {
    const paths=Object.keys(project().files);
    const files=paths.filter(path=>/(?:^|\/)(?:__tests__|tests?)\/[^/]+|\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)test_[^/]+\.py$|Tests?\.java$/i.test(path));
    let npmTest=false;
    try {npmTest=Boolean(JSON.parse(project().files['package.json']||'{}').scripts?.test);}catch{}
    const has=path=>paths.includes(path);
    const runner=npmTest?'npm test':has('pytest.ini')||files.some(path=>path.endsWith('.py'))?'python -m pytest':has('pom.xml')?'mvn test':paths.some(path=>path.endsWith('.csproj'))?'dotnet test':'node --test';
    return {files,command:project().testCommand||runner};
  }
  function testMarkup() {
    const detected=detectedTests();
    const controls=linked()?btn('Executar testes','tests-run','play')+btn('Configurar comando','tests-config','settings'):'';
    return '<div class="row">'+btn('Auditoria web','tests-audit','check')+controls+'</div>'+
      (!linked()?'<p class="muted">Executores como Jest e PyTest requerem o serviço local.</p>':'')+
      (testResult?'<div class="log-row '+(testResult==='Falhou'?'error':'ok')+'">'+icon(testResult==='Falhou'?'alert':'check',13)+'<span>'+h(testResult)+'</span></div>':'')+
      (testOutput?'<pre class="terminal-output">'+h(testOutput)+'</pre>':'<p class="muted">'+h(detected.command)+' · '+detected.files.length+' arquivo(s) de teste identificado(s)</p>'+detected.files.slice(0,30).map(path=>'<button class="list-button" data-action="file" data-value="'+h(path)+'">'+icon('flask',13)+h(path)+'</button>').join(''));
  }
  function debugMarkup() {
    if(!capabilities)return '<p class="muted">Use as ferramentas de desenvolvedor do navegador para inspecionar o JavaScript da prévia. O Inspector do Node.js requer o serviço local.</p>';
    let content='<div class="row">'+btn('Iniciar','debug-start','play')+btn('Conectar','debug-attach','cloud')+
      (debugId?btn('Continuar','debug-command','play','resume')+btn('Pular','debug-command',null,'stepOver')+btn('Entrar','debug-command',null,'stepInto')+btn('Sair','debug-command',null,'stepOut')+btn('Parar','debug-stop','x'):'')+
      (debugPause?btn('Inspecionar expressão','debug-watch','search'):'')+'</div>';
    if(debugState)content+='<p class="muted">'+h(debugState)+'</p>';
    if(debugPause) {
      content+='<h4>Pilha de chamadas</h4>'+debugPause.frames.map(frame=>'<button class="list-button" data-action="debug-frame" data-value="'+h(frame.id)+'">'+icon('code',13)+h(frame.name)+' · '+h(frame.path)+':'+frame.line+'</button>').join('');
      content+='<h4>Escopos e variáveis</h4><pre class="terminal-output">'+h(scopeRows.map(row=>row.label+'\n'+row.items.map(item=>'  '+item.name+' = '+item.value).join('\n')).join('\n'))+'</pre>';
      if(watches.length)content+='<h4>Watch</h4>'+watchResults.map(({expression,value})=>'<div class="row">'+btn('×','debug-unwatch',null,expression)+'<span>'+h(expression)+' = '+h(value)+'</span></div>').join('');
    }
    if(debugOutput)content+='<pre class="terminal-output">'+h(debugOutput)+'</pre>';
    return content;
  }
  function renderBottomPanel(id,el) {
    if(id==='terminal'){renderTerminal(el);return;}
    const markup=id==='debugger'?debugMarkup():testMarkup();
    if(el.innerHTML!==markup)el.innerHTML=markup;
  }
  function leaveBottom(id) {if(id==='terminal'&&termNode)termNode.remove();}
  async function activateBottom(id) {
    if(id==='terminal'&&term)requestAnimationFrame(()=>fit?.fit());
  }
  async function activate(id) {if(id==='git'&&linked())await refreshGit();if(id==='extensions')refreshSnippets();}
  function detachProject() {
    if(termId)api('terminal/close',{id:termId}).catch(()=>{});
    clearInterval(termPoll);term?.dispose();termNode?.remove();term=null;termNode=null;termId='';fit=null;
    if(debugId)api('debug/close',{id:debugId}).catch(()=>{});
    clearInterval(debugPoll);debugId='';debugPause=null;debugState=null;debugOutput='';scopeRows=[];watchResults=[];git=null;
  }
  function refreshSnippets() {
    const monaco=ctx.monaco();
    if(!monaco)return;
    snippets.forEach(item=>item.dispose());
    snippets=installSnippets(monaco,state.extensions);
  }
  function extensionTheme() {
    const configured=state.settings.extensionTheme;
    return configured&&state.extensions.find(item=>item.enabled&&item.id===configured.id)?.themes[configured.index];
  }
  async function installFile(file,askHost=true) {
    const item=await readExtension(file);
    const features=extensionFeatures(item,{shell:linked()});
    if(features.length){
      const index=state.extensions.findIndex(other=>other.id===item.id);
      if(index<0)state.extensions.push(item);else state.extensions[index]=item;
      refreshSnippets();applySettings();queueSave();
      extensionNotice=item.name+' · Disponível: '+features.join(', ')+'.';
      if(item.runtime)extensionNotice+=' A parte executável requer um host VS Code.';
    }else{
      extensionNotice=item.name+' · '+(item.runtime
        ?'A parte executável precisa de um host VS Code. Use o Codespaces para abrir seu repositório.'
        :'Este pacote não oferece recursos compatíveis com o KFEcode neste ambiente.');
    }
    show('extensions');
    if(item.runtime&&capabilities?.extensionCli&&askHost&&/\.vsix$/i.test(file.name)) {
      confirm('Instalar no host VS Code?',item.name+' pode executar código no host local. Confirme para instalar o pacote nesse ambiente.',async()=>{
        const bytes=new Uint8Array(await file.arrayBuffer());
        let encoded='';for(let i=0;i<bytes.length;i+=16384)encoded+=String.fromCharCode(...bytes.subarray(i,i+16384));
        await api('extensions/install',{vsix:btoa(encoded)});toast('Extensão instalada no host VS Code.');
      },'Instalar no host');
    }
  }
  function runExtensionCommand(item,index) {
    const command=item?.enabled&&item.insertions?.[index];
    if(!command)return;
    const editor=ctx.editor();
    const model=editor?.getModel();
    if(!model)throw new Error('Abra um arquivo para usar este comando.');
    if(command.language&&command.language!==model.getLanguageId())throw new Error('Abra um arquivo '+command.language+' para usar este comando.');
    const selection=editor.getSelection();
    if(!selection)return;
    editor.pushUndoStop();
    editor.executeEdits('kfecode-extension',[{range:selection,text:command.text,forceMoveMarkers:true}]);
    editor.pushUndoStop();
    editor.focus();
  }
  function searchCatalog(term) {
    catalogTerm=term;catalogError='';catalog=[];
    const url=new URL('https://open-vsx.org/api/-/search');
    url.searchParams.set('query',term);url.searchParams.set('size','15');
    return (capabilities?api('extensions/search',{query:term}):fetch(url,{signal:AbortSignal.timeout(12000)}).then(response=>{if(!response.ok)throw new Error('Catálogo indisponível.');return response.json();})).then(data=>{
      catalog=data.extensions||[];if(!catalog.length)catalogError='Nenhuma extensão encontrada.';
    }).catch(error=>{catalogError=error.message+' Você também pode importar um arquivo VSIX.';}).finally(()=>show('extensions'));
  }
  async function installMarket(index) {
    const item=catalog[index];
    if(!item?.files?.download)throw new Error('Pacote sem download disponível.');
    const url=new URL(item.files.download);
    if(url.protocol!=='https:'||url.hostname!=='open-vsx.org')throw new Error('Endereço de pacote inválido.');
    let file;
    if(capabilities){
      const data=await api('extensions/download',{url:url.href});
      const bytes=Uint8Array.from(atob(data.data),char=>char.charCodeAt(0));
      file=new File([bytes],item.name+'.vsix');
    }else{
      const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error('Falha no download do pacote.');
      file=new File([await response.blob()],item.name+'.vsix');
    }
    await installFile(file);
  }
  async function gitWrite(operation,data={},reload=false) {
    if(!linked())throw new Error('Abra o projeto local para operar o Git.');
    try {await api('git/'+operation,data);} catch(error){await refreshGit().catch(()=>{});throw error;}
    if(reload)replaceProject(await api('project'));else await refreshGit();
    toast('Git · '+({init:'repositório inicializado',stage:'arquivos preparados',unstage:'arquivos removidos do stage',commit:'commit criado',push:'push concluído',pull:'pull concluído',branch:'branch criada',checkout:'branch alterada',remote:'remoto atualizado',resolve:'conflito resolvido'})[operation]+'.');
  }
  function reloadGit(operation,data) {
    const run=()=>gitWrite(operation,data,true);
    if(dirtyFiles().length)confirm('Atualizar projeto pelo Git?','Há rascunhos locais. Salve-os antes de atualizar o projeto ou confirme para substituir os rascunhos pela cópia do disco.',run,'Atualizar');
    else return run();
  }
  async function gitDiff(path) {
    const data=await api('git/diff',{path});
    diff(path,data.before,data.after,'Diferenças do Git');
  }
  async function gitConflict(path) {
    const data=await api('git/conflict',{path});
    form('Resolver conflito · '+base(path),'<label>Escolher versão<select name="side"><option value="ours">Nossa versão</option><option value="theirs">Versão recebida</option><option value="manual">Editar manualmente</option></select></label><label>Conteúdo final para resolução manual<textarea name="text" rows="12">'+h(data.current)+'</textarea></label><details><summary>Nossa versão</summary><pre class="conflict-code">'+h(data.ours)+'</pre></details><details><summary>Versão recebida</summary><pre class="conflict-code">'+h(data.theirs)+'</pre></details>',async values=>gitWrite('resolve',{path,side:values.get('side'),text:values.get('text')},true),'Resolver');
  }
  async function gitBranches() {
    const data=await api('git/branches');
    form('Branches Git','<label>Branch existente<select name="branch">'+data.branches.map(branch=>'<option '+(branch===git?.branch?'selected ':'')+'value="'+h(branch)+'">'+h(branch)+'</option>').join('')+'</select></label>'+textField('new','Ou criar nova branch','','placeholder="feature/minha-ideia"'),async values=>{
      const next=String(values.get('new')).trim(), branch=String(values.get('branch'));
      if(next)await gitWrite('branch',{name:next});
      else if(branch!==git?.branch)await reloadGit('checkout',{name:branch});
    },'Aplicar');
  }
  function runVirtual(input) {
    const [command,...args]=input.trim().split(/\s+/);
    virtualOutput+='$ '+input+'\n';
    if(command==='clear')virtualOutput='';
    else if(command==='help')virtualOutput+='help, pwd, ls, cat <arquivo>, clear\n';
    else if(command==='pwd')virtualOutput+='/'+project().name+'\n';
    else if(command==='ls')virtualOutput+=[...project().folders.map(item=>item+'/'),...Object.keys(project().files)].join('\n')+'\n';
    else if(command==='cat') {
      const file=project().files[args.join(' ')];
      virtualOutput+=(typeof file==='string'?file:'Arquivo de texto não encontrado.')+'\n';
    }else if(command)virtualOutput+='Comando de sistema. Inicie o serviço local para executá-lo.\n';
    virtualOutput=virtualOutput.slice(-50000);showB('terminal');$('#virtual-terminal input')?.focus();
  }
  async function openTerminal() {
    if(terminalOpening)return terminalOpening;
    if(termNode)return;
    terminalOpening=(async()=>{
      await ensureDisk();
      const [{default:Terminal},{default:FitAddon}]=await Promise.all([import('./vendor/xterm.js'),import('./vendor/fit.js')]);
      term=new Terminal({cursorBlink:true,fontFamily:'JetBrains Mono, monospace',fontSize:12,theme:{background:'#0e111c',foreground:'#dfe4fb'},convertEol:false,scrollback:1500});
      fit=new FitAddon();term.loadAddon(fit);termNode=document.createElement('div');termNode.className='terminal-screen';
      showB('terminal');term.open(termNode);fit.fit();
      const {id}=await api('terminal/open',{cols:term.cols,rows:term.rows});
      termId=id;termCursor=0;
      term.onData(data=>api('terminal/input',{id,data}).catch(error=>toast(error.message,true)));
      term.onResize(({cols,rows})=>api('terminal/resize',{id,cols,rows}).catch(()=>{}));
      const resize=new ResizeObserver(()=>{if(termNode?.isConnected)fit?.fit();});resize.observe(termNode);
      term.onDispose?.(()=>resize.disconnect());
      let pending=false;
      const poll=async()=>{
        if(pending||termId!==id)return;
        pending=true;
        try{
          const data=await api('terminal/poll',undefined,'?id='+encodeURIComponent(id)+'&cursor='+termCursor);
          termCursor=data.cursor;if(data.output&&termId===id)term.write(data.output);
          if(data.ended){clearInterval(termPoll);term?.write('\r\n[Sessão encerrada]\r\n');}
        }catch(error){clearInterval(termPoll);term?.writeln(error.message);}
        finally{pending=false;}
      };
      termPoll=setInterval(poll,140);poll();term.focus();
    })();
    try{await terminalOpening;}catch(error){term?.dispose();termNode?.remove();term=null;termNode=null;showB('terminal');throw error;}finally{terminalOpening=null;}
  }
  async function runTask(command,label) {
    if(!linked())throw new Error('Abra o projeto local para executar comandos.');
    await ensureDisk();chooseBottom('tests');testOutput=label+'\n';testResult='Executando…';showB('tests');
    try{
      const data=await api('task',{command});testOutput=data.output||'Sem saída.';testResult=data.code===0?'Concluído':'Falhou';
    }catch(error){testOutput=error.message;testResult='Falhou';}
    showB('tests');
  }
  function taskList() {
    let scripts={};
    try {scripts=JSON.parse(project().files['package.json']||'{}').scripts||{};}catch{}
    const tasks=state.extensions.filter(item=>item.enabled).flatMap(item=>item.tasks);
    form('Executar tarefa','<label>Tarefa<select name="task"><option value="">Comando personalizado</option>'+Object.keys(scripts).map(name=>'<option value="'+h('npm run '+quoteShell(name))+'">'+h('npm run '+name)+'</option>').join('')+tasks.map(task=>'<option value="'+h(task.command)+'">'+h(task.label)+'</option>').join('')+'</select></label>'+textField('command','Comando','','placeholder="npm run build ou make"'),async data=>{
      const command=String(data.get('task')||data.get('command')).trim();if(!command)throw new Error('Informe um comando.');await runTask(command,'Tarefa');
    },'Executar');
  }
  function quoteShell(value) {
    if(!/^[a-zA-Z0-9_./:@+-]+$/.test(value))throw new Error('Use um nome de script ou pacote sem espaços ou caracteres de shell.');
    return value;
  }
  function dependencies() {
    const managers={npm:['install','uninstall','update'],pip:['install','uninstall','install -U'],maven:['dependency:resolve'],nuget:['install','update'],composer:['require','remove','update']};
    form('Dependências','<label>Gerenciador<select name="manager">'+Object.keys(managers).map(name=>'<option>'+name+'</option>').join('')+'</select></label><label>Ação<select name="mode"><option value="0">Instalar / resolver</option><option value="1">Remover</option><option value="2">Atualizar</option></select></label>'+textField('package','Pacote','','placeholder="exemplo: lodash"'),async data=>{
      const manager=String(data.get('manager')), mode=Number(data.get('mode')), subcommand=managers[manager][mode];
      if(!subcommand)throw new Error('Essa ação é feita pelo comando de projeto do gerenciador selecionado.');
      const name=String(data.get('package')).trim();
      const executable=manager==='maven'?'mvn':manager;
      await runTask(executable+' '+subcommand+(name?' '+quoteShell(name):'')+(manager==='pip'&&mode===1?' -y':''),'Dependências');
    },'Executar');
  }
  async function syncBreakpoints() {
    if(debugId)await api('debug/breakpoints',{id:debugId,breakpoints:project().breakpoints});
  }
  async function inspect(frame=debugPause?.frames[0]?.id) {
    if(!frame||!debugId)return;
    const id=debugId;
    const data=await api('debug/inspect',{id,frame,watches});
    if(id!==debugId)return;
    scopeRows=data.scopes;watchResults=data.watches;showB('debugger');
  }
  function monitorDebug(id) {
    debugId=id;debugCursor=0;debugState='Inspector conectado.';debugOutput='';debugPause=null;
    chooseBottom('debugger');show('debug');showB('debugger');
    let pending=false;
    const poll=async()=>{
      if(pending||debugId!==id)return;
      pending=true;
      try{
        const data=await api('debug/poll',undefined,'?id='+encodeURIComponent(id)+'&cursor='+debugCursor);
        if(debugId!==id)return;
        debugCursor=data.cursor;
        let update=false;
        for(const event of data.events) {
          update=true;
          if(event.type==='output')debugOutput=(debugOutput+event.text).slice(-40000);
          if(event.type==='paused'){
            debugPause=event;debugState='Execução pausada · '+event.reason;
            const top=event.frames[0];
            if(top?.path&&own(project().files,top.path))activateFile(top.path,{line:top.line,focus:false});
            updateBreakpoints(top?.path,top?.line);
            await inspect(top?.id).catch(()=>{});
          }
          if(event.type==='resumed'){
            debugPause=null;debugState='Executando…';scopeRows=[];watchResults=[];updateBreakpoints();
          }
          if(event.type==='ended'){
            debugId='';debugPause=null;debugState='Sessão encerrada.';clearInterval(debugPoll);updateBreakpoints();
          }
        }
        if(update){show('debug');showB('debugger');}
      }catch(error){debugState=error.message;debugId='';clearInterval(debugPoll);showB('debugger');}
      finally{pending=false;}
    };
    clearInterval(debugPoll);debugPoll=setInterval(poll,180);poll();
  }
  async function debugStart() {
    if(!linked())throw new Error('Abra o projeto local antes de iniciar o depurador.');
    if(debugId||debugBusy)throw new Error('Encerre a sessão de depuração em andamento.');
    const scripts=Object.keys(project().files).filter(path=>/\.[cm]?js$/i.test(path));
    if(!scripts.length)throw new Error('Crie um arquivo JavaScript para depurar.');
    form('Depurar JavaScript no Node.js','<p class="muted">Selecione um script para executar no Node.js. Para código com DOM, use as ferramentas de desenvolvimento do navegador.</p><label>Script<select name="path">'+scripts.map(path=>'<option '+(path===current()?'selected ':'')+'value="'+h(path)+'">'+h(path)+'</option>').join('')+'</select></label>',async data=>{
      debugBusy=true;
      try{
        await ensureDisk();
        const {id}=await api('debug/start',{path:data.get('path'),breakpoints:project().breakpoints});
        monitorDebug(id);
      }finally{debugBusy=false;}
    },'Iniciar depuração');
  }
  function debugAttach() {
    if(!capabilities)throw new Error('Abra o KFEcode pelo serviço local para conectar o Inspector.');
    if(debugId||debugBusy)throw new Error('Encerre a sessão de depuração em andamento.');
    form('Conectar ao Inspector','<p class="muted">Use uma porta local publicada pelo contêiner ou encaminhada por SSH. Informe o caminho remoto do projeto para mapear arquivos e breakpoints.</p>'+textField('port','Porta local','9229','type="number" min="1" max="65535" required')+textField('root','Raiz remota (opcional)','','placeholder="/app"'),async values=>{
      debugBusy=true;
      try{
        const {id}=await api('debug/attach',{port:Number(values.get('port')),root:String(values.get('root')).trim(),breakpoints:project().breakpoints});
        monitorDebug(id);
      }finally{debugBusy=false;}
    },'Conectar');
  }
  async function stopDebug() {
    if(!debugId)return;
    await api('debug/close',{id:debugId});
    clearInterval(debugPoll);debugId='';debugPause=null;debugState='Sessão encerrada.';scopeRows=[];watchResults=[];updateBreakpoints();show('debug');showB('debugger');
  }
  async function action(id,value,element) {
    switch(id) {
      case 'local-open':
        if(linked()&&dirtyFiles().length)confirm('Recarregar arquivos locais?','Confirme para substituir os rascunhos pela versão do disco.',localOpen,'Recarregar');
        else await localOpen();break;
      case 'draft-diff':diff(value,project().saved[value],project().files[value]);break;
      case 'snapshot':
        form('Criar versão do workspace',textField('name','Nome da versão','','required'),data=>{
          const p=project(),name=String(data.get('name')).trim();
          if(!name)throw new Error('Digite um nome para a versão.');
          p.snapshots.unshift({id:crypto.randomUUID(),name,files:structuredClone(p.files),at:Date.now()});
          queueSave();show('git');toast('Versão criada.');
        },'Criar versão');break;
      case 'snapshot-view':{
        const item=project().snapshots.find(item=>item.id===value);
        const paths=[...new Set([...Object.keys(item.files),...Object.keys(project().files)])];
        showDialog('Versão · '+item.name,'<div class="dialog-body"><p class="muted">'+h(new Date(item.at).toLocaleString('pt-BR'))+'</p>'+paths.filter(path=>typeof(item.files[path]??project().files[path])==='string').map(path=>button(path,'snapshot-diff','branch','data-value="'+h(path)+'" data-snapshot="'+h(value)+'"')).join('')+'</div>');
        break;
      }
      case 'snapshot-diff':diff(value,project().snapshots.find(item=>item.id===element.dataset.snapshot).files[value],project().files[value],'Versão do workspace');break;
      case 'git-refresh':await refreshGit();break;
      case 'git-init':await gitWrite('init');break;
      case 'git-stage-all':await ensureDisk();await gitWrite('stage',{all:true});break;
      case 'git-stage':await ensureDisk();await gitWrite('stage',{path:value});break;
      case 'git-unstage':await gitWrite('unstage',{path:value});break;
      case 'git-push':await gitWrite('push');break;
      case 'git-pull':await reloadGit('pull',{});break;
      case 'git-branches':await gitBranches();break;
      case 'git-diff':await gitDiff(value);break;
      case 'git-conflict':await gitConflict(value);break;
      case 'git-remote':{
        const {url}=await api('git/remote');
        form('Remoto origin',textField('url','URL do GitHub, GitLab ou outro Git',url,'required'),data=>gitWrite('remote',{url:data.get('url')}),'Salvar remoto');break;
      }
      case 'git-blame':{
        const path=current();if(!path)throw new Error('Abra um arquivo para consultar seu histórico.');
        const data=await api('git/blame',{path});
        showDialog('Histórico por linha · '+base(path),'<div class="dialog-body"><pre class="conflict-code">'+h(data.output)+'</pre></div>',{wide:true});break;
      }
      case 'terminal-open':await openTerminal();break;
      case 'terminal-restart':if(termId)await api('terminal/close',{id:termId});clearInterval(termPoll);term?.dispose();termNode?.remove();term=null;termNode=null;termId='';fit=null;await openTerminal();break;
      case 'task-list':taskList();break;
      case 'deps':dependencies();break;
      case 'tests-audit':{
        const items=audit(project());
        refreshIssues();testOutput=items.map(item=>item.path+':'+item.line+'  '+item.message).join('\n');
        testResult=items.length?items.length+' apontamento(s) na auditoria.':'Auditoria concluída sem apontamentos.';
        showB('tests');break;
      }
      case 'tests-run':await runTask(detectedTests().command,'Testes');break;
      case 'tests-config':form('Configurar testes',textField('command','Comando',detectedTests().command,'required'),data=>{project().testCommand=String(data.get('command')).trim();queueSave();},'Salvar comando');break;
      case 'debug-panel':chooseBottom('debugger');break;
      case 'debug-start':await debugStart();break;
      case 'debug-attach':debugAttach();break;
      case 'debug-stop':await stopDebug();break;
      case 'debug-command':if(debugId)await api('debug/command',{id:debugId,command:value});break;
      case 'debug-frame':{
        const frame=debugPause?.frames.find(item=>item.id===value);
        if(frame?.path&&own(project().files,frame.path))activateFile(frame.path,{line:frame.line,focus:false});
        await inspect(value);break;
      }
      case 'debug-watch':
        form('Inspecionar expressão',textField('expr','Expressão JavaScript','','required placeholder="minhaVariavel"'),async data=>{
          const value=String(data.get('expr')).trim();if(value&&!watches.includes(value))watches.push(value);
          await inspect();
        },'Inspecionar');break;
      case 'debug-unwatch':watches=watches.filter(item=>item!==value);await inspect();break;
      case 'extension-file':$('#extension-import').click();break;
      case 'open-codespaces':openCodespaces();break;
      case 'extension-command':runExtensionCommand(state.extensions.find(item=>item.id===value),Number(element.dataset.index));break;
      case 'market-install':await installMarket(Number(value));break;
      case 'extension-toggle':{
        const extension=state.extensions.find(item=>item.id===value);extension.enabled=!extension.enabled;
        applySettings();refreshSnippets();queueSave();show('extensions');break;
      }
      case 'extension-remove':
        state.extensions=state.extensions.filter(item=>item.id!==value);
        if(state.settings.extensionTheme?.id===value)delete state.settings.extensionTheme;
        applySettings();refreshSnippets();queueSave();show('extensions');break;
      case 'extension-keymap':{
        const item=state.extensions.find(item=>item.id===value);
        const count=importKeymap(item,state.settings);queueSave();ctx.renderShortcutHints();toast(count+' atalho(s) compatível(is) aplicado(s).');break;
      }
      case 'extension-theme':state.settings.extensionTheme={id:value,index:Number(element.dataset.index)};applySettings();queueSave();show('extensions');break;
    }
  }
  function submit(event) {
    const id=event.target.id;
    if(!['virtual-terminal','git-commit','market-search'].includes(id))return;
    event.preventDefault();
    const data=new FormData(event.target);
    if(id==='virtual-terminal')runVirtual(String(data.get('command')));
    if(id==='git-commit')gitWrite('commit',{message:String(data.get('message'))}).catch(error=>toast(error.message,true));
    if(id==='market-search')searchCatalog(String(data.get('query')).trim());
  }
  function change(event) {
    if(event.target.id!=='extension-import')return;
    const file=event.target.files[0];event.target.value='';
    if(file)installFile(file).catch(error=>toast(error.message,true));
  }
  return {pane,localSettings,refresh,hasShell:()=>Boolean(linked()),branch:()=>git?.branch||'Workspace',renderBottom:renderBottomPanel,leaveBottom,activateBottom,activate,action,submit,change,saveLocal,moveLocal,deleteLocal,detachProject,extensionTheme,refreshSnippets,syncBreakpoints,paused:()=>debugPause?.frames[0]};
}
