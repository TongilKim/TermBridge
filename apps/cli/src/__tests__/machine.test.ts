import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MachineManager } from '../daemon/machine.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as os from 'os';

vi.mock('os', () => ({
  hostname: vi.fn(() => 'test-hostname'),
}));

describe('MachineManager', () => {
  let mockSupabase: Partial<SupabaseClient>;
  let machineManager: MachineManager;

  const mockMachine = {
    id: 'machine-123',
    user_id: 'user-456',
    name: 'Test Machine',
    hostname: 'test-hostname',
    status: 'online',
    last_seen_at: '2024-01-01T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
  };

  // Helper to create chainable eq mock
  const createChainableEq = (finalResult: any) => {
    const eqMock: any = vi.fn();
    eqMock.mockReturnValue({
      eq: eqMock,
      single: vi.fn().mockResolvedValue(finalResult),
      order: vi.fn().mockResolvedValue(finalResult),
    });
    return eqMock;
  };

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockMachine, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        select: vi.fn().mockReturnValue({
          eq: createChainableEq({ data: mockMachine, error: null }),
          order: vi.fn().mockResolvedValue({ data: [mockMachine], error: null }),
        }),
      }),
    };

    machineManager = new MachineManager({
      supabase: mockSupabase as SupabaseClient,
    });
  });

  it('should register new machine with user ID', async () => {
    const machine = await machineManager.registerMachine('user-456');

    expect(machine).toBeDefined();
    expect(machine.user_id).toBe('user-456');
    expect(mockSupabase.from).toHaveBeenCalledWith('machines');
  });

  it('should use hostname as default machine name', async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: mockMachine, error: null }),
      }),
    });

    mockSupabase.from = vi.fn().mockReturnValue({
      insert: insertMock,
      select: vi.fn().mockReturnValue({
        eq: createChainableEq({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        }),
      }),
    });

    machineManager = new MachineManager({
      supabase: mockSupabase as SupabaseClient,
    });

    await machineManager.registerMachine('user-456');

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: 'test-hostname',
        name: 'test-hostname',
      })
    );
  });

  it('should allow custom machine name', async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: mockMachine, error: null }),
      }),
    });

    mockSupabase.from = vi.fn().mockReturnValue({
      insert: insertMock,
      select: vi.fn().mockReturnValue({
        eq: createChainableEq({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        }),
      }),
    });

    machineManager = new MachineManager({
      supabase: mockSupabase as SupabaseClient,
    });

    await machineManager.registerMachine('user-456', 'My Custom Name');

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'My Custom Name',
      })
    );
  });

  it('should set machine status to online on registration', async () => {
    const machine = await machineManager.registerMachine('user-456');

    expect(machine.status).toBe('online');
  });

  it('should get machine by ID', async () => {
    const machine = await machineManager.getMachine('machine-123');

    expect(machine).toBeDefined();
    expect(machine?.id).toBe('machine-123');
  });

  it('should return null for non-existent machine', async () => {
    mockSupabase.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116', message: 'Not found' },
          }),
        }),
      }),
    });

    machineManager = new MachineManager({
      supabase: mockSupabase as SupabaseClient,
    });

    const machine = await machineManager.getMachine('non-existent');

    expect(machine).toBeNull();
  });

  it('should update machine status', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockSupabase.from = vi.fn().mockReturnValue({
      update: updateMock,
    });

    await machineManager.updateMachineStatus('machine-123', 'offline');

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'offline',
      })
    );
  });

  it('should update last_seen_at on heartbeat', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockSupabase.from = vi.fn().mockReturnValue({
      update: updateMock,
    });

    await machineManager.heartbeat('machine-123');

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        last_seen_at: expect.any(String),
      })
    );
  });

  it('should list machines for user', async () => {
    const selectMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [mockMachine], error: null }),
      }),
    });

    mockSupabase.from = vi.fn().mockReturnValue({
      select: selectMock,
    });

    const machines = await machineManager.listMachines('user-456');

    expect(machines).toBeDefined();
    expect(machines.length).toBe(1);
    expect(machines[0].user_id).toBe('user-456');
  });

  it('should throw error on database failure', async () => {
    mockSupabase.from = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' },
          }),
        }),
      }),
      select: vi.fn().mockReturnValue({
        eq: createChainableEq({
          data: null,
          error: { code: 'PGRST116', message: 'Not found' },
        }),
      }),
    });

    machineManager = new MachineManager({
      supabase: mockSupabase as SupabaseClient,
    });

    await expect(
      machineManager.registerMachine('user-456')
    ).rejects.toThrow('Failed to register machine');
  });

  it('should return existing machine when hostname already registered for user', async () => {
    const existingMachine = {
      id: 'existing-machine-id',
      user_id: 'user-456',
      name: 'Existing Machine',
      hostname: 'test-hostname',
      status: 'offline',
      last_seen_at: '2024-01-01T00:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
    };

    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    // Mock the hostname lookup: .select().eq('user_id', ...).eq('hostname', ...).single()
    const hostnameEqMock = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: existingMachine,
        error: null,
      }),
    });

    const userIdEqMock = vi.fn().mockReturnValue({
      eq: hostnameEqMock,
    });

    const selectMock = vi.fn().mockReturnValue({
      eq: userIdEqMock,
    });

    mockSupabase.from = vi.fn().mockReturnValue({
      select: selectMock,
      update: updateMock,
    });

    machineManager = new MachineManager({
      supabase: mockSupabase as SupabaseClient,
    });

    // Call without machineId - should trigger hostname lookup
    const machine = await machineManager.registerMachine('user-456');

    // Verify the correct query chain was called
    expect(selectMock).toHaveBeenCalled();
    expect(userIdEqMock).toHaveBeenCalledWith('user_id', 'user-456');
    expect(hostnameEqMock).toHaveBeenCalledWith('hostname', 'test-hostname');

    // Should return existing machine instead of creating new one
    expect(machine.id).toBe('existing-machine-id');

    // Should update status to online
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'online',
      })
    );
  });
});
