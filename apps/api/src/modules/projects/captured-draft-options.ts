type Draft={id:string;snapshot:unknown;scopes:{items:{revenueId:string}[]}[]};
// Parallel donor Draft options are retained. Issuance uses the selected option
// for its source set and the latest captured option for each other source set.
// No invoice, amount, current flag or source status is changed by selection.
export function capturedDraftOptions<T extends Draft>(drafts:T[],selectedId:string):T[]{
 const selected=drafts.find(i=>i.id===selectedId);if((selected?.snapshot as any)?.sourceKind!=='DGC_CAPTURED_BOOK_V1')return drafts;
 const groups=new Map<string,T[]>();
 for(const d of drafts){const key=d.scopes.flatMap(s=>s.items.map(i=>i.revenueId)).sort().join('|');if(!key)return drafts;const group=groups.get(key)??[];group.push(d);groups.set(key,group);}
 return [...groups.values()].flatMap(group=>{
  if(group.length===1||group.some(i=>(i.snapshot as any)?.sourceKind!=='DGC_CAPTURED_BOOK_V1'))return group;
  return [group.find(i=>i.id===selectedId)??group.reduce((a,b)=>Number((a.snapshot as any).source.sourceRow)>Number((b.snapshot as any).source.sourceRow)?a:b)];
 });
}
