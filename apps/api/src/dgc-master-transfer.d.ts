declare module '@erp/db/dgc-master-transfer' {
 export function compileMasterTransfer(bundle:unknown,options:{expectedDatabase:string;operatorEmail:string;commit?:boolean;expectedTransferHash:string;reason?:string}):{format:string;transferHash:string;sourceSnapshotHash:string;planHash:string;counts:Record<string,number>;sourceRows:number;statements:string[]};
}
