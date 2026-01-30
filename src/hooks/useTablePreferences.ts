import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  order: number;
  locked: boolean;
}

interface TablePreferences {
  columns: ColumnConfig[];
}

const defaultConfigs: Record<string, ColumnConfig[]> = {
  tasks: [
    { key: "starred", label: "Starred", visible: true, order: 0, locked: false },
    { key: "title", label: "Title", visible: true, order: 1, locked: true },
    { key: "type", label: "Type", visible: true, order: 2, locked: false },
    { key: "priority", label: "Priority", visible: true, order: 3, locked: false },
    { key: "assignedTo", label: "Assigned To", visible: true, order: 4, locked: false },
    { key: "relatedTo", label: "Related To", visible: true, order: 5, locked: false },
    { key: "dueDate", label: "Due Date", visible: true, order: 6, locked: false },
    { key: "recurrence", label: "Recurrence", visible: true, order: 7, locked: false },
    { key: "status", label: "Status", visible: true, order: 8, locked: false },
    { key: "createdAt", label: "Created", visible: false, order: 9, locked: false },
    { key: "createdBy", label: "Created By", visible: false, order: 10, locked: false },
    { key: "actions", label: "Actions", visible: true, order: 11, locked: true },
  ],
  leads: [
    { key: "name", label: "Name", visible: true, order: 0, locked: true },
    { key: "phone", label: "Phone", visible: true, order: 1, locked: false },
    { key: "email", label: "Email", visible: true, order: 2, locked: false },
    { key: "designation", label: "Designation", visible: true, order: 3, locked: false },
    { key: "sitePlusCode", label: "Plus Code", visible: false, order: 4, locked: false },
    { key: "source", label: "Source", visible: true, order: 4, locked: false },
    { key: "status", label: "Status", visible: true, order: 5, locked: false },
    { key: "priority", label: "Priority", visible: true, order: 6, locked: false },
    { key: "assignedTo", label: "Assigned To", visible: true, order: 7, locked: false },
    { key: "tasks", label: "Tasks", visible: true, order: 8, locked: false },
    { key: "nextFollowUp", label: "Next Follow-up", visible: true, order: 9, locked: false },
    { key: "createdAt", label: "Created", visible: false, order: 10, locked: false },
    { key: "actions", label: "Actions", visible: true, order: 11, locked: true },
  ],
  customers: [
    { key: "name", label: "Name", visible: true, order: 0, locked: true },
    { key: "phone", label: "Phone", visible: true, order: 1, locked: false },
    { key: "email", label: "Email", visible: true, order: 2, locked: false },
    { key: "customerType", label: "Type", visible: true, order: 3, locked: false },
    { key: "status", label: "Status", visible: true, order: 4, locked: false },
    { key: "priority", label: "Priority", visible: true, order: 5, locked: false },
    { key: "assignedTo", label: "Assigned To", visible: true, order: 6, locked: false },
    { key: "tasks", label: "Tasks", visible: true, order: 7, locked: false },
    { key: "totalOrders", label: "Total Orders", visible: false, order: 8, locked: false },
    { key: "totalSpent", label: "Total Spent", visible: false, order: 9, locked: false },
    { key: "createdAt", label: "Created", visible: false, order: 10, locked: false },
    { key: "actions", label: "Actions", visible: true, order: 11, locked: true },
  ],
  professionals: [
    { key: "name", label: "Name", visible: true, order: 0, locked: true },
    { key: "firmName", label: "Firm Name", visible: true, order: 1, locked: false },
    { key: "phone", label: "Phone", visible: true, order: 2, locked: false },
    { key: "professionalType", label: "Type", visible: true, order: 3, locked: false },
    { key: "city", label: "City", visible: true, order: 4, locked: false },
    { key: "status", label: "Status", visible: true, order: 5, locked: false },
    { key: "priority", label: "Priority", visible: true, order: 6, locked: false },
    { key: "assignedTo", label: "Assigned To", visible: true, order: 7, locked: false },
    { key: "serviceCategory", label: "Service Category", visible: false, order: 8, locked: false },
    { key: "rating", label: "Rating", visible: false, order: 9, locked: false },
    { key: "createdAt", label: "Created", visible: false, order: 10, locked: false },
    { key: "actions", label: "Actions", visible: true, order: 11, locked: true },
  ],
};

