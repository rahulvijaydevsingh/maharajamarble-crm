import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, X, FileText, Image as ImageIcon, Paperclip } from 'lucide-react';

export interface UploadedFile { id: string; name: string; size: number; type: string; file?: File; file_path?: string; }
interface Props { attachments: UploadedFile[]; onChange: (attachments: UploadedFile[]) => void; maxSize?: number; }

export function QuotationAttachments({ attachments, onChange, maxSize = 10 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const processFiles = (files: FileList | null) => {
    if (!files) return;
    const accepted = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    const next = Array.from(files).filter(f => accepted.includes(f.type) && f.size <= maxSize * 1024 * 1024).map(file => ({ id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: file.name, size: file.size, type: file.type, file }));
    onChange([...attachments, ...next]);
  };
  const remove = (id: string) => onChange(attachments.filter(a => a.id !== id));
  const size = (n: number) => n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return <section className="rounded-lg border bg-muted/10 p-3">
    <div className="flex items-center justify-between gap-3">
      <div><h3 className="text-sm font-semibold">Attachments</h3><p className="text-xs text-muted-foreground">PDF, JPG or PNG · up to {maxSize} MB each</p></div>
      <><input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => { processFiles(e.target.files); e.currentTarget.value = ''; }} /><Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}><Upload className="mr-1.5 h-3.5 w-3.5" />Attach</Button></>
    </div>
    {attachments.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{attachments.map(file => <div key={file.id} className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs"><span className="flex h-6 w-6 items-center justify-center rounded bg-muted">{file.type.startsWith('image/') ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}</span><span className="max-w-44 truncate">{file.name}</span><span className="text-muted-foreground">{size(file.size)}</span><Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove(file.id)}><X className="h-3.5 w-3.5" /></Button></div>)}</div>}
    {attachments.length === 0 && <button type="button" onClick={() => inputRef.current?.click()} className="mt-2 flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/40"><Paperclip className="h-3.5 w-3.5" />No files attached</button>}
  </section>;
}
