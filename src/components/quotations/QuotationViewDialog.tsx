import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { Quotation, QuotationAttachment } from '@/types/quotation';
import { QuotationPDFTemplate } from './QuotationPDFTemplate';
import { downloadQuotationPdf } from '@/lib/quotationPdf';
import { supabase } from '@/integrations/supabase/client';

interface Props { open:boolean; onOpenChange:(open:boolean)=>void; quotation:Quotation|null; }
export function QuotationViewDialog({open,onOpenChange,quotation}:Props){
 const templateRef=useRef<HTMLDivElement>(null); const [isDownloading,setIsDownloading]=useState(false); const [attachments,setAttachments]=useState<QuotationAttachment[]>([]); const [urls,setUrls]=useState<Record<string,string>>({});
 useEffect(()=>{if(!open||!quotation)return;let active=true;const load=async()=>{const{data}=await supabase.from('quotation_attachments').select('*').eq('quotation_id',quotation.id).order('created_at');if(!active)return;const rows=(data||[]) as unknown as QuotationAttachment[];setAttachments(rows);const entries=await Promise.all(rows.map(async a=>{const{data:signed}=await supabase.storage.from('crm-attachments').createSignedUrl(a.file_path,3600);return[a.id,signed?.signedUrl||''] as const;}));if(active)setUrls(Object.fromEntries(entries));};load();return()=>{active=false}},[open,quotation]);
 if(!quotation)return null; const download=async()=>{if(!templateRef.current)return;setIsDownloading(true);try{await downloadQuotationPdf({element:templateRef.current,fileName:`${quotation.quotation_number}.pdf`})}finally{setIsDownloading(false)}};
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto"><DialogHeader className="flex flex-row items-center justify-between border-b pb-2"><DialogTitle>Quotation — {quotation.quotation_number}</DialogTitle><Button variant="outline" size="sm" onClick={download} disabled={isDownloading}>{isDownloading?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Download className="mr-2 h-4 w-4"/>}{isDownloading?'Preparing…':'Download PDF'}</Button></DialogHeader><div ref={templateRef} className="mt-4 bg-background"><QuotationPDFTemplate quotation={quotation}/></div>{attachments.length>0&&<div className="mt-4 rounded-lg border p-3"><h3 className="mb-2 text-sm font-semibold">Attachments</h3><div className="space-y-1.5">{attachments.map(a=><div key={a.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm"><span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-muted-foreground"/><span className="truncate">{a.file_name}</span></span>{urls[a.id]&&<a href={urls[a.id]} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">View<ExternalLink className="h-3 w-3"/></a>}</div>)}</div></div>}</DialogContent></Dialog>;
}