export function useTablePreferences(tableName: string) {
  const { user } = useAuth();
  const [columns, setColumns] = useState<ColumnConfig[]>(defaultConfigs[tableName] || []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load preferences from database
  const loadPreferences = useCallback(async () => {
    if (!user) {
      setColumns(defaultConfigs[tableName] || []);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("user_table_preferences")
        .select("column_config")
        .eq("user_id", user.id)
        .eq("table_name", tableName)
        .maybeSingle();

      if (error) throw error;

      if (data?.column_config) {
        const savedColumns = (data.column_config as unknown) as ColumnConfig[];
        // Merge with defaults to ensure new columns are included
        const defaultCols = defaultConfigs[tableName] || [];
        const mergedColumns = defaultCols.map((defaultCol) => {
          const savedCol = savedColumns.find((c) => c.key === defaultCol.key);
          if (savedCol) {
            return { ...defaultCol, ...savedCol, locked: defaultCol.locked };
          }
          return { ...defaultCol, order: savedColumns.length + defaultCol.order };
        });
        setColumns(mergedColumns.sort((a, b) => a.order - b.order));
      } else {
        setColumns(defaultConfigs[tableName] || []);
      }
    } catch (error) {
      console.error("Error loading table preferences:", error);
      setColumns(defaultConfigs[tableName] || []);
    } finally {
      setLoading(false);
    }
  }, [user, tableName]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Save preferences to database
  const savePreferences = useCallback(
    async (newColumns: ColumnConfig[]) => {
      if (!user) return;

      setSaving(true);
      try {
        const { data: existing } = await supabase
          .from("user_table_preferences")
          .select("id")
          .eq("user_id", user.id)
          .eq("table_name", tableName)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("user_table_preferences")
            .update({ column_config: newColumns as unknown as any })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("user_table_preferences")
            .insert({
              user_id: user.id,
              table_name: tableName,
              column_config: newColumns as unknown as any,
            });
          if (error) throw error;
        }
        setColumns(newColumns);
      } catch (error) {
        console.error("Error saving table preferences:", error);
      } finally {
        setSaving(false);
      }
    },
    [user, tableName]
  );

  // Reset to defaults
  const resetToDefaults = useCallback(async () => {
    if (!user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_table_preferences")
        .delete()
        .eq("user_id", user.id)
        .eq("table_name", tableName);

      if (error) throw error;
      setColumns(defaultConfigs[tableName] || []);
    } catch (error) {
      console.error("Error resetting preferences:", error);
    } finally {
      setSaving(false);
    }
  }, [user, tableName]);

  // Toggle column visibility
  const toggleColumn = useCallback(
    (key: string) => {
      const newColumns = columns.map((col) =>
        col.key === key && !col.locked ? { ...col, visible: !col.visible } : col
      );
      setColumns(newColumns);
    },
    [columns]
  );

  // Reorder columns
  const reorderColumns = useCallback(
    (sourceIndex: number, destinationIndex: number) => {
      const result = Array.from(columns);
      const [removed] = result.splice(sourceIndex, 1);
      result.splice(destinationIndex, 0, removed);

      const reordered = result.map((col, idx) => ({ ...col, order: idx }));
      setColumns(reordered);
    },
    [columns]
  );

  // Get visible columns in order
  const visibleColumns = columns
    .filter((col) => col.visible)
    .sort((a, b) => a.order - b.order);

  return {
    columns,
    visibleColumns,
    loading,
    saving,
    toggleColumn,
    reorderColumns,
    savePreferences,
    resetToDefaults,
    setColumns,
  };
}
