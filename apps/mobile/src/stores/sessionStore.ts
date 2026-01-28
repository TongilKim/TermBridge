import { create } from 'zustand';
import { supabase } from '../services/supabase';
import type { Session } from '@termbridge/shared';

interface SessionStoreState {
  sessions: Session[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchSessions: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  clearError: () => void;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  sessions: [],
  isLoading: false,
  error: null,

  fetchSessions: async () => {
    try {
      set({ isLoading: true, error: null });

      const { data, error } = await supabase
        .from('sessions')
        .select(
          `
          *,
          machines (
            id,
            name,
            hostname,
            status
          )
        `
        )
        .order('started_at', { ascending: false });

      if (error) throw error;

      set({
        sessions: data as Session[],
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch sessions',
        isLoading: false,
      });
    }
  },

  refreshSessions: async () => {
    // Same as fetchSessions but can be called when pull-to-refresh
    await get().fetchSessions();
  },

  clearError: () => set({ error: null }),
}));
