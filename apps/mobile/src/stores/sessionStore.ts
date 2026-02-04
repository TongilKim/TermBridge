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
  fetchSessions: (silent?: boolean) => Promise<void>;
  refreshSessions: () => Promise<void>;
  endSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  deleteEndedSessions: () => Promise<void>;
  deleteEndedSessionsForMachine: (machineId: string) => Promise<void>;
  clearError: () => void;
  setOpenSwipeableId: (id: string | null) => void;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  sessions: [],
  isLoading: false,
  error: null,
  pendingSessionId: null,
  openSwipeableId: null,

  fetchSessions: async (silent = false) => {
    // Prevent duplicate fetches
    if (get().isLoading) return;

    try {
      if (!silent) {
        set({ isLoading: true, error: null });
      }

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

  deleteEndedSessions: async () => {
    try {
      set({ isLoading: true });

      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('status', 'ended');

      if (error) throw error;

      // Remove ended sessions from local state
      set((state) => ({
        sessions: state.sessions.filter((session) => session.status !== 'ended'),
        isLoading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete ended sessions',
        isLoading: false,
      });
    }
  },

  deleteEndedSessionsForMachine: async (machineId: string) => {
    try {
      // Get ended session IDs for this machine
      const endedSessionIds = get()
        .sessions.filter((s) => s.machine_id === machineId && s.status === 'ended')
        .map((s) => s.id);

      if (endedSessionIds.length === 0) return;

      const { error } = await supabase
        .from('sessions')
        .delete()
        .in('id', endedSessionIds);

      if (error) throw error;

      // Remove from local state
      set((state) => ({
        sessions: state.sessions.filter(
          (session) => !(session.machine_id === machineId && session.status === 'ended')
        ),
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete ended sessions',
      });
    }
  },

  clearError: () => set({ error: null }),

  setOpenSwipeableId: (id: string | null) => set({ openSwipeableId: id }),
}));
