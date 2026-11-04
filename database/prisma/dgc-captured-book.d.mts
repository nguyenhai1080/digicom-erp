export function capturedId(companyId:string,key:string):string;
export function verifyCapturedBook(bundle:any,pin:string):any;
export function capturedFilePath(companyId:string,file:any):string;
export function capturedFilesReady(bundle:any,pin:string,companyId:string,storageRoot:string):Promise<{files:number;bytes:number}>;
export function installCapturedFiles(bundle:any,pin:string,companyId:string,blobRoot:string,storageRoot:string):Promise<{files:number;bytes:number}>;
export function transferCapturedBook(tx:any,bundle:any,options:{expectedBundleHash:string;expectedDatabase:string;companyId:string;operatorId:string;reason:string;registerDocuments?:(...args:any[])=>Promise<any>}):Promise<any>;
