export function evidenceBundle(snapshot:any,decisions:any):{bundle:any;bundleHash:string};
export function verifyEvidenceBundle(bundle:any,pin:string):any;
export function invoiceEvidenceRows(stored:any[],receipt:any):any[];
export function transferEvidence(tx:any,bundle:any,options:{expectedBundleHash:string;expectedDatabase:string;companyId:string;operatorId:string;reason:string}):Promise<{bundleHash:string;sourceSnapshotHash:string;sourceRows:number;tables:{sheet:string;rows:number}[];masterLinksVerified:number;created:boolean;replay:boolean;sourceValuesChanged:boolean;financialPosting:boolean;financialRecordsCreated:number}>;
