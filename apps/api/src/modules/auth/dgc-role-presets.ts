// Reviewable role templates, never seed/assign them automatically. These cover
// implemented DGC service-finance actions, not full donor/Projects parity.
const all=['Staff','Manager','BOD'] as const,managers=['Manager','BOD'] as const,bod=['BOD'] as const;
type Role='Staff'|'Manager'|'BOD';
type Evidence={file:string;function:string;line:number;basis:'LITERAL_ROLE'|'READER_CASE'|'BOD_HELPER'|'TARGET_ADAPTATION'};
type Mapping={permissions:string[];roles:readonly Role[];source:Evidence;note?:string};
const source=(file:string,fn:string,line:number,basis:Evidence['basis']='LITERAL_ROLE'):Evidence=>({file,function:fn,line,basis});
export const dgcRoleMappings:readonly Mapping[]=[
 {permissions:['SYSTEM_VIEW','SERVICE_VIEW','PARTNER_VIEW','CONTRACT_VIEW','REVENUE_VIEW','INVOICE_VIEW','AR_VIEW','AP_VIEW'],roles:all,source:source('01_AppShell.js','getEntityData',276,'READER_CASE'),note:'Require authenticated target access; donor generic reader does not consistently enforce login.'},
 {permissions:['SERVICE_CREATE'],roles:all,source:source('10_MasterData.js','createService',6)},
 {permissions:['SERVICE_EDIT'],roles:all,source:source('10_MasterData.js','updateService',302)},
 {permissions:['PARTNER_CREATE'],roles:all,source:source('10_MasterData.js','createPartner',58)},
 {permissions:['PARTNER_EDIT'],roles:all,source:source('10_MasterData.js','updatePartner',337)},
 {permissions:['CONTRACT_CREATE'],roles:all,source:source('10_MasterData.js','createContract',164)},
 {permissions:['CONTRACT_EDIT'],roles:all,source:source('10_MasterData.js','updateContract',376)},
 {permissions:['SERVICE_ARCHIVE'],roles:managers,source:source('10_MasterData.js','deleteService',473)},
 {permissions:['PARTNER_ARCHIVE'],roles:managers,source:source('10_MasterData.js','deletePartner',496)},
 {permissions:['CONTRACT_TERMINATE'],roles:managers,source:source('10_MasterData.js','deleteContract',520),note:'Target guarded deletion requires CONTRACT_EDIT as well.'},
 {permissions:['RECON_VIEW'],roles:all,source:source('22_Recon_PDF_Approval.js','getReconSourcePdfForViewJson',279)},
 {permissions:['RECON_UPLOAD'],roles:all,source:source('20_Recon_Core.js','uploadMovitelReconPdf',162)},
 {permissions:['RECON_REVIEW'],roles:managers,source:source('22_Recon_PDF_Approval.js','manualUpdateReconPdfRevenueMzn',397),note:'USD/VND target corrections; raw MZN remains source evidence.'},
 {permissions:['RECON_APPROVE'],roles:managers,source:source('22_Recon_PDF_Approval.js','finalizeReconPdfReviewAndStampV893',1164),note:'Direct finalization; older aggregate finalizeOutputReconPreviewAndApprove remains BOD-only in donor, not silently merged here.'},
 {permissions:['RECON_RESTAMP'],roles:bod,source:source('22_Recon_PDF_Approval.js','updateApprovedReconPdfPlacementV8123',998)},
 {permissions:['MANUAL_REVENUE_CREATE'],roles:all,source:source('30_Revenue.js','createMonthlyRevenue',6)},
 {permissions:['MANUAL_REVENUE_EDIT'],roles:all,source:source('30_Revenue.js','createMonthlyRevenue',6,'TARGET_ADAPTATION'),note:'Explicit draft editing capability; donor create function is not an in-place draft-edit command.'},
 {permissions:['MANUAL_REVENUE_SUBMIT'],roles:all,source:source('30_Revenue.js','submitRevenue',74)},
 {permissions:['MANUAL_REVENUE_APPROVE'],roles:managers,source:source('30_Revenue.js','approveRevenue',82)},
 {permissions:['MANUAL_REVENUE_CANCEL'],roles:managers,source:source('30_Revenue.js','submitRevenue',74,'TARGET_ADAPTATION'),note:'Conservative target draft cancellation; no matching donor cancelRevenue command established.'},
 {permissions:['INVOICE_CREATE'],roles:managers,source:source('40_Invoice_Core.js','previewInvoiceFromRevenue',97)},
 {permissions:['INVOICE_ISSUE'],roles:managers,source:source('40_Invoice_Core.js','issueInvoice',1146)},
 {permissions:['INVOICE_CANCEL'],roles:managers,source:source('40_Invoice_Core.js','cancelInvoice',1197)},
 {permissions:['INVOICE_PAYMENT_VIEW'],roles:all,source:source('01_AppShell.js','getEntityData',276,'READER_CASE'),note:'Authenticated invoice receipt history only; does not grant cash accounts, cash reports, payment writes or evidence-document download.'},
 {permissions:['PAYMENT_VIEW'],roles:managers,source:source('51_Payment_Transaction.js','recordInvoicePayment',149,'TARGET_ADAPTATION'),note:'Bundled cash reports and payment evidence download remain Manager/BOD; generic donor receipt-table reads are mapped separately.'},
 {permissions:['PAYMENT_CREATE','PAYMENT_APPROVE','PAYMENT_POST'],roles:managers,source:source('51_Payment_Transaction.js','recordInvoicePayment',149)},
 {permissions:['INPUT_RECON_VIEW','INPUT_RECON_GENERATE'],roles:managers,source:source('53_InputRecon_AP.js','generateInputReconciliation',99),note:'INPUT_RECON_VIEW also exposes pending source inspection, which donor restricts to Manager/BOD.'},
 {permissions:['INPUT_RECON_APPROVE'],roles:bod,source:source('53_InputRecon_AP.js','approveInputReconciliation',377)},
 {permissions:['REVENUE_FX_CREATE'],roles:managers,source:source('53_InputRecon_AP.js','createFxRate',6),note:'Create-only target USD/VND monthly reporting rate; donor also updates an existing active rate, which is not implemented here.'},
 {permissions:['REPORT_VIEW'],roles:managers,source:source('01_AppShell.js','getEntityData',276,'READER_CASE')},
 {permissions:['USER_VIEW'],roles:bod,source:source('01_AppShell.js','getEntityData',276,'READER_CASE')},
 {permissions:['USER_CREATE'],roles:bod,source:source('03_Auth.js','manageCreateUser',167,'BOD_HELPER')},
 {permissions:['USER_EDIT'],roles:bod,source:source('03_Auth.js','manageResetUserPassword',214,'TARGET_ADAPTATION'),note:'Donor password reset uses DGC_assertBod_; target USER_EDIT also permits profile/role edits.'},
 {permissions:['USER_DISABLE'],roles:bod,source:source('03_Auth.js','manageUpdateUserStatus',195,'BOD_HELPER')},
 {permissions:['AUDIT_VIEW'],roles:bod,source:source('01_AppShell.js','getEntityData',276,'READER_CASE')},
 {permissions:['SYSTEM_CONFIG_EDIT'],roles:bod,source:source('01_AppShell.js','getEntityData',276,'TARGET_ADAPTATION'),note:'Conservative BOD scope for bundled config writes/signing assets; donor reader is not evidence for all write actions.'},
 {permissions:['ROLE_VIEW','ROLE_CREATE'],roles:bod,source:source('03_Auth.js','requireRole',150,'TARGET_ADAPTATION'),note:'Target custom RBAC administration; donor has fixed role names.'}
];
export function dgcRolePresets(){
 const donorPresets=all.map(role=>({code:'DGC_'+role.toUpperCase(),name:role+' — DGC Finance',donorRole:role,proposalOnly:true,fullParity:false,
  permissionCodes:[...new Set(dgcRoleMappings.filter(m=>m.roles.includes(role)).flatMap(m=>m.permissions))].sort(),
  coverage:'IMPLEMENTED_SERVICE_FINANCE_ONLY',
  reviewNotes:['No automatic assignment, seed or existing-role update.','Projects, SOA/package runtime, diagnostics/repair, complete read separation and FX revisions remain outside this template.'],
  evidence:dgcRoleMappings.filter(m=>m.roles.includes(role))}));
 // Owner explicitly delegated FX entry and input/output preparation to accounting.
 // Keep this target role distinct from generic Staff and from final approvers.
 const preparation=['REVENUE_FX_CREATE','RECON_REVIEW','INPUT_RECON_VIEW','INPUT_RECON_GENERATE'];
 const accountant={...donorPresets[0],code:'DGC_ACCOUNTANT',name:'Nhân viên kế toán — DGC Finance',donorRole:null,inheritsDonorRole:'Staff',
  permissionCodes:[...new Set([...donorPresets[0].permissionCodes,...preparation])].sort(),
  ownerInstruction:{date:'2026-10-20',reference:'docs/handover/DGC_ACCOUNTING_PREPARATION_20261020.md',basis:'OWNER_INSTRUCTION',permissions:preparation},
  reviewNotes:[...donorPresets[0].reviewNotes,'Owner accounting preparation role; no output/input final approval, restamp, cash posting or signing configuration.']};
 return [...donorPresets,accountant];
}
