import React, { createContext, useContext, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type RemindersRealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, any>;
  old: Record<string, any>;
};

type ListenerFn = (payload: RemindersRealtimePayload) => void;

interface RemindersContextValue {
  addListener: (fn: ListenerFn) => void;
  removeListener: (fn: ListenerFn) => void;
}

const RemindersContext = createContext<RemindersContextValue | null>(null);

export function RemindersProvider({ children }: { children: React.ReactNode }) {
  // Use a ref so listeners Set is stable across renders
  // without causing the useEffect to re-run
  const listenersRef = useRef<Set<ListenerFn>>(new Set());

  useEffect(() => {
    const channel = supabase
      .channel('shared-reminders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reminders' },
        (payload) => {
          // Broadcast to all registered useReminders instances
          listenersRef.current.forEach((fn) =>
            fn(payload as RemindersRealtimePayload)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // Empty deps — one channel for the entire app lifetime

  const addListener = (fn: ListenerFn) => {
    listenersRef.current.add(fn);
  };

  const removeListener = (fn: ListenerFn) => {
    listenersRef.current.delete(fn);
  };

  return (
    <RemindersContext.Provider value={{ addListener, removeListener }}>
      {children}
    </RemindersContext.Provider>
  );
}

// Returns null if used outside RemindersProvider (safe fallback)
export function useRemindersChannel(): RemindersContextValue | null {
  return useContext(RemindersContext);
}
