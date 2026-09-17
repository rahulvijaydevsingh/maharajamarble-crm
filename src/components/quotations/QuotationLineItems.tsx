import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Copy } from 'lucide-react';
import { QuotationItem, QUOTATION_UNITS } from '@/types/quotation';

interface QuotationLineItemsProps { items: QuotationItem[]; onChange: (items: QuotationItem[]) => void; }

export function QuotationLineItems({ items, onChange }: QuotationLineItemsProps) {
  const addItem = () => onChange([...items, { id: `temp-${Date.now()}`, item_name: '', quantity: 1, unit: 'pcs', rate: 0, amount: 0, sort_order: items.length }]);
  const updateItem = (index: number, field: keyof QuotationItem, value: any) => {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    if (field === 'quantity' || field === 'rate') next[index].amount = Number(next[index].quantity || 0) * Number(next[index].rate || 0);
    onChange(next);
  };
  const removeItem = (index: number) => onChange(items.filter((_, i) => i !== index));
  const duplicateItem = (index: number) => onChange([...items, { ...items[index], id: `temp-${Date.now()}`, sort_order: items.length }]);
  const formatCurrency = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div><h3 className="text-sm font-semibold">Items</h3><p className="text-xs text-muted-foreground">Add products, quantity and rate.</p></div>
        <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="mr-1 h-4 w-4" />Add Item</Button>
      </div>
      <div className="hidden overflow-hidden rounded-lg border md:block">
        <div className="grid grid-cols-[40px_minmax(180px,1fr)_110px_100px_130px_140px_72px] items-center gap-2 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>#</span><span>Item</span><span>Unit</span><span>Qty</span><span>Unit Rate (₹)</span><span className="text-right">Line Total (₹)</span><span />
        </div>
        {items.length === 0 ? <div className="px-4 py-8 text-center text-sm text-muted-foreground">No items added yet.</div> : items.map((item, index) => (
          <div key={item.id} className="grid grid-cols-[40px_minmax(180px,1fr)_110px_100px_130px_140px_72px] items-center gap-2 border-t px-3 py-2">
            <span className="text-xs text-muted-foreground">{index + 1}</span>
            <Input value={item.item_name} onChange={e => updateItem(index, 'item_name', e.target.value)} placeholder="Item name" />
            <Select value={item.unit} onValueChange={v => updateItem(index, 'unit', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{QUOTATION_UNITS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent></Select>
            <Input type="number" min="0" step="0.01" value={item.quantity} onChange={e => updateItem(index, 'quantity', Number(e.target.value) || 0)} />
            <Input type="number" min="0" step="0.01" value={item.rate} onChange={e => updateItem(index, 'rate', Number(e.target.value) || 0)} />
            <div className="text-right text-sm font-semibold tabular-nums">{formatCurrency(item.amount)}</div>
            <div className="flex justify-end gap-0.5"><Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicateItem(index)} aria-label="Duplicate item"><Copy className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItem(index)} aria-label="Remove item"><Trash2 className="h-3.5 w-3.5" /></Button></div>
          </div>
        ))}
      </div>
      <div className="space-y-2 md:hidden">
        {items.length === 0 ? <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No items added yet.</div> : items.map((item, index) => (
          <div key={item.id} className="rounded-lg border p-3">
            <div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">ITEM {index + 1}</span><div className="flex gap-1"><Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicateItem(index)}><Copy className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeItem(index)}><Trash2 className="h-3.5 w-3.5" /></Button></div></div>
            <Input value={item.item_name} onChange={e => updateItem(index, 'item_name', e.target.value)} placeholder="Item name" className="mb-2" />
            <div className="grid grid-cols-3 gap-2"><div><label className="mb-1 block text-[11px] text-muted-foreground">Unit</label><Select value={item.unit} onValueChange={v => updateItem(index, 'unit', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{QUOTATION_UNITS.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent></Select></div><div><label className="mb-1 block text-[11px] text-muted-foreground">Qty</label><Input type="number" min="0" step="0.01" value={item.quantity} onChange={e => updateItem(index, 'quantity', Number(e.target.value) || 0)} /></div><div><label className="mb-1 block text-[11px] text-muted-foreground">Rate</label><Input type="number" min="0" step="0.01" value={item.rate} onChange={e => updateItem(index, 'rate', Number(e.target.value) || 0)} /></div></div>
            <div className="mt-2 flex justify-between border-t pt-2 text-sm"><span className="text-muted-foreground">Line total</span><span className="font-semibold tabular-nums">{formatCurrency(item.amount)}</span></div>
          </div>
        ))}
      </div>
    </section>
  );
}
