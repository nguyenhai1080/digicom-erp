import type {Identity} from '../auth/access.js';

export const manualRevenueActionsList=['create','edit','submit','approve','cancel'] as const;
export type ManualRevenueAction=typeof manualRevenueActionsList[number];
const dgc={create:'MANUAL_REVENUE_CREATE',edit:'MANUAL_REVENUE_EDIT',submit:'MANUAL_REVENUE_SUBMIT',approve:'MANUAL_REVENUE_APPROVE',cancel:'MANUAL_REVENUE_CANCEL'} as const;
const legacy={create:'RECON_UPLOAD',edit:'RECON_UPLOAD',submit:'RECON_REVIEW',approve:'RECON_APPROVE',cancel:'RECON_CANCEL'} as const;

export function manualRevenuePermission(identity:Pick<Identity,'companyCode'>,action:ManualRevenueAction){
 return (identity.companyCode==='DGC'?dgc:legacy)[action];
}
export function manualRevenueActions(identity:Pick<Identity,'companyCode'|'permissions'>){
 return Object.fromEntries(manualRevenueActionsList.map(action=>[action,identity.permissions.includes(manualRevenuePermission(identity,action))])) as Record<ManualRevenueAction,boolean>;
}
