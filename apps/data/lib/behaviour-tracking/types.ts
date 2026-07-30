export type AppointmentStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

export interface Appointment {
  id: string
  clientId: string
  clientName: string
  clinicianId: string
  clinicianName: string
  startsAt: string
  endsAt: string
  status: AppointmentStatus
  location?: string
}

export interface ClinicianClient {
  id: string
  name: string
  email?: string
  status?: string
  sessionType?: string
}

export interface BehaviourDefinition {
  id: string
  name: string
  description?: string
}

export interface TrackingTimerLabels {
  onTask: string
  offTask: string
}

export interface ClientTrackingProfile {
  behaviours: BehaviourDefinition[]
  taskTemplates: string[]
  timerLabels: TrackingTimerLabels
}

export interface BehaviourEvent {
  id: string
  behaviourId: string
  behaviourName: string
  timestamp: string
  appointmentId: string
  clientId: string
  clinicianId: string
  notes?: string
}

export type TaskPromptLevel =
  | 'independent'
  | 'verbal_prompt'
  | 'gestural_prompt'
  | 'model_prompt'
  | 'physical_prompt'
  | 'not_completed'

export interface TaskTrackingItem {
  id: string
  taskName: string
  promptLevel: TaskPromptLevel
  completed: boolean
  timestamp: string
  appointmentId: string
  clientId: string
  clinicianId: string
}

export type OnOffTaskStatus = 'on_task' | 'off_task'

export interface OnOffTaskInterval {
  id: string
  status: OnOffTaskStatus
  startTime: string
  endTime: string
  durationSeconds: number
  appointmentId: string
  clientId: string
}

export interface BehaviourSessionSummary {
  sessionDurationSeconds: number
  behaviourFrequencyCount: number
  averageInterResponseSeconds: number
  onTaskPercentage: number
  offTaskPercentage: number
  independentTaskCompletionPercentage: number
  promptedTaskCount: number
}

export interface ClientReportSummary {
  clientId: string
  clientName: string
  appointmentsTracked: number
  behaviourEventCount: number
  onTaskSeconds: number
  offTaskSeconds: number
  onTaskPercentage: number
  independentTaskCount: number
  promptedTaskCount: number
  notCompletedTaskCount: number
  lastCapturedAt?: string
}

export interface ClientAppointmentTrendPoint {
  appointmentId: string
  appointmentLabel: string
  sessionDate: string
  behaviourEventCount: number
  onTaskPercentage: number
  independentPercentage: number
  promptedTaskCount: number
  notCompletedTaskCount: number
}

export type GoalStatus = 'not_started' | 'in_progress' | 'completed' | 'on_hold'

export type GoalPriority = 'low' | 'medium' | 'high'

export interface ClinicianGoal {
  id: string
  clientId: string
  clinicianId: string
  title: string
  description?: string
  targetDate?: string
  status: GoalStatus
  priority: GoalPriority
  progressPercent: number
  aiSuggested: boolean
  createdAt: string
  updatedAt: string
}

export interface GoalProgressEntry {
  id: string
  goalId: string
  note: string
  progressDelta: number
  progressPercent: number
  createdAt: string
}
