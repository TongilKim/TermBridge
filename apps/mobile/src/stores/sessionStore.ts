import { create } from 'zustand';
import { supabase } from '../services/supabase';
import type { Session } from 'termbridge-shared';

interface SessionStoreState {
  sessions: Session[];
  isLoading: boolean;
  error: string | null;
  pendingSessionId: string | null; // Session being disconnected/deleted
  openSwipeableId: string | null; // Currently open swipeable session

  // Actions
  fetchSessions: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  endSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  clearError: () => void;
  setOpenSwipeableId: (id: string | null) => void;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  sessions: [],
  isLoading: false,
  error: null,
  pendingSessionId: null,
  openSwipeableId: null,

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

  endSession: async (sessionId: string) => {
    try {
      set({ pendingSessionId: sessionId });

      const { error } = await supabase
        .from('sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', sessionId);

      if (error) throw error;

      // Update local state
      set((state) => ({
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? { ...session, status: 'ended' as const, ended_at: new Date().toISOString() }
            : session
        ),
        pendingSessionId: null,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to end session',
        pendingSessionId: null,
      });
    }
  },

  deleteSession: async (sessionId: string) => {
    try {
      set({ pendingSessionId: sessionId });

      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;

      // Remove from local state
      set((state) => ({
        sessions: state.sessions.filter((session) => session.id !== sessionId),
        pendingSessionId: null,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete session',
        pendingSessionId: null,
      });
    }
  },

  clearError: () => set({ error: null }),

  setOpenSwipeableId: (id: string | null) => set({ openSwipeableId: id }),
}));
