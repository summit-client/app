import type {
  Appointment,
  BehaviourEvent,
  BehaviourSessionSummary,
  ClientAppointmentTrendPoint,
  ClinicianGoal,
  ClientReportSummary,
  ClinicianClient,
  GoalProgressEntry,
  GoalStatus,
  OnOffTaskInterval,
  TaskPromptLevel,
  TaskTrackingItem,
} from './types'
import { supabase } from '@summit/db'
import { defaultDeskSessionTasks } from './mockData'

interface SchedulerSessionRow {
  id: number
  client_id: number
  employee_id: number
  session_date: string
  hour: number
  minute: number | null
  type: string | null
  status: string | null
}

interface SchedulerClientRow {
  id: number
  name: string | null
  email?: string | null
  status?: string | null
  session_type?: string | null
}

interface SchedulerStaffRow {
  id: number
  name: string | null
  location_id: number | null
}

interface SchedulerSessionTypeRow {
  name: string
  duration: number | null
}

interface SchedulerLocationRow {
  id: number
  name: string | null
}

interface ReportBehaviourEventRow {
  client_id: string
  appointment_id: string
  event_timestamp: string
}

interface ReportIntervalRow {
  client_id: string
  status: 'on_task' | 'off_task'
  duration_seconds: number
}

interface ReportTaskRow {
  client_id: string
  prompt_level: TaskPromptLevel
  completed: boolean
}

interface BehaviourTimestampRow {
  event_timestamp: string
}

interface SessionTrendRow {
  id: number
  session_date: string
  hour: number
  minute: number | null
}

interface BehaviourTrendRow {
  appointment_id: string
}

interface IntervalTrendRow {
  appointment_id: string
  status: 'on_task' | 'off_task'
  duration_seconds: number
}

interface TaskTrendRow {
  appointment_id: string
  prompt_level: TaskPromptLevel
  completed: boolean
}

interface ClinicianGoalRow {
  id: string
  client_id: string
  clinician_id: string
  title: string
  description: string | null
  target_date: string | null
  status: GoalStatus
  priority: 'low' | 'medium' | 'high'
  progress_percent: number
  ai_suggested: boolean
  created_at: string
  updated_at: string
}

interface GoalProgressEntryRow {
  id: string
  goal_id: string
  note: string
  progress_delta: number
  progress_percent: number
  created_at: string
}

function statusToAppointmentStatus(status: string | null): Appointment['status'] {
  if (status === 'cancelled') return 'cancelled'
  if (status === 'completed') return 'completed'
  if (status === 'in_progress') return 'in_progress'
  return 'scheduled'
}

function buildDateTimeIso(date: string, hour: number, minute: number = 0): string {
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return new Date(`${date}T${hh}:${mm}:00`).toISOString()
}

function mapSchedulerSessionsToAppointments(params: {
  sessions: SchedulerSessionRow[]
  clients: SchedulerClientRow[]
  staff: SchedulerStaffRow[]
  sessionTypes: SchedulerSessionTypeRow[]
  locations: SchedulerLocationRow[]
}): Appointment[] {
  const { sessions, clients, staff, sessionTypes, locations } = params

  const clientsById = new Map(clients.map(client => [client.id, client]))
  const staffById = new Map(staff.map(member => [member.id, member]))
  const locationsById = new Map(locations.map(location => [location.id, location]))
  const durationsByType = new Map(sessionTypes.map(item => [item.name, item.duration ?? 60]))

  return sessions.map(session => {
    const clinician = staffById.get(session.employee_id)
    const client = clientsById.get(session.client_id)
    const durationMinutes = durationsByType.get(session.type ?? '') ?? 60
    const startsAt = buildDateTimeIso(session.session_date, session.hour, session.minute ?? 0)
    const endsAt = new Date(+new Date(startsAt) + durationMinutes * 60 * 1000).toISOString()

    return {
      id: String(session.id),
      clientId: String(session.client_id),
      clientName: client?.name ?? `Client ${session.client_id}`,
      clinicianId: String(session.employee_id),
      clinicianName: clinician?.name ?? `Staff ${session.employee_id}`,
      startsAt,
      endsAt,
      status: statusToAppointmentStatus(session.status),
      location:
        clinician?.location_id != null
          ? (locationsById.get(clinician.location_id)?.name ?? 'Location not set')
          : 'Location not set',
    }
  })
}

