import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Filter, Search, X } from "lucide-react";
import { 
  ACTIVITY_FILTER_CATEGORIES, 
  DATE_GROUPING_OPTIONS 
} from "@/constants/activityLogConstants";

interface ActivityLogFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  dateGrouping: string;
  onDateGroupingChange: (grouping: string) => void;
  selectedCategories: string[];
  onCategoriesChange: (categories: string[]) => void;
}

export function ActivityLogFilters({
  searchQuery,
  onSearchChange,
  dateGrouping,
  onDateGroupingChange,
  selectedCategories,
  onCategoriesChange,
}: ActivityLogFiltersProps) {
  const toggleCategory = (category: string) => {
    if (selectedCategories.includes(category)) {
      onCategoriesChange(selectedCategories.filter(c => c !== category));
    } else {
      onCategoriesChange([...selectedCategories, category]);
    }
  };

  const clearFilters = () => {
    onCategoriesChange([]);
    onSearchChange('');
  };

  const hasActiveFilters = selectedCategories.length > 0 || searchQuery.length > 0;

  return (
    <div className="space-y-3">
      {/* Date Grouping Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {DATE_GROUPING_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={dateGrouping === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => onDateGroupingChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {/* Search and Filter Row */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search activities..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6"
              onClick={() => onSearchChange('')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Filter Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Filter
              {selectedCategories.length > 0 && (
                <span className="ml-1 bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-xs">
                  {selectedCategories.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Filter by Activity Type</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ACTIVITY_FILTER_CATEGORIES.map((category) => (
              <DropdownMenuCheckboxItem
                key={category.value}
                checked={selectedCategories.includes(category.value)}
                onCheckedChange={() => toggleCategory(category.value)}
              >
                {category.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
              >
                Clear All Filters
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
