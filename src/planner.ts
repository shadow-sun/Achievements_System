import type { DraftTask, LearningPlan, LearningTask } from './types'

export const todayKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export const parseDate = (value: string) => new Date(`${value}T12:00:00`)

export const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const addDays = (date: Date, count: number) => {
  const result = new Date(date)
  result.setDate(result.getDate() + count)
  return result
}

export function formatShortDate(value: string) {
  const date = parseDate(value)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function estimateMinutes(text: string, fallback: number) {
  const hour = text.match(/(\d+(?:\.\d+)?)\s*(?:小时|hours?|h)\b/i)
  if (hour) return Math.max(15, Math.min(240, Math.round(Number(hour[1]) * 60)))
  const minute = text.match(/(\d+)\s*(?:分钟|minutes?|mins?|min)\b/i)
  if (minute) return Math.max(15, Math.min(240, Number(minute[1])))
  return fallback
}

export function splitLocally(source: string, sessionMinutes: number): DraftTask[] {
  const cleaned = source
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•\d.、)）\s]+/, '').trim())
    .filter((line) => line.length > 1)

  const segments = cleaned.length > 1
    ? cleaned
    : source.split(/[；;。]\s*/).map((item) => item.trim()).filter((item) => item.length > 1)

  return segments.flatMap((segment) => {
    const minutes = estimateMinutes(segment, sessionMinutes)
    const cleanTitle = segment.replace(/[（(]?\d+(?:\.\d+)?\s*(?:小时|分钟|hours?|minutes?|h|min)[)）]?/gi, '').trim()
    if (minutes <= 120) {
      return [{ title: cleanTitle.slice(0, 60), details: segment, estimatedMinutes: minutes }]
    }
    const parts = Math.ceil(minutes / sessionMinutes)
    return Array.from({ length: parts }, (_, index) => ({
      title: `${cleanTitle.slice(0, 45)} · ${index + 1}/${parts}`,
      details: `完成“${cleanTitle}”的第 ${index + 1} 个学习阶段`,
      estimatedMinutes: Math.ceil(minutes / parts),
    }))
  })
}

function nextStudyDate(current: Date, restDays: number[]) {
  let result = new Date(current)
  while (restDays.includes(result.getDay())) result = addDays(result, 1)
  return result
}

export function scheduleDrafts(drafts: DraftTask[], plan: LearningPlan): LearningTask[] {
  let cursor = nextStudyDate(parseDate(plan.startDate), plan.restDays)
  let usedMinutes = 0

  return drafts.map((draft) => {
    if (usedMinutes > 0 && usedMinutes + draft.estimatedMinutes > plan.dailyMinutes) {
      cursor = nextStudyDate(addDays(cursor, 1), plan.restDays)
      usedMinutes = 0
    }
    const task: LearningTask = {
      id: crypto.randomUUID(),
      planId: plan.id,
      title: draft.title,
      details: draft.details,
      date: dateKey(cursor),
      estimatedMinutes: draft.estimatedMinutes,
      status: 'pending',
    }
    usedMinutes += draft.estimatedMinutes
    return task
  })
}

export function planCapacity(plan: LearningPlan) {
  let cursor = parseDate(plan.startDate)
  const end = parseDate(plan.deadline)
  let studyDays = 0
  while (cursor <= end) {
    if (!plan.restDays.includes(cursor.getDay())) studyDays += 1
    cursor = addDays(cursor, 1)
  }
  return studyDays * plan.dailyMinutes
}

export function reschedulePending(tasks: LearningTask[], plans: LearningPlan[]) {
  const today = todayKey()
  const nextTasks = [...tasks]

  plans.forEach((plan) => {
    const pending = nextTasks
      .filter((task) => task.planId === plan.id && task.status === 'pending')
      .sort((a, b) => a.date.localeCompare(b.date))
    let cursor = nextStudyDate(parseDate(today > plan.startDate ? today : plan.startDate), plan.restDays)
    let usedMinutes = 0

    pending.forEach((task) => {
      if (usedMinutes > 0 && usedMinutes + task.estimatedMinutes > plan.dailyMinutes) {
        cursor = nextStudyDate(addDays(cursor, 1), plan.restDays)
        usedMinutes = 0
      }
      task.date = dateKey(cursor)
      usedMinutes += task.estimatedMinutes
    })
  })

  return nextTasks
}

export function calculateStreak(achievements: { unlockedAt: string }[]) {
  const activeDays = new Set(achievements.map((item) => item.unlockedAt.slice(0, 10)))
  let streak = 0
  let cursor = parseDate(todayKey())
  if (!activeDays.has(dateKey(cursor))) cursor = addDays(cursor, -1)
  while (activeDays.has(dateKey(cursor))) {
    streak += 1
    cursor = addDays(cursor, -1)
  }
  return streak
}
