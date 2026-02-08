export const REALTIME_CHANNELS = {
  sessionOutput: (sessionId: string) => `session:${sessionId}:output`,
  sessionInput: (sessionId: string) => `session:${sessionId}:input`,
  sessionPresence: (sessionId: string) => `session:${sessionId}:presence`,
  machinePresence: (machineId: string) => `machine:${machineId}:presence`,
  machineInput: (machineId: string) => `machine:${machineId}:input`,
  machineOutput: (machineId: string) => `machine:${machineId}:output`,
} as const;

export const NOTIFICATION_TYPES = {
  TASK_COMPLETE: 'task_complete',
  ERROR: 'error',
  INPUT_REQUIRED: 'input_required',
  CONNECTION_LOST: 'connection_lost',
} as const;