export async function fetchClinicianAppointments(): Promise<Appointment[]> {
  const [sessionsRes, clientsRes, staffRes, sessionTypesRes, locationsRes] = await Promise.all([
    supabase.from('sessions').select('*').neq('status', 'cancelled'),
    supabase.from('clients').select('id, name'),
    supabase.from('staff').select('id, name, location_id'),
    supabase.from('session_types').select('name, duration'),
    supabase.from('locations').select('id, name'),
  ])

  if (sessionsRes.error) {
    throw new Error(sessionsRes.error.message)
  }

  const appointments = mapSchedulerSessionsToAppointments({
    sessions: (sessionsRes.data ?? []) as SchedulerSessionRow[],
    clients: (clientsRes.data ?? []) as SchedulerClientRow[],
    staff: (staffRes.data ?? []) as SchedulerStaffRow[],
    sessionTypes: (sessionTypesRes.data ?? []) as SchedulerSessionTypeRow[],
    locations: (locationsRes.data ?? []) as SchedulerLocationRow[],
  })

  return appointments.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
}

export async function fetchAppointmentById(appointmentId: string): Promise<Appointment | null> {
  const appointments = await fetchClinicianAppointments()
  return appointments.find(appointment => appointment.id === appointmentId) ?? null
}

export async function fetchClinicianClients(): Promise<ClinicianClient[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, email, status, session_type')
    .order('name')

  if (error) {
    throw new Error(error.message)
  }

  return ((data ?? []) as SchedulerClientRow[]).map(client => ({
    id: String(client.id),
    name: client.name ?? `Client ${client.id}`,
    email: client.email ?? undefined,
    status: client.status ?? undefined,
    sessionType: client.session_type ?? undefined,
  }))
}

export function createInitialTaskItems(
  appointmentId: string,
  clientId: string,
  clinicianId: string,
  taskTemplates?: string[]
): TaskTrackingItem[] {
  const templates = taskTemplates?.length
    ? taskTemplates.map(taskName => ({ taskName }))
    : defaultDeskSessionTasks

  return templates.map((task, index) => ({
    id: `task-${appointmentId}-${index + 1}`,
    taskName: task.taskName,
    promptLevel: 'not_completed',
    completed: false,
    timestamp: new Date().toISOString(),
    appointmentId,
    clientId,
    clinicianId,
  }))
}

export async function saveBehaviourEvent(event: BehaviourEvent): Promise<void> {
  try {
    const { error } = await supabase.from('behaviour_events').upsert({
      id: event.id,
      behaviour_id: event.behaviourId,
      behaviour_name: event.behaviourName,
      event_timestamp: event.timestamp,
      appointment_id: event.appointmentId,
      client_id: event.clientId,
      clinician_id: event.clinicianId,
      notes: event.notes ?? null,
    })
    if (error) console.warn('saveBehaviourEvent failed:', error.message)
  } catch (error) {
    console.warn('saveBehaviourEvent exception:', error)
  }
}

export async function saveOnOffTaskInterval(interval: OnOffTaskInterval): Promise<void> {
  try {
    const { error } = await supabase.from('on_off_task_intervals').upsert({
      id: interval.id,
      status: interval.status,
      start_time: interval.startTime,
      end_time: interval.endTime,
      duration_seconds: interval.durationSeconds,
      appointment_id: interval.appointmentId,
      client_id: interval.clientId,
    })
    if (error) console.warn('saveOnOffTaskInterval failed:', error.message)
  } catch (error) {
    console.warn('saveOnOffTaskInterval exception:', error)
  }
}

