import React from "react";

export interface FilterableHeaderProps<TSortField> {
  sortField?: TSortField;
  label: string;
  options: string[];
  selected: string[];
  onSelectionChange: (v: string[]) => void;
  placeholder: string;
  renderLabel?: (key: string) => string;
  SortableHeader: React.FC<{ field: TSortField; children: React.ReactNode }>;
  MultiSelectFilter: React.FC<{
    options: string[];
    selected: string[];
    onSelectionChange: (values: string[]) => void;
    placeholder: string;
    renderLabel?: (option: string) => string;
  }>;
}

export function FilterableHeader<TSortField>({
  sortField,
  label,
  options,
  selected,
  onSelectionChange,
  placeholder,
  renderLabel,
  SortableHeader,
  MultiSelectFilter,
}: FilterableHeaderProps<TSortField>) {
  return (
    <div className="flex items-center justify-between">
      {sortField ? (
        <SortableHeader field={sortField}>{label}</SortableHeader>
      ) : (
        <span>{label}</span>
      )}
      <MultiSelectFilter
        options={options}
        selected={selected}
        onSelectionChange={onSelectionChange}
        placeholder={placeholder}
        renderLabel={renderLabel}
      />
    </div>
  );
}
