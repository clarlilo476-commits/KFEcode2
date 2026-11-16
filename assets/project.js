import { sample } from './sample.js';

export const own = (obj, key) => Object.hasOwn(obj, key);
export const base = path => path.split('/').at(-1);
export const parent = path => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
export const join = (a,b) => a ? a + '/' + b : b;
export const ext = path => base(path || '').toLowerCase().split('.').at(-1);
export const languages = {
  html: { id:'html', label:'HTML', icon:'html', extension:'html' },
  css: { id:'css', label:'CSS', icon:'css', extension:'css' },
  js: { id:'javascript', label:'JavaScript', icon:'js', extension:'js' },
  json: { id:'json', label:'JSON', icon:'json', extension:'json' },
  md: { id:'markdown', label:'Markdown', icon:'doc', extension:'md' },
  txt: { id:'plaintext', label:'Texto', icon:'doc', extension:'txt' },
};
export function language(path) {
  const aliases = { htm:'html', mjs:'js', cjs:'js', jsx:'js', markdown:'md' };
  return languages[aliases[ext(path)] || ext(path)] || languages.txt;
}
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const validName = name => !!name && name.trim() === name && !/[<>:"/\\|?*\u0000-\u001f]/.test(name) && !['.','..','__proto__','constructor','prototype'].includes(name) && !/[. ]$/.test(name);
export const validPath = path => typeof path === 'string' && path.split('/').every(validName);
export const settingsDefault = { theme:'night', font:13, family:'JetBrains Mono', ligatures:true, minimap:true, wrap:false, formatOnSave:false, autoPreview:true, tabSize:2, keymap:'default', keybindings:{}, fileIcons:true };
export function makeProject(name, template = '', files, folders = []) {
  const content = files ?? (template ? { ['index.' + template]: templates[template] } : {});
  return {
    id: crypto.randomUUID(), name, files: content, saved: structuredClone(content),
    folders, open: Object.keys(content).slice(0,3), active: Object.keys(content)[0] || '', collapsed:[], selected:'', breakpoints:{}, snapshots:[],
  };
}
const templates = {
  html:'<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Meu projeto</title>\n</head>\n<body>\n  <h1>Olá, mundo!</h1>\n</body>\n</html>\n',
  css:'/* Estilos do projeto */\n:root {\n  color-scheme: light dark;\n}\n',
  js:"// Código do projeto\nconsole.log('Olá, mundo!');\n",
};
export function initialState() {
  const demo = makeProject(sample.name, '', structuredClone(sample.files), [...sample.folders]);
  return { workspaces:[{id:crypto.randomUUID(),name:'Workspace local',projects:[demo],project:demo.id}], settings:{...settingsDefault}, extensions:[] };
}
export function normalize(state) {
  if (!state?.workspaces?.length) return initialState();
  state.settings = {...settingsDefault, ...state.settings};
  delete state.settings.aiInline;
  state.extensions ||= [];
  state.workspace ||= state.workspaces[0].id;
  return state;
}
let db;
async function database() {
  if (db) return db;
  db = await new Promise((resolve,reject) => {
    const request = indexedDB.open('kfecode',1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspace');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return db;
}
export async function load() {
  const databaseHandle = await database();
  return new Promise((resolve,reject) => {
    const request = databaseHandle.transaction('workspace').objectStore('workspace').get('state');
    request.onsuccess = () => resolve(normalize(request.result));
    request.onerror = () => reject(request.error);
  });
}
export async function persist(state) {
  const databaseHandle = await database();
  return new Promise((resolve,reject) => {
    const tx = databaseHandle.transaction('workspace','readwrite');
    tx.objectStore('workspace').put(state,'state');
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
  });
}
export function blobFor(content) {
  if (typeof content === 'string') return new Blob([content], {type:'text/plain;charset=utf-8'});
  const bytes = Uint8Array.from(atob(content.data), char => char.charCodeAt(0));
  return new Blob([bytes], {type:content.mime || 'application/octet-stream'});
}
export async function readFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const source = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
    if (!source.includes('\u0000') && !/^(image\/(?!svg)|font\/|audio\/|video\/|application\/(zip|pdf))/.test(file.type)) return source;
  } catch {}
  let data = '';
  for (let i=0;i<bytes.length;i+=16384) data += String.fromCharCode(...bytes.subarray(i,i+16384));
  return {data:btoa(data),mime:file.type || 'application/octet-stream'};
}
export function download(blob,name) {
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url; link.download=name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export async function zipProject(project) {
  const { default:Zip } = await import('./vendor/jszip.js');
  const zip=new Zip();
  for (const folder of project.folders) zip.folder(folder);
  for (const [name,content] of Object.entries(project.files)) {
    if (typeof content === 'string') zip.file(name,content);
    else zip.file(name,content.data,{base64:true});
  }
  return zip.generateAsync({type:'blob',compression:'DEFLATE'});
}
export function entryPoint(project) {
  const options = Object.keys(project.files).filter(path => ['html','htm'].includes(ext(path)));
  return (options.includes(project.active) ? project.active : project.entry && options.includes(project.entry) ? project.entry : options.find(path => path === 'index.html') || options[0]) || '';
}
