import type {Placement} from './FinancialReview';

export type InvoiceSigningArea={page:number;top:number;bottom:number;pageWidth:number;pageHeight:number;imageWidth:number;imageHeight:number};

// Percentages describe the PDF page, not the canvas border or visible viewport.
export function fitInvoicePlacement(value:Placement,area?:InvoiceSigningArea):Placement{
 if(!area)return value;
 const ratio=area.pageWidth*area.imageHeight/(area.pageHeight*area.imageWidth);
 const maxWidth=Math.min(.6,1,(area.bottom-area.top)/ratio);
 const width=Math.max(.04,Math.min(maxWidth,value.width)),height=width*ratio;
 return {page:area.page,width,x:Math.max(0,Math.min(1-width,value.x)),y:Math.max(area.top,Math.min(area.bottom-height,value.y))};
}
