 import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 import { supabase } from '@/integrations/supabase/client';
 import { useToast } from '@/hooks/use-toast';
 import { useAuth } from '@/contexts/AuthContext';
 import type { Json } from '@/integrations/supabase/types';
 import type { KitPreset, KitTouchSequenceItem, KitCycleBehavior } from '@/constants/kitConstants';
 
 export function useKitPresets() {
   const { toast } = useToast();
   const { user } = useAuth();
   const queryClient = useQueryClient();
 
   const presetsQuery = useQuery({
     queryKey: ['kit-presets'],
     queryFn: async (): Promise<KitPreset[]> => {
       const { data, error } = await supabase
         .from('kit_presets')
         .select('*')
         .order('name');
 
       if (error) throw error;
       
       return (data || []).map(preset => ({
         ...preset,
         touch_sequence: (preset.touch_sequence as unknown as KitTouchSequenceItem[]) || [],
         default_cycle_behavior: preset.default_cycle_behavior as KitCycleBehavior,
       }));
     },
   });
 
   const createPresetMutation = useMutation({
     mutationFn: async (preset: {
       name: string;
       description?: string;
       touch_sequence: KitTouchSequenceItem[];
       default_cycle_behavior: KitCycleBehavior;
     }) => {
       const { data, error } = await supabase
         .from('kit_presets')
         .insert([{
           name: preset.name,
           description: preset.description || null,
           touch_sequence: preset.touch_sequence as unknown as Json,
           default_cycle_behavior: preset.default_cycle_behavior,
           created_by: user?.email || 'system',
         }])
         .select()
         .single();
 
       if (error) throw error;
       return data;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['kit-presets'] });
       toast({ title: 'Preset created successfully' });
     },
     onError: (error: Error) => {
       toast({ title: 'Error creating preset', description: error.message, variant: 'destructive' });
     },
   });
 
   const updatePresetMutation = useMutation({
     mutationFn: async ({
       id,
       updates,
     }: {
       id: string;
       updates: Partial<{
         name: string;
         description: string | null;
         touch_sequence: KitTouchSequenceItem[];
         default_cycle_behavior: KitCycleBehavior;
         is_active: boolean;
       }>;
     }) => {
       const updateData: Record<string, unknown> = { ...updates };
       if (updates.touch_sequence) {
         updateData.touch_sequence = updates.touch_sequence as unknown as Json;
       }
 
       const { data, error } = await supabase
         .from('kit_presets')
         .update(updateData)
         .eq('id', id)
         .select()
         .single();
 
       if (error) throw error;
       return data;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['kit-presets'] });
       toast({ title: 'Preset updated successfully' });
     },
     onError: (error: Error) => {
       toast({ title: 'Error updating preset', description: error.message, variant: 'destructive' });
     },
   });
 
   const deletePresetMutation = useMutation({
     mutationFn: async (id: string) => {
       const { error } = await supabase.from('kit_presets').delete().eq('id', id);
       if (error) throw error;
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['kit-presets'] });
       toast({ title: 'Preset deleted successfully' });
     },
     onError: (error: Error) => {
       toast({ title: 'Error deleting preset', description: error.message, variant: 'destructive' });
     },
   });
 
   return {
     presets: presetsQuery.data || [],
     activePresets: (presetsQuery.data || []).filter(p => p.is_active),
     loading: presetsQuery.isLoading,
     error: presetsQuery.error,
     createPreset: createPresetMutation.mutateAsync,
     updatePreset: updatePresetMutation.mutateAsync,
     deletePreset: deletePresetMutation.mutateAsync,
     isCreating: createPresetMutation.isPending,
     isUpdating: updatePresetMutation.isPending,
     isDeleting: deletePresetMutation.isPending,
   };
 }