export async function saveTaskTrackingItem(item: TaskTrackingItem): Promise<void> {
  try {
    const { error } = await supabase.from('task_tracking_items').upsert({
      id: item.id,
      task_name: item.taskName,
      prompt_level: item.promptLevel,
      completed: item.completed,
      event_timestamp: item.timestamp,
      appointment_id: item.appointmentId,
      client_id: item.clientId,
      clinician_id: item.clinicianId,
    })
    if (error) console.warn('saveTaskTrackingItem failed:', error.message)
  } catch (error) {
    console.warn('saveTaskTrackingItem exception:', error)
  }
}

export async function fetchClientReportSummaries(): Promise<ClientReportSummary[]> {
  const [clientsRes, sessionsRes, behaviourRes, intervalsRes, tasksRes] = await Promise.all([
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('sessions').select('id, client_id, session_date').neq('status', 'cancelled'),
    supabase
      .from('behaviour_events')
      .select('client_id, appointment_id, event_timestamp')
      .order('event_timestamp', { ascending: false }),
    supabase.from('on_off_task_intervals').select('client_id, status, duration_seconds'),
    supabase.from('task_tracking_items').select('client_id, prompt_level, completed'),
  ])

  if (clientsRes.error) throw new Error(clientsRes.error.message)
  if (sessionsRes.error) throw new Error(sessionsRes.error.message)

  const clients = (clientsRes.data ?? []) as SchedulerClientRow[]
  const sessions = (sessionsRes.data ?? []) as Array<{ id: number; client_id: number; session_date: string }>
  const behaviourEvents = (behaviourRes.data ?? []) as ReportBehaviourEventRow[]
  const intervals = (intervalsRes.data ?? []) as ReportIntervalRow[]
  const tasks = (tasksRes.data ?? []) as ReportTaskRow[]

  return clients.map(client => {
    const clientId = String(client.id)
    const clientSessions = sessions.filter(session => String(session.client_id) === clientId)
    const clientEvents = behaviourEvents.filter(event => event.client_id === clientId)
    const clientIntervals = intervals.filter(interval => interval.client_id === clientId)
    const clientTasks = tasks.filter(task => task.client_id === clientId)

    const onTaskSeconds = clientIntervals
      .filter(interval => interval.status === 'on_task')
      .reduce((sum, interval) => sum + (interval.duration_seconds || 0), 0)

    const offTaskSeconds = clientIntervals
      .filter(interval => interval.status === 'off_task')
      .reduce((sum, interval) => sum + (interval.duration_seconds || 0), 0)

    const trackedSeconds = onTaskSeconds + offTaskSeconds
    const onTaskPercentage = trackedSeconds ? Math.round((onTaskSeconds / trackedSeconds) * 100) : 0

    const independentTaskCount = clientTasks.filter(
      task => task.completed && task.prompt_level === 'independent'
    ).length

    const promptedTaskCount = clientTasks.filter(
      task => task.completed && task.prompt_level !== 'independent' && task.prompt_level !== 'not_completed'
    ).length

    const notCompletedTaskCount = clientTasks.filter(task => task.prompt_level === 'not_completed').length

    const lastEvent = clientEvents[0]?.event_timestamp

    return {
      clientId,
      clientName: client.name ?? `Client ${client.id}`,
      appointmentsTracked: clientSessions.length,
      behaviourEventCount: clientEvents.length,
      onTaskSeconds,
      offTaskSeconds,
      onTaskPercentage,
      independentTaskCount,
      promptedTaskCount,
      notCompletedTaskCount,
      lastCapturedAt: lastEvent,
    }
  })
}

