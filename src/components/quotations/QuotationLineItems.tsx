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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Trash2, GripVertical, Copy } from 'lucide-react';
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Line Items</h3>
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-4 w-4 mr-1" />
          Add Item
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-8"></TableHead>
              <TableHead className="min-w-[200px]">Item</TableHead>
              <TableHead className="w-24">Qty</TableHead>
              <TableHead className="w-32">Unit</TableHead>
              <TableHead className="w-32">Rate</TableHead>
              <TableHead className="w-32 text-right">Amount</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No items added.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell className="text-muted-foreground">
                    <GripVertical className="h-4 w-4 cursor-grab" />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={item.item_name}
                      onChange={(e) => updateItem(index, 'item_name', e.target.value)}
                      placeholder="Item name..."
                      className="border-0 bg-transparent focus-visible:ring-0 px-0"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                      min={0}
                      step={0.01}
                      className="border-0 bg-transparent focus-visible:ring-0 px-0"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={item.unit}
                      onValueChange={(value) => updateItem(index, 'unit', value)}
                    >
                      <SelectTrigger className="border-0 bg-transparent focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {QUOTATION_UNITS.map((unit) => (
                          <SelectItem key={unit.value} value={unit.value}>
                            {unit.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={item.rate}
                      onChange={(e) => updateItem(index, 'rate', parseFloat(e.target.value) || 0)}
                      min={0}
                      step={0.01}
                      className="border-0 bg-transparent focus-visible:ring-0 px-0"
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(item.amount)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => duplicateItem(index)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeItem(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
