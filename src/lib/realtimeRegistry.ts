import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type PostgresChangesCallback = (payload: any) => void;

interface RegistryEntry {
  channel: RealtimeChannel;
  refCount: number;
  callbacks: Set<PostgresChangesCallback>;
  teardownTimeoutId: ReturnType<typeof setTimeout> | null;
}

class RealtimeRegistry {
  private entries: Map<string, RegistryEntry> = new Map();
  private readonly TEARDOWN_DELAY_MS = 2000; // 2 seconds debounce

  /**
   * Subscribe to a channel with ref-counting and shared listeners.
   * If the channel is already active, it registers the callback and increments the ref count.
   * If a teardown is pending for the channel, it cancels it.
   */
  public subscribe(
    channelName: string,
    filter: {
      event: string;
      schema: string;
      table: string;
      filter?: string;
    },
    callback: PostgresChangesCallback
  ): () => void {
    let entry = this.entries.get(channelName);

    if (entry) {
      // Cancel pending teardown if any
      if (entry.teardownTimeoutId) {
        clearTimeout(entry.teardownTimeoutId);
        entry.teardownTimeoutId = null;
      }
      entry.refCount += 1;
      entry.callbacks.add(callback);
    } else {
      // Create new channel and subscription
      const callbacks = new Set<PostgresChangesCallback>([callback]);

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          filter as any,
          (payload) => {
            // Broadcast event to all registered callbacks
            callbacks.forEach((cb) => {
              try {
                cb(payload);
              } catch (e) {
                console.error(`Error in realtime callback for channel ${channelName}:`, e);
              }
            });
          }
        )
        .subscribe();

      entry = {
        channel,
        refCount: 1,
        callbacks,
        teardownTimeoutId: null,
      };

      this.entries.set(channelName, entry);
    }

    // Return the unsubscribe function
    return () => {
      this.unsubscribe(channelName, callback);
    };
  }

  /**
   * Unsubscribes a callback and decrements the ref count.
   * If ref count reaches 0, it schedules the channel for deletion after a delay.
   */
  private unsubscribe(channelName: string, callback: PostgresChangesCallback): void {
    const entry = this.entries.get(channelName);
    if (!entry) return;

    entry.callbacks.delete(callback);
    entry.refCount -= 1;

    if (entry.refCount <= 0) {
      // Cancel any existing timeout (safety check)
      if (entry.teardownTimeoutId) {
        clearTimeout(entry.teardownTimeoutId);
      }

      // Schedule unsubscription
      entry.teardownTimeoutId = setTimeout(() => {
        const currentEntry = this.entries.get(channelName);
        if (currentEntry && currentEntry.refCount <= 0) {
          try {
            supabase.removeChannel(currentEntry.channel);
          } catch (e) {
            console.error(`Failed to remove channel ${channelName}:`, e);
          }
          this.entries.delete(channelName);
        }
      }, this.TEARDOWN_DELAY_MS);
    }
  }
}

export const realtimeRegistry = new RealtimeRegistry();
