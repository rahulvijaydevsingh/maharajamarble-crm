import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Copy } from 'lucide-react';
import { QuotationItem, QUOTATION_UNITS } from '@/types/quotation';

interface QuotationLineItemsProps {
  items: QuotationItem[];
  onChange: (items: QuotationItem[]) => void;
}

export function QuotationLineItems({ items, onChange }: QuotationLineItemsProps) {
  const addItem = () => {
    const newItem: QuotationItem = {
      id: `temp-${Date.now()}`,
      item_name: '',
      quantity: 1,
      unit: 'pcs',
      rate: 0,
      amount: 0,
      sort_order: items.length,
    };
    onChange([...items, newItem]);
  };

  const updateItem = (index: number, field: keyof QuotationItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Recalculate amount if quantity or rate changed
    if (field === 'quantity' || field === 'rate') {
      newItems[index].amount = newItems[index].quantity * newItems[index].rate;
    }
    
    onChange(newItems);
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    onChange(newItems);
  };

  const duplicateItem = (index: number) => {
    const itemToCopy = items[index];
    const newItem: QuotationItem = {
      ...itemToCopy,
      id: `temp-${Date.now()}`,
      sort_order: items.length,
    };
    onChange([...items, newItem]);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground">Line Items</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addItem}
          className="shrink-0"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Item
        </Button>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            No items added yet.
          </div>
        ) : (
          items.map((item, index) => (
            <div key={item.id} className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-muted-foreground">Item {index + 1}</span>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => duplicateItem(index)} aria-label={`Duplicate item ${index + 1}`}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => removeItem(index)} aria-label={`Remove item ${index + 1}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor={`quotation-item-name-${item.id}`}>Item</label>
                <Input id={`quotation-item-name-${item.id}`} value={item.item_name} onChange={(e) => updateItem(index, 'item_name', e.target.value)} placeholder="Item name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor={`quotation-item-quantity-${item.id}`}>Quantity</label>
                  <Input id={`quotation-item-quantity-${item.id}`} type="number" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)} min={0} step={0.01} className="text-base tabular-nums" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Unit</label>
                  <Select value={item.unit} onValueChange={(value) => updateItem(index, 'unit', value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {QUOTATION_UNITS.map((unit) => <SelectItem key={unit.value} value={unit.value}>{unit.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor={`quotation-item-rate-${item.id}`}>Rate</label>
                  <Input id={`quotation-item-rate-${item.id}`} type="number" value={item.rate} onChange={(e) => updateItem(index, 'rate', parseFloat(e.target.value) || 0)} min={0} step={0.01} className="text-base tabular-nums" />
                </div>
                <div className="space-y-1.5">
                  <span className="text-sm font-medium">Amount</span>
                  <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm font-medium tabular-nums">{formatCurrency(item.amount)}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
