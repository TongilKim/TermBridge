export type MachineStatus = 'online' | 'offline';

export interface Machine {
  id: string;
  user_id: string;
  name: string;
  hostname?: string;
  last_seen_at?: string;
  status: MachineStatus;
  created_at: string;
}
