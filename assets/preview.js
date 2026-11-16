import { ext, own, escapeHTML } from './project.js';

const mimeByExtension={html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',mjs:'text/javascript',json:'application/json',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',woff:'font/woff',woff2:'font/woff2',mp3:'audio/mpeg',mp4:'video/mp4'};
const virtual='/__kfecode__/';
function resolveLocal(specifier, from, files) {
  if (!specifier || /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(specifier)) return '';
  const origin = 'https://project.invalid/';
  try {
    const path=decodeURIComponent(new URL(specifier, origin + from.split('/').map(encodeURIComponent).join('/')).pathname.slice(1));
    return [path,path+'.js',path+'/index.js'].find(candidate => own(files,candidate)) || '';
  } catch { return ''; }
}
function dataURL(content, path) {
  const mime=mimeByExtension[ext(path)] || content?.mime || 'application/octet-stream';
  if (typeof content !== 'string') return 'data:'+mime+';base64,'+content.data;
  const bytes=new TextEncoder().encode(content);
  let encoded='';
  for (let i=0;i<bytes.length;i+=16384) encoded+=String.fromCharCode(...bytes.subarray(i,i+16384));
  return 'data:'+mime+';base64,'+btoa(encoded);
}
function capture(key) {
  const send = (level, args) => {
    const seen = new WeakSet();
    const values = [...args].map(item => {
      if (typeof item === 'string') return item;
      if (item instanceof Error) return item.stack || item.message;
      try {
        return JSON.stringify(item, (name, value) => {
          if (typeof value === 'bigint') return String(value) + 'n';
          if (value && typeof value === 'object') {
            if (seen.has(value)) return '[Circular]';
            seen.add(value);
          }
          return value;
        }) ?? String(item);
      } catch { return String(item); }
    });
    parent.postMessage({key, level, message:values.join(' ').slice(0,16000)}, '*');
  };
  for (const level of ['log','info','warn','error','debug']) {
    const original=console[level].bind(console);
    console[level]=(...args)=>{original(...args);send(level,args);};
  }
  addEventListener('error',event=>send('error',[event.message || 'Falha ao carregar um recurso da página.']),true);
  addEventListener('unhandledrejection',event=>send('error',[event.reason]));
  addEventListener('click',event=>{
    const link=event.target.closest?.('a[data-kfe-page]');
    if (link && !event.defaultPrevented) {event.preventDefault();parent.postMessage({key, path:link.dataset.kfePage}, '*');}
  });
}
function encodeScript(text) {return text.replace(/<\/script/gi,'<\\/script');}
export function buildPreview(project, path, key) {
  const files=project.files;
  if (!path) {
    const js=typeof files[project.active]==='string' && ['js','mjs'].includes(ext(project.active));
    const css=typeof files[project.active]==='string' && ext(project.active)==='css';
    const message=js?'Abra o console da IDE para ver a saída.':css?'A folha de estilos foi aplicada a esta página.':'Crie ou importe um arquivo HTML para visualizá-lo aqui.';
    const body='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>body{margin:0;background:#12161d;color:#e2e8f0;font:14px/1.55 system-ui;padding:28px}h1{font-size:21px}</style><body><h1>Prévia do projeto</h1><p>'+message+'</p></body></html>';
    return buildPreview({...project,files:{...files,'__kfecode_preview.html':body.replace('</body>',css?'<link rel="stylesheet" href="'+escapeHTML(project.active)+'"></body>':js?'<script type="module" src="'+escapeHTML(project.active)+'"></script></body>':'</body>')}},'__kfecode_preview.html',key);
  }
  const source=files[path];
  if (typeof source !== 'string') throw new Error('O HTML selecionado precisa ser um arquivo de texto UTF-8.');
  const documentPreview=new DOMParser().parseFromString(source,'text/html');
  for (const base of documentPreview.querySelectorAll('base')) base.remove();
  const rewriteCss=(sourceText, from, visited=new Set([from])) => {
    const imports=sourceText.replace(/@import\s+(?:url\(\s*)?['"]?([^'"\s);]+)['"]?\s*\)?([^;]*);/gi,(match,sourceUrl,media)=>{
      const file=resolveLocal(sourceUrl,from,files);
      if (!file || typeof files[file] !== 'string') return match;
      if (visited.has(file)) return '';
      const inline=rewriteCss(files[file],file,new Set([...visited,file]));
      return media.trim() ? '@media '+media.trim()+'{'+inline+'}' : inline;
    });
    return imports.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi,(match,_,url)=>{
      const file=resolveLocal(url.trim(),from,files);
      return file?'url("'+dataURL(files[file],file)+'")':match;
    });
  };
  const rewriteJS=(script,from) => script.replace(/(\b(?:from\s*|import\s*\(\s*|import\s*))(['"])([^'"\n]+)\2/g,(whole,prefix,quote,specifier)=>{
    const file=resolveLocal(specifier,from,files);
    return file ? prefix+quote+virtual+file+quote : whole;
  }).replace(/(\bnew\s+URL\(\s*)(['"])([^'"\n]+)\2(\s*,\s*import\.meta\.url\s*\))/g,(whole,prefix,quote,specifier,suffix)=>{
    const file=resolveLocal(specifier,from,files);
    return file ? prefix+quote+dataURL(files[file],file)+quote+suffix : whole;
  });
  const imports={};
  for(const [name,code] of Object.entries(files)) {
    if (typeof code==='string' && ['js','mjs'].includes(ext(name))) imports[virtual+name]=dataURL(rewriteJS(code,name),name);
  }
  for(const map of documentPreview.querySelectorAll('script[type="importmap"]')) {
    try {const parsed=JSON.parse(map.textContent); Object.assign(imports,parsed.imports);} catch {}
    map.remove();
  }
  for(const stylesheet of documentPreview.querySelectorAll('link[rel~="stylesheet"][href]')){
    const local=resolveLocal(stylesheet.getAttribute('href'),path,files);
    if (local && typeof files[local]==='string') {
      const style=documentPreview.createElement('style');
      if (stylesheet.media) style.media=stylesheet.media;
      style.textContent=rewriteCss(files[local],local).replace(/<\/style/gi,'<\\/style');
      stylesheet.replaceWith(style);
    }
  }
  for (const style of documentPreview.querySelectorAll('style')) style.textContent=rewriteCss(style.textContent,path);
  for(const script of documentPreview.querySelectorAll('script')){
    const local=resolveLocal(script.getAttribute('src'),path,files);
    if (local && typeof files[local]==='string') {
      const code=script.type==='module'?rewriteJS(files[local],local):files[local];
      script.src=dataURL(code,local);
    } else if (!script.hasAttribute('src') && script.type==='module') script.textContent=encodeScript(rewriteJS(script.textContent,path));
  }
  for(const element of documentPreview.querySelectorAll('img[src], source[src], video[src], audio[src], track[src], input[src], video[poster], link[rel~="icon"][href], [style]')){
    for(const attr of ['src','href','poster']) {
      const file=resolveLocal(element.getAttribute(attr),path,files);
      if(file) element.setAttribute(attr,dataURL(files[file],file));
    }
    if(element.hasAttribute('style')) element.setAttribute('style',rewriteCss(element.getAttribute('style'),path));
  }
  for (const element of documentPreview.querySelectorAll('img[srcset],source[srcset]')) {
    const srcset=element.getAttribute('srcset');
    if (srcset.startsWith('data:')) continue;
    const mapped=srcset.split(',').map(candidate=>{
      const [specifier,...descriptor]=candidate.trim().split(/\s+/);
      const file=resolveLocal(specifier,path,files);
      return [file?dataURL(files[file],file):specifier,...descriptor].join(' ');
    });
    element.setAttribute('srcset',mapped.join(', '));
  }
  for(const link of documentPreview.querySelectorAll('a[href]')) {
    const file=resolveLocal(link.getAttribute('href'),path,files);
    if(file && ['html','htm'].includes(ext(file))) link.dataset.kfePage=file;
  }
  const map=documentPreview.createElement('script');
  map.type='importmap';
  map.textContent=encodeScript(JSON.stringify({imports}));
  const consoleHook=documentPreview.createElement('script');
  consoleHook.textContent='('+capture.toString()+')('+JSON.stringify(key)+');';
  documentPreview.head.prepend(consoleHook,map);
  return '<!doctype html>\n'+documentPreview.documentElement.outerHTML;
}
