export const manualRevenueActionsList = ['create', 'edit', 'submit', 'approve', 'cancel'];
const dgc = { create: 'MANUAL_REVENUE_CREATE', edit: 'MANUAL_REVENUE_EDIT', submit: 'MANUAL_REVENUE_SUBMIT', approve: 'MANUAL_REVENUE_APPROVE', cancel: 'MANUAL_REVENUE_CANCEL' };
const legacy = { create: 'RECON_UPLOAD', edit: 'RECON_UPLOAD', submit: 'RECON_REVIEW', approve: 'RECON_APPROVE', cancel: 'RECON_CANCEL' };
export function manualRevenuePermission(identity, action) {
    return (identity.companyCode === 'DGC' ? dgc : legacy)[action];
}
export function manualRevenueActions(identity) {
    return Object.fromEntries(manualRevenueActionsList.map(action => [action, identity.permissions.includes(manualRevenuePermission(identity, action))]));
}
