'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  buildSessionSummary,
  createInitialTaskItems,
  saveBehaviourEvent,
  saveOnOffTaskInterval,
  saveTaskTrackingItem,
} from '../../lib/behaviour-tracking/service'
import type {
  Appointment,
  BehaviourDefinition,
  ClientTrackingProfile,
  BehaviourEvent,
  OnOffTaskInterval,
  OnOffTaskStatus,
  TaskPromptLevel,
  TaskTrackingItem,
} from '../../lib/behaviour-tracking/types'
import styles from './ClinicianPortal.module.css'
import { BehaviourFrequencyClicker } from './BehaviourFrequencyClicker'
import { OnTaskTimer } from './OnTaskTimer'
import { SessionSummaryCards } from './SessionSummaryCards'
import { TaskPromptTracker } from './TaskPromptTracker'

interface BehaviourTrackingDashboardProps {
  appointment: Appointment
  trackingProfile: ClientTrackingProfile
}

export function BehaviourTrackingDashboard({
  appointment,
  trackingProfile,
}: BehaviourTrackingDashboardProps) {
  const [events, setEvents] = useState<BehaviourEvent[]>([])
  const [intervals, setIntervals] = useState<OnOffTaskInterval[]>([])
  const [taskItems, setTaskItems] = useState<TaskTrackingItem[]>(() =>
    createInitialTaskItems(
      appointment.id,
      appointment.clientId,
      appointment.clinicianId,
      trackingProfile.taskTemplates
    )
  )

  const [isSessionRunning, setIsSessionRunning] = useState(false)
  const [sessionStartMs, setSessionStartMs] = useState<number | null>(null)
  const [sessionElapsedSeconds, setSessionElapsedSeconds] = useState(0)
  const [activeStatus, setActiveStatus] = useState<OnOffTaskStatus | null>(null)
  const [activeStatusStartMs, setActiveStatusStartMs] = useState<number | null>(null)
  const [secondsSinceLastEvent, setSecondsSinceLastEvent] = useState(0)
  const [isBehaviourTimerStopped, setIsBehaviourTimerStopped] = useState(false)

  useEffect(() => {
    setTaskItems(
      createInitialTaskItems(
        appointment.id,
        appointment.clientId,
        appointment.clinicianId,
        trackingProfile.taskTemplates
      )
    )
  }, [appointment.id, appointment.clientId, appointment.clinicianId, trackingProfile.taskTemplates])

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined
    if (isSessionRunning) {
      intervalId = setInterval(() => {
        if (sessionStartMs) {
          setSessionElapsedSeconds(Math.max(0, Math.floor((Date.now() - sessionStartMs) / 1000)))
        }
      }, 1000)
    }

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [isSessionRunning, sessionStartMs])

  useEffect(() => {
    const lastEvent = events.at(-1)
    if (!lastEvent) {
      setSecondsSinceLastEvent(0)
      return
    }

    if (isBehaviourTimerStopped) {
      return
    }

    const updateElapsed = () => {
      setSecondsSinceLastEvent(Math.max(0, Math.floor((Date.now() - +new Date(lastEvent.timestamp)) / 1000)))
    }

    updateElapsed()
    const intervalId = setInterval(updateElapsed, 1000)

    return () => {
      clearInterval(intervalId)
    }
  }, [events, isBehaviourTimerStopped])

  const finalizeActiveInterval = async (endMs: number) => {
    if (!activeStatus || !activeStatusStartMs) return

    const durationSeconds = Math.max(0, Math.round((endMs - activeStatusStartMs) / 1000))
    const interval: OnOffTaskInterval = {
      id: `interval-${endMs}`,
      status: activeStatus,
      startTime: new Date(activeStatusStartMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      durationSeconds,
      appointmentId: appointment.id,
      clientId: appointment.clientId,
    }

    setIntervals(previous => [...previous, interval])
    await saveOnOffTaskInterval(interval)
    setActiveStatus(null)
    setActiveStatusStartMs(null)
  }

  const handleStartSession = () => {
    const now = Date.now()
    setIsSessionRunning(true)
    setSessionStartMs(now - sessionElapsedSeconds * 1000)
  }

  const handlePauseSession = async () => {
    setIsSessionRunning(false)
    await finalizeActiveInterval(Date.now())
  }

  const handleEndSession = async () => {
    setIsSessionRunning(false)
    await finalizeActiveInterval(Date.now())
  }

  const handleMarkStatus = async (status: OnOffTaskStatus) => {
    if (!isSessionRunning) return

    const now = Date.now()
    await finalizeActiveInterval(now)
    setActiveStatus(status)
    setActiveStatusStartMs(now)
  }

  const handleRecordBehaviour = async (behaviour: BehaviourDefinition, notes?: string) => {
    const event: BehaviourEvent = {
      id: `beh-${Date.now()}`,
      behaviourId: behaviour.id,
      behaviourName: behaviour.name,
      timestamp: new Date().toISOString(),
      appointmentId: appointment.id,
      clientId: appointment.clientId,
      clinicianId: appointment.clinicianId,
      notes,
    }

    setEvents(previous => [...previous, event])
    setIsBehaviourTimerStopped(false)
    setSecondsSinceLastEvent(0)
    await saveBehaviourEvent(event)
  }

  const handleStopBehaviourTimer = () => {
    setIsBehaviourTimerStopped(true)
  }

  const handleUpdateTask = async (taskId: string, promptLevel: TaskPromptLevel) => {
    const nowIso = new Date().toISOString()

    setTaskItems(previous =>
      previous.map(task => {
        if (task.id !== taskId) return task
        return {
          ...task,
          promptLevel,
          completed: promptLevel !== 'not_completed',
          timestamp: nowIso,
        }
      })
    )

    const targetTask = taskItems.find(task => task.id === taskId)
    if (!targetTask) return

    await saveTaskTrackingItem({
      ...targetTask,
      promptLevel,
      completed: promptLevel !== 'not_completed',
      timestamp: nowIso,
    })
  }

  const summary = useMemo(
    () =>
      buildSessionSummary({
        sessionDurationSeconds: sessionElapsedSeconds,
        behaviourEvents: events,
        intervals,
        taskItems,
      }),
    [events, intervals, sessionElapsedSeconds, taskItems]
  )

  return (
    <div className={styles.stack}>
      <SessionSummaryCards summary={summary} />
      <BehaviourFrequencyClicker
        behaviours={trackingProfile.behaviours}
        events={events}
        secondsSinceLastEvent={secondsSinceLastEvent}
        isTimerStopped={isBehaviourTimerStopped}
        onRecord={handleRecordBehaviour}
        onStopTimer={handleStopBehaviourTimer}
      />
      <OnTaskTimer
        sessionElapsedSeconds={sessionElapsedSeconds}
        activeStatus={activeStatus}
        intervals={intervals}
        onTaskLabel={trackingProfile.timerLabels.onTask}
        offTaskLabel={trackingProfile.timerLabels.offTask}
        isSessionRunning={isSessionRunning}
        onStartSession={handleStartSession}
        onPauseSession={handlePauseSession}
        onEndSession={handleEndSession}
        onMarkStatus={handleMarkStatus}
      />
      <TaskPromptTracker taskItems={taskItems} onUpdateTask={handleUpdateTask} />
    </div>
  )
}
