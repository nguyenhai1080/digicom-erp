import {AsyncLocalStorage} from 'node:async_hooks';
import {digest} from './core.mjs';
const contexts=new AsyncLocalStorage();
// One validation/trial only. Never cache filesystem or database verification.
export function withSourcePlanningCache(run){return contexts.getStore()?run():contexts.run(new WeakMap(),run);}
export function memoSourcePlan(snapshot,name,inputs,build){
 const context=contexts.getStore();if(!context)return build();
 const fingerprint=digest(inputs.map(value=>value===undefined?{missing:true}:{value}));
 let plans=context.get(snapshot);if(!plans){plans=new Map();context.set(snapshot,plans);}
 const old=plans.get(name);if(old?.fingerprint===fingerprint)return structuredClone(old.value);
 const result=build();plans.set(name,{fingerprint,value:structuredClone(result)});return result;
}
