import type { Appointment, BehaviourDefinition, TaskTrackingItem } from './types'

const now = Date.now()

export const mockAppointments: Appointment[] = [
  {
    id: 'apt-1001',
    clientId: 'client-001',
    clientName: 'Client A',
    clinicianId: 'clin-001',
    clinicianName: 'Jordan Lee',
    startsAt: new Date(now + 15 * 60 * 1000).toISOString(),
    endsAt: new Date(now + 75 * 60 * 1000).toISOString(),
    status: 'scheduled',
    location: 'Desk Session Room 1',
  },
  {
    id: 'apt-1002',
    clientId: 'client-002',
    clientName: 'Client B',
    clinicianId: 'clin-001',
    clinicianName: 'Jordan Lee',
    startsAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
    endsAt: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
    status: 'scheduled',
    location: 'Desk Session Room 2',
  },
  {
    id: 'apt-1003',
    clientId: 'client-003',
    clientName: 'Client C',
    clinicianId: 'clin-002',
    clinicianName: 'Alex Kim',
    startsAt: new Date(now - 40 * 60 * 1000).toISOString(),
    endsAt: new Date(now + 20 * 60 * 1000).toISOString(),
    status: 'in_progress',
    location: 'Desk Session Room 3',
  },
]

export const mockBehaviourDefinitions: BehaviourDefinition[] = [
  { id: 'beh-01', name: 'Out of seat', description: 'Leaves assigned seat without instruction.' },
  { id: 'beh-02', name: 'Vocal disruption', description: 'Loud vocalization interrupting task flow.' },
  { id: 'beh-03', name: 'Task refusal', description: 'Refuses to begin or continue assigned work.' },
]

export const defaultDeskSessionTasks: Array<Pick<TaskTrackingItem, 'taskName'>> = [
  { taskName: 'Worksheet completion' },
  { taskName: 'Reading comprehension trial' },
  { taskName: 'Math fluency block' },
  { taskName: 'Instruction following sequence' },
]
