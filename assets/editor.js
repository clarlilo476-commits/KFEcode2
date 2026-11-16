import { language, ext, escapeHTML } from './project.js';

export const themes = {
  night:{ name:'Azul Noturno', palette:['#12161d','#78adf3'], editor:'#12161d', numbers:'#8491a3', current:'#192332', foreground:'#e2e8f0', bracket:'#7fb7ff', base:'vs-dark' },
  studio:{ name:'macOS Claro', palette:['#f1f4fb','#337af3'], editor:'#fbfcff', numbers:'#7c88a2', current:'#eef3fd', foreground:'#263450', bracket:'#2668ce', base:'vs' },
  studioDark:{ name:'macOS Escuro', palette:['#242833','#7aa9fb'], editor:'#232733', numbers:'#7b879f', current:'#30394a', foreground:'#e9effe', bracket:'#8ab6ff', base:'vs-dark' },
  paper:{ name:'Branco e preto', palette:['#ffffff','#282833'], editor:'#ffffff', numbers:'#737680', current:'#f0f0f5', foreground:'#22242c', bracket:'#32323c', base:'vs' },
  ember:{ name:'Preto e laranja', palette:['#12100e','#e98745'], editor:'#1a1511', numbers:'#906f56', current:'#2a211a', foreground:'#ffe9d2', bracket:'#ffab6e', base:'vs-dark' },
  mono:{ name:'Preto e branco', palette:['#111111','#e1e1e1'], editor:'#161616', numbers:'#767676', current:'#242424', foreground:'#f0f0f0', bracket:'#dedede', base:'vs-dark' },
  ambient:{ name:'Ambient Light', palette:['#0e2429','#59e0cb'], editor:'#101c25', numbers:'#597780', current:'#1b303b', foreground:'#e3f8f9', bracket:'#66e6d7', base:'vs-dark' },
};
export async function loadMonaco() {
  if (!window.require?.config) throw new Error('O motor Monaco não foi carregado.');
  const root=new URL('./vendor/monaco/vs',import.meta.url).href;
  window.require.config({paths:{vs:root}});
  const monaco=await new Promise((resolve,reject)=>window.require(['vs/editor/editor.main'],()=>resolve(window.monaco),reject));
  const defaults=monaco.languages.typescript.javascriptDefaults;
  const types=monaco.languages.typescript;
  defaults.setCompilerOptions({target:types.ScriptTarget.ESNext, module:types.ModuleKind.ESNext, allowNonTsExtensions:true, allowJs:true, checkJs:true, moduleResolution:types.ModuleResolutionKind.NodeJs, resolveJsonModule:true, lib:['esnext','dom','dom.iterable'], noEmit:true});
  defaults.setEagerModelSync(true);
  return monaco;
}
export function applyTheme(monaco,name,extension) {
  document.documentElement.dataset.theme=themes[name]?name:'night';
  if (!monaco) return;
  const theme=themes[name] || themes.night;
  const dark=theme.base==='vs-dark';
  const token=(color, scope)=>({token:scope,foreground:color.replace('#','')});
  const palette=dark ? {tag:'#83b4f5',attribute:'#acc9ee',string:'#a8d2b0',delimiter:'#98a8bc',comment:'#8292a7',keyword:'#7ec9db',number:'#edb88f'} : {tag:'#205897',attribute:'#34638a',string:'#117048',delimiter:'#4f5472',comment:'#656e81',keyword:'#08647a',number:'#a5551c'};
  if(name==='mono') Object.assign(palette,{tag:'#ededed',attribute:'#c7c7c7',string:'#dedede',delimiter:'#929292',comment:'#858585',keyword:'#ffffff',number:'#bbbbbb'});
  if(name==='ember') Object.assign(palette,{tag:'#ffc19b',attribute:'#eab27c',string:'#afd7a2',delimiter:'#a08876',comment:'#9b806b',keyword:'#ffa878'});
  const rules=[token(palette.tag,'tag'),token(palette.attribute,'attribute.name'),token(palette.string,'attribute.value'),token(palette.string,'string'),token(palette.delimiter,'delimiter'),token(palette.comment,'comment'),token(palette.keyword,'keyword'),token(palette.number,'number'),token(palette.attribute,'key'),token(palette.tag,'metatag')];
  const colors={
    'editor.background':theme.editor,'editor.foreground':theme.foreground,'editorLineNumber.foreground':theme.numbers,'editorLineNumber.activeForeground':theme.bracket,
    'editor.lineHighlightBackground':theme.current,'editor.lineHighlightBorder':'#00000000','editorCursor.foreground':theme.bracket,'editorIndentGuide.background1':theme.current,
    'editorIndentGuide.activeBackground1':theme.numbers,'minimap.background':theme.editor,'scrollbar.shadow':'#00000000',
    'editor.selectionBackground':theme.bracket+'45','editor.inactiveSelectionBackground':theme.bracket+'28',
    'editorBracketHighlight.foreground1':theme.bracket,'editorBracketHighlight.foreground2':palette.number,
    'editorBracketHighlight.foreground3':palette.string,'editorBracketHighlight.foreground4':palette.attribute,
    'editorBracketHighlight.foreground5':palette.keyword,'editorBracketHighlight.foreground6':palette.tag,
    'editorGutter.background':theme.editor,'editorBracketMatch.background':theme.bracket+'24','editorBracketMatch.border':theme.bracket+'67',
    'editorWidget.background':theme.current,'editorWidget.border':theme.numbers,'editorSuggestWidget.background':theme.current,
  };
  if(extension) {
    Object.assign(colors,extension.colors);
    for (const value of extension.tokenColors || []) {
      const scopes=Array.isArray(value.scope)?value.scope:String(value.scope || '').split(',');
      if (typeof value.settings?.foreground!=='string') continue;
      for (const scope of scopes) {
        const key=scope.trim().split(/[. ]/)[0];
        if (key) rules.push(token(value.settings.foreground,key));
      }
    }
  }
  monaco.editor.defineTheme('kfecode',{base:theme.base,inherit:true,rules,colors});
  monaco.editor.setTheme('kfecode');
}
export function options(settings) {
  return {
    automaticLayout:true, fontFamily:settings.family+', monospace',fontSize:Number(settings.font),lineHeight:Math.round(Number(settings.font)*1.72),fontLigatures:settings.ligatures,
    minimap:{enabled:settings.minimap,renderCharacters:true,scale:1,maxColumn:90,size:'proportional',showSlider:'mouseover'},
    wordWrap:settings.wrap?'on':'off', glyphMargin:true, folding:true, lineNumbersMinChars:3, lineDecorationsWidth:11,
    renderLineHighlight:'all', padding:{top:6,bottom:16}, overviewRulerLanes:1, scrollBeyondLastLine:false, bracketPairColorization:{enabled:true},
    guides:{indentation:true,bracketPairs:false}, smoothScrolling:true, stickyScroll:{enabled:false},
    multiCursorModifier:'alt', rulers:[], accessibilitySupport:'auto', scrollbar:{verticalScrollbarSize:8,horizontalScrollbarSize:8},
    suggest:{showWords:true}, suggestOnTriggerCharacters:true, tabCompletion:'on',
  };
}
export function outline(source, path) {
  if (typeof source!=='string') return [];
  const result=[];
  const kind=language(path).id;
  const matches = kind==='html'? /<([a-z][\w-]*)([^>]*)>/gi : kind==='css' ? /^\s*([^{}\/][^{]+)\{/gm : /\b(?:function|class)\s+([A-Za-z_$][\w$]*)|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  for (const item of source.matchAll(matches)) {
    let name=item[1] || item[2];
    if(kind==='html') {
      if(!['html','head','body','main','nav','section','article','footer','header','aside','form','script','style'].includes(name.toLowerCase()) && !item[2].includes('id=')) continue;
      const value=item[2].match(/\bid=['"]([^'"]+)['"]/);
      const cls=item[2].match(/\bclass=['"]([^'"]+)['"]/);
      name='<'+name+(value?' #'+value[1]:cls?' .'+cls[1].split(' ')[0]:'')+'>';
    }
    result.push({name:name.trim().replace(/\s+/g,' '),line:source.slice(0,item.index).split('\n').length});
  }
  return result.slice(0,70);
}
export function audit(project) {
  const issues=[];
  const add=(path,line,message,severity='warn')=>issues.push({path,line,message,severity,source:'Auditoria web'});
  for (const [path,content] of Object.entries(project.files)) {
    if(typeof content!=='string') continue;
    const lines=content.split('\n');
    if(['html','htm'].includes(ext(path))) {
      if (!/<title[\s>]/i.test(content)) add(path,1,'Adicione um título de página.');
      lines.forEach((line,index)=>{
        if (/<img\b(?![^>]*\balt\s*=)[^>]*>/i.test(line)) add(path,index+1,'Imagem sem texto alternativo.');
        if (/target\s*=\s*["_']?_blank\b/i.test(line) && !/rel\s*=\s*["'][^"']*noopener/.test(line)) add(path,index+1,'Link abre outra guia. Declare rel="noopener".');
      });
    }
    if (['js','mjs','cjs'].includes(ext(path))) lines.forEach((line,index)=>{
      if (/\beval\s*\(/.test(line)) add(path,index+1,'eval() executa código dinâmico. Verifique a origem da entrada.');
      if (/\.(?:innerHTML|outerHTML)\s*=(?!=)/.test(line)) add(path,index+1,'Inserção de HTML detectada. Verifique a origem dos dados.');
      if ((line.match(/\bif\b|\?\?|&&|\|\||\bcase\b/g) || []).length>5) add(path,index+1,'Muitas condições nesta linha. Considere dividir a expressão.');
    });
  }
  return issues;
}
export async function formatSource(path, source, tabWidth) {
  const map={html:['html','html'],css:['css','postcss'],javascript:['babel','babel','estree'],json:['json','babel','estree'],markdown:['markdown','markdown']};
  const [parser,...names]=map[language(path).id] || [];
  if(!parser) throw new Error('Não há formatador para este tipo de arquivo.');
  const [{format},...plugins]=await Promise.all([import('./vendor/prettier/standalone.mjs'),...names.map(name=>import('./vendor/prettier/'+name+'.mjs'))]);
  return format(source,{parser,plugins,tabWidth,endOfLine:source.includes('\r\n')?'crlf':'lf'});
}
export function safeTheme(extension) {
  const colors={};
  for(const [key,value] of Object.entries(extension?.colors || {})) if(/^[-\w.]+$/.test(key) && /^#[a-f\d]{3,8}$/i.test(value)) colors[key]=value;
  const tokenColors=(Array.isArray(extension?.tokenColors)?extension.tokenColors:[]).filter(item=>item?.settings?.foreground && /^#[a-f\d]{3,8}$/i.test(item.settings.foreground));
  return {colors,tokenColors};
}
export const fileLabel=(path,settings)=>settings.fileIcons?language(path).icon:'doc';
export const symbolLabel=symbol=>escapeHTML(symbol.name);
