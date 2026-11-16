let typescript;
async function getTS() {
  if (!typescript) typescript=import('./vendor/typescript.js').then(module=>module.default);
  return typescript;
}
export async function createService(files) {
  const ts=await getTS();
  const script=path=>/\.(?:[cm]?js|jsx|ts|tsx|json)$/i.test(path);
  const collection=Object.fromEntries(Object.entries(files).filter(([name,text])=>script(name)&&typeof text==='string').map(([name,text])=>['/'+name,text]));
  const directories=new Set(['/']);
  for(const name of Object.keys(collection)){
    for(let i=name.indexOf('/',1);i!==-1;i=name.indexOf('/',i+1)) directories.add(name.slice(0,i));
  }
  const format={indentSize:2,tabSize:2,convertTabsToSpaces:true,newLineCharacter:'\n',semicolons:'insert'};
  const host={
    getCompilationSettings:()=>({target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Node10,allowJs:true,allowNonTsExtensions:true,noLib:true,jsx:ts.JsxEmit.Preserve,resolveJsonModule:true}),
    getCurrentDirectory:()=>'/',
    getDefaultLibFileName:()=>'/lib.d.ts',
    getScriptFileNames:()=>Object.keys(collection),
    getScriptVersion:()=>'0',
    getScriptSnapshot:path=>Object.hasOwn(collection,path)?ts.ScriptSnapshot.fromString(collection[path]):undefined,
    fileExists:path=>Object.hasOwn(collection,path),
    readFile:path=>collection[path],
    readDirectory:()=>Object.keys(collection),
    directoryExists:path=>directories.has(path),
    useCaseSensitiveFileNames:()=>true,
  };
  const service=ts.createLanguageService(host);
  return {ts,service,format,collection};
}
export async function refactorChoices(project,path,range) {
  const {service}=await createService(project.files);
  try {
    return service.getApplicableRefactors('/'+path,range,{},'invoked').flatMap(group=>group.actions.filter(item=>!item.notApplicableReason).map(action=>({group:group.name,action:action.name,label:action.description})));
  } finally {service.dispose();}
}
export async function refactorChanges(project,path,range,choice) {
  const {service,format}=await createService(project.files);
  try {return service.getEditsForRefactor('/'+path,format,range,choice.group,choice.action,{})?.edits || [];}
  finally {service.dispose();}
}
export async function importsChanges(project,path) {
  const {service,format}=await createService(project.files);
  try {return service.organizeImports({type:'file',fileName:'/'+path},format,{});}
  finally {service.dispose();}
}
export async function movedFileChanges(project,oldPath,newPath) {
  const {service,format}=await createService(project.files);
  try {return service.getEditsForFileRename('/'+oldPath,'/'+newPath,format,{});}
  finally {service.dispose();}
}
export async function renameChanges(project,path,position,newName) {
  if(!/^[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*$/u.test(newName)) throw new Error('Use um identificador JavaScript válido.');
  const {service}=await createService(project.files);
  const source='/'+path;
  try {
    const info=service.getRenameInfo(source,position,{allowRenameOfImportPath:false});
    if(!info.canRename) throw new Error(info.localizedErrorMessage);
    const edits=new Map();
    for (const entry of service.findRenameLocations(source,position,false,false,true) || []) {
      const file=edits.get(entry.fileName)||[];
      file.push({span:entry.textSpan,newText:(entry.prefixText || '')+newName+(entry.suffixText || '')});
      edits.set(entry.fileName,file);
    }
    return [...edits].map(([fileName,textChanges])=>({fileName,textChanges}));
  } finally {service.dispose();}
}
export async function swapParameters(project,path,position,first,second) {
  const {ts,service,collection}=await createService(project.files);
  try {
    const program=service.getProgram();
    const source=program.getSourceFile('/'+path);
    const descend=node=>ts.forEachChild(node, child=>position>=child.getStart(source)&&position<=child.end?descend(child):undefined)||node;
    let declaration=descend(source);
    while(declaration && !ts.isFunctionDeclaration(declaration)) declaration=declaration.parent;
    if(!declaration?.name || !declaration.body || declaration.parameters.length<=Math.max(first,second) || first<0 || second<0 || first===second) throw new Error('Selecione uma declaração de função nomeada e dois parâmetros válidos.');
    if(declaration.parameters.some(parameter=>parameter.dotDotDotToken || parameter.initializer || parameter.questionToken)) throw new Error('A troca exige parâmetros obrigatórios, sem valores padrão ou rest.');
    const edits=new Map();
    const add=(file,a,b)=>{
      const list=edits.get(file.fileName)||[];
      const sourceText=collection[file.fileName];
      for (const [from,to] of [[a,b],[b,a]]) {
        const start=from.getStart(file);
        list.push({span:{start,length:from.end-start},newText:sourceText.slice(to.getStart(file),to.end)});
      }
      edits.set(file.fileName,list);
    };
    add(source,declaration.parameters[first],declaration.parameters[second]);
    const references=service.findReferences(source.fileName,declaration.name.getStart(source)) || [];
    const seen=new Set();
    for(const group of references) for(const ref of group.references) {
      if(ref.isDefinition || (ref.fileName===source.fileName&&ref.textSpan.start===declaration.name.getStart(source))) continue;
      const file=program.getSourceFile(ref.fileName);
      if(!file || !Object.hasOwn(collection,ref.fileName)) continue;
      const key=ref.fileName+':'+ref.textSpan.start;
      if(seen.has(key)) continue;
      seen.add(key);
      const find=node=>ts.forEachChild(node,child=>ref.textSpan.start>=child.getStart(file)&&ref.textSpan.start<child.end?find(child):undefined)||node;
      let node=find(file);
      if(ts.isImportSpecifier(node.parent)||ts.isExportSpecifier(node.parent)||ts.isImportClause(node.parent)) continue;
      if(ts.isPropertyAccessExpression(node.parent)&&node.parent.name===node) node=node.parent;
      const call=node.parent;
      if(!ts.isCallExpression(call)||call.expression!==node||call.arguments.length<=Math.max(first,second)||call.arguments.some(ts.isSpreadElement)) throw new Error('Há uma referência indireta ou uma chamada com argumentos incompatíveis em '+ref.fileName.slice(1)+'.');
      add(file,call.arguments[first],call.arguments[second]);
    }
    return [...edits].map(([fileName,textChanges])=>({fileName,textChanges}));
  } finally {service.dispose();}
}
