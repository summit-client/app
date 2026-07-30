import { mockBehaviourDefinitions } from './mockData'
import { defaultDeskSessionTasks } from './mockData'
import type { BehaviourDefinition, ClientTrackingProfile } from './types'

const STORAGE_KEY = 'clinician.behaviour-config.v1'

type StoredClientConfigs = Record<string, ClientTrackingProfile | BehaviourDefinition[]>

const defaultTaskTemplates = defaultDeskSessionTasks.map(task => task.taskName)

const defaultProfile: ClientTrackingProfile = {
  behaviours: [...mockBehaviourDefinitions],
  taskTemplates: [...defaultTaskTemplates],
  timerLabels: {
    onTask: 'On Task',
    offTask: 'Off Task',
  },
}

function readConfigs(): StoredClientConfigs {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as StoredClientConfigs
  } catch {
    return {}
  }
}

function writeConfigs(configs: StoredClientConfigs): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(configs))
}

function normalizeBehaviours(behaviours: BehaviourDefinition[]): BehaviourDefinition[] {
  const seen = new Set<string>()
  const cleaned: BehaviourDefinition[] = []

  behaviours.forEach((behaviour, index) => {
    const name = behaviour.name.trim()
    if (!name) return
    const id = behaviour.id?.trim() || `beh-custom-${index + 1}`
    if (seen.has(id)) return
    seen.add(id)
    cleaned.push({
      id,
      name,
      description: behaviour.description?.trim() || undefined,
    })
  })

  return cleaned
}

function normalizeTaskTemplates(taskTemplates: string[] | undefined): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  ;(taskTemplates ?? []).forEach(task => {
    const value = task.trim()
    if (!value) return
    const key = value.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    normalized.push(value)
  })

  return normalized.length ? normalized : [...defaultTaskTemplates]
}

function normalizeTimerLabels(profile: ClientTrackingProfile | undefined): ClientTrackingProfile['timerLabels'] {
  const onTask = profile?.timerLabels?.onTask?.trim() || defaultProfile.timerLabels.onTask
  const offTask = profile?.timerLabels?.offTask?.trim() || defaultProfile.timerLabels.offTask
  return { onTask, offTask }
}

function normalizeProfile(raw: ClientTrackingProfile | BehaviourDefinition[] | undefined): ClientTrackingProfile {
  if (!raw) return { ...defaultProfile }

  if (Array.isArray(raw)) {
    return {
      behaviours: normalizeBehaviours(raw),
      taskTemplates: [...defaultTaskTemplates],
      timerLabels: { ...defaultProfile.timerLabels },
    }
  }

  return {
    behaviours: normalizeBehaviours(raw.behaviours),
    taskTemplates: normalizeTaskTemplates(raw.taskTemplates),
    timerLabels: normalizeTimerLabels(raw),
  }
}

export async function getClientTrackingProfile(clientId: string): Promise<ClientTrackingProfile> {
  const configs = readConfigs()
  const custom = normalizeProfile(configs[clientId])
  return custom
}

export async function saveClientTrackingProfile(clientId: string, profile: ClientTrackingProfile): Promise<void> {
  const configs = readConfigs()
  configs[clientId] = normalizeProfile(profile)
  writeConfigs(configs)

  // Supabase persistence integration point:
  // await supabase.from('client_behaviour_profiles').upsert({
  //   client_id: clientId,
  //   behaviours: configs[clientId].behaviours,
  //   task_templates: configs[clientId].taskTemplates,
  //   timer_labels: configs[clientId].timerLabels,
  // })
}

export async function getClientBehaviourDefinitions(clientId: string): Promise<BehaviourDefinition[]> {
  const profile = await getClientTrackingProfile(clientId)
  return profile.behaviours
}