export async function fetchClientFrequencyTimeSeries(
  clientId: string,
  rangeDays: number | null = null
): Promise<Array<{ label: string; frequency: number }>> {
  let query = supabase
    .from('behaviour_events')
    .select('event_timestamp')
    .eq('client_id', clientId)
    .order('event_timestamp', { ascending: true })

  if (rangeDays != null) {
    const cutoffIso = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString()
    query = query.gte('event_timestamp', cutoffIso)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  const rows = (data ?? []) as BehaviourTimestampRow[]
  if (!rows.length) return []

  const bucketMap = new Map<string, number>()
  rows.forEach(row => {
    const date = new Date(row.event_timestamp)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const key = `${month}-${day} ${hour}:00`
    bucketMap.set(key, (bucketMap.get(key) ?? 0) + 1)
  })

  return Array.from(bucketMap.entries()).map(([label, frequency]) => ({ label, frequency }))
}

export async function fetchClientAppointmentTrends(
  clientId: string,
  rangeDays: number | null = null
): Promise<ClientAppointmentTrendPoint[]> {
  const cutoffDate =
    rangeDays != null
      ? new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      : null

  let sessionsQuery = supabase
    .from('sessions')
    .select('id, session_date, hour, minute')
    .eq('client_id', Number(clientId))
    .neq('status', 'cancelled')
    .order('session_date', { ascending: true })
    .order('hour', { ascending: true })
    .order('minute', { ascending: true })

  if (cutoffDate) {
    sessionsQuery = sessionsQuery.gte('session_date', cutoffDate)
  }

  let behaviourQuery = supabase.from('behaviour_events').select('appointment_id').eq('client_id', clientId)
  let intervalsQuery = supabase
    .from('on_off_task_intervals')
    .select('appointment_id, status, duration_seconds')
    .eq('client_id', clientId)
  let tasksQuery = supabase
    .from('task_tracking_items')
    .select('appointment_id, prompt_level, completed')
    .eq('client_id', clientId)

  if (rangeDays != null) {
    const cutoffIso = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString()
    behaviourQuery = behaviourQuery.gte('event_timestamp', cutoffIso)
    intervalsQuery = intervalsQuery.gte('start_time', cutoffIso)
    tasksQuery = tasksQuery.gte('event_timestamp', cutoffIso)
  }

  const [sessionsRes, behaviourRes, intervalsRes, tasksRes] = await Promise.all([
    sessionsQuery,
    behaviourQuery,
    intervalsQuery,
    tasksQuery,
  ])

  if (sessionsRes.error) throw new Error(sessionsRes.error.message)

  const sessions = (sessionsRes.data ?? []) as SessionTrendRow[]
  const behaviourRows = (behaviourRes.data ?? []) as BehaviourTrendRow[]
  const intervalRows = (intervalsRes.data ?? []) as IntervalTrendRow[]
  const taskRows = (tasksRes.data ?? []) as TaskTrendRow[]

  const behaviourCountByAppointment = new Map<string, number>()
  behaviourRows.forEach(row => {
    behaviourCountByAppointment.set(
      row.appointment_id,
      (behaviourCountByAppointment.get(row.appointment_id) ?? 0) + 1
    )
  })

  const timeByAppointment = new Map<string, { onTask: number; offTask: number }>()
  intervalRows.forEach(row => {
    const current = timeByAppointment.get(row.appointment_id) ?? { onTask: 0, offTask: 0 }
    if (row.status === 'on_task') current.onTask += row.duration_seconds ?? 0
    else current.offTask += row.duration_seconds ?? 0
    timeByAppointment.set(row.appointment_id, current)
  })

  const taskByAppointment = new Map<
    string,
    { independent: number; prompted: number; notCompleted: number; totalCompleted: number }
  >()

  taskRows.forEach(row => {
    const current = taskByAppointment.get(row.appointment_id) ?? {
      independent: 0,
      prompted: 0,
      notCompleted: 0,
      totalCompleted: 0,
    }

    if (row.prompt_level === 'not_completed') {
      current.notCompleted += 1
    } else if (row.completed && row.prompt_level === 'independent') {
      current.independent += 1
      current.totalCompleted += 1
    } else if (row.completed) {
      current.prompted += 1
      current.totalCompleted += 1
    }

    taskByAppointment.set(row.appointment_id, current)
  })

  return sessions.map(session => {
    const appointmentId = String(session.id)
    const hh = String(session.hour).padStart(2, '0')
    const mm = String(session.minute ?? 0).padStart(2, '0')
    const appointmentLabel = `${session.session_date} ${hh}:${mm}`

    const eventCount = behaviourCountByAppointment.get(appointmentId) ?? 0
    const time = timeByAppointment.get(appointmentId) ?? { onTask: 0, offTask: 0 }
    const trackedTime = time.onTask + time.offTask
    const onTaskPercentage = trackedTime ? Math.round((time.onTask / trackedTime) * 100) : 0

    const tasks = taskByAppointment.get(appointmentId) ?? {
      independent: 0,
      prompted: 0,
      notCompleted: 0,
      totalCompleted: 0,
    }
    const attempted = tasks.independent + tasks.prompted + tasks.notCompleted
    const independentPercentage = attempted ? Math.round((tasks.independent / attempted) * 100) : 0

    return {
      appointmentId,
      appointmentLabel,
      sessionDate: session.session_date,
      behaviourEventCount: eventCount,
      onTaskPercentage,
      independentPercentage,
      promptedTaskCount: tasks.prompted,
      notCompletedTaskCount: tasks.notCompleted,
    }
  })
}

export function buildSessionSummary(params: {
  sessionDurationSeconds: number
  behaviourEvents: BehaviourEvent[]
  intervals: OnOffTaskInterval[]
  taskItems: TaskTrackingItem[]
}): BehaviourSessionSummary {
  const { sessionDurationSeconds, behaviourEvents, intervals, taskItems } = params

  const behaviourFrequencyCount = behaviourEvents.length

  const sortedEvents = [...behaviourEvents].sort(
    (a, b) => +new Date(a.timestamp) - +new Date(b.timestamp)
  )

  const interResponseSeconds: number[] = []
  for (let index = 1; index < sortedEvents.length; index += 1) {
    const prev = +new Date(sortedEvents[index - 1].timestamp)
    const curr = +new Date(sortedEvents[index].timestamp)
    interResponseSeconds.push(Math.max(0, Math.round((curr - prev) / 1000)))
  }

  const averageInterResponseSeconds = interResponseSeconds.length
    ? Math.round(interResponseSeconds.reduce((sum, item) => sum + item, 0) / interResponseSeconds.length)
    : 0

  const onTaskDuration = intervals
    .filter(interval => interval.status === 'on_task')
    .reduce((sum, interval) => sum + interval.durationSeconds, 0)

  const offTaskDuration = intervals
    .filter(interval => interval.status === 'off_task')
    .reduce((sum, interval) => sum + interval.durationSeconds, 0)

  const totalTrackedTime = onTaskDuration + offTaskDuration

  const onTaskPercentage = totalTrackedTime > 0 ? Math.round((onTaskDuration / totalTrackedTime) * 100) : 0
  const offTaskPercentage = totalTrackedTime > 0 ? Math.round((offTaskDuration / totalTrackedTime) * 100) : 0

  const independentCount = taskItems.filter(item => item.promptLevel === 'independent' && item.completed).length
  const promptedCount = taskItems.filter(
    item => item.completed && item.promptLevel !== 'independent' && item.promptLevel !== 'not_completed'
  ).length

  const independentTaskCompletionPercentage =
    taskItems.length > 0 ? Math.round((independentCount / taskItems.length) * 100) : 0

  return {
    sessionDurationSeconds,
    behaviourFrequencyCount,
    averageInterResponseSeconds,
    onTaskPercentage,
    offTaskPercentage,
    independentTaskCompletionPercentage,
    promptedTaskCount: promptedCount,
  }
}

export function taskPromptLevelLabel(level: TaskPromptLevel): string {
  switch (level) {
    case 'independent':
      return 'Independent'
    case 'verbal_prompt':
      return 'Verbal prompt'
    case 'gestural_prompt':
      return 'Gestural prompt'
    case 'model_prompt':
      return 'Model prompt'
    case 'physical_prompt':
      return 'Physical prompt'
    case 'not_completed':
    default:
      return 'Not completed'
  }
}

function mapGoalRow(row: ClinicianGoalRow): ClinicianGoal {
  return {
    id: row.id,
    clientId: row.client_id,
    clinicianId: row.clinician_id,
    title: row.title,
    description: row.description ?? undefined,
    targetDate: row.target_date ?? undefined,
    status: row.status,
    priority: row.priority,
    progressPercent: row.progress_percent,
    aiSuggested: row.ai_suggested,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapGoalProgressRow(row: GoalProgressEntryRow): GoalProgressEntry {
  return {
    id: row.id,
    goalId: row.goal_id,
    note: row.note,
    progressDelta: row.progress_delta,
    progressPercent: row.progress_percent,
    createdAt: row.created_at,
  }
}

export async function fetchClientGoals(clientId?: string): Promise<ClinicianGoal[]> {
  let query = supabase
    .from('clinician_goals')
    .select('*')
    .order('updated_at', { ascending: false })

  if (clientId) {
    query = query.eq('client_id', clientId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return ((data ?? []) as ClinicianGoalRow[]).map(mapGoalRow)
}

export async function saveClientGoal(input: {
  id?: string
  clientId: string
  clinicianId: string
  title: string
  description?: string
  targetDate?: string
  status: GoalStatus
  priority: 'low' | 'medium' | 'high'
  progressPercent: number
  aiSuggested?: boolean
}): Promise<ClinicianGoal> {
  const id = input.id ?? `goal-${Date.now()}-${Math.floor(Math.random() * 10000)}`
  const progressPercent = Math.max(0, Math.min(100, Math.round(input.progressPercent)))

  const { data, error } = await supabase
    .from('clinician_goals')
    .upsert({
      id,
      client_id: input.clientId,
      clinician_id: input.clinicianId,
      title: input.title,
      description: input.description ?? null,
      target_date: input.targetDate ?? null,
      status: input.status,
      priority: input.priority,
      progress_percent: progressPercent,
      ai_suggested: Boolean(input.aiSuggested),
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return mapGoalRow(data as ClinicianGoalRow)
}

export async function deleteClientGoal(goalId: string): Promise<void> {
  const { error } = await supabase.from('clinician_goals').delete().eq('id', goalId)
  if (error) throw new Error(error.message)
}

export async function fetchGoalProgressEntries(goalId: string): Promise<GoalProgressEntry[]> {
  const { data, error } = await supabase
    .from('goal_progress_entries')
    .select('*')
    .eq('goal_id', goalId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  return ((data ?? []) as GoalProgressEntryRow[]).map(mapGoalProgressRow)
}

export async function addGoalProgressEntry(params: {
  goalId: string
  note: string
  progressDelta: number
}): Promise<ClinicianGoal> {
  const { data: goalData, error: goalError } = await supabase
    .from('clinician_goals')
    .select('*')
    .eq('id', params.goalId)
    .single()

  if (goalError) throw new Error(goalError.message)

  const existing = mapGoalRow(goalData as ClinicianGoalRow)
  const nextProgress = Math.max(0, Math.min(100, Math.round(existing.progressPercent + params.progressDelta)))

  let nextStatus: GoalStatus = existing.status
  if (nextProgress >= 100) nextStatus = 'completed'
  else if (nextProgress > 0 && existing.status === 'not_started') nextStatus = 'in_progress'

  const updatedGoal = await saveClientGoal({
    id: existing.id,
    clientId: existing.clientId,
    clinicianId: existing.clinicianId,
    title: existing.title,
    description: existing.description,
    targetDate: existing.targetDate,
    status: nextStatus,
    priority: existing.priority,
    progressPercent: nextProgress,
    aiSuggested: existing.aiSuggested,
  })

  const { error: progressError } = await supabase.from('goal_progress_entries').insert({
    id: `goal-progress-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    goal_id: params.goalId,
    note: params.note,
    progress_delta: Math.round(params.progressDelta),
    progress_percent: nextProgress,
  })

  if (progressError) throw new Error(progressError.message)

  return updatedGoal
}
