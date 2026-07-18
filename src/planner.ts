import type { DraftTask, LearningPlan, LearningTask } from './types'

export const todayKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export const parseDate = (value: string) => new Date(`${value}T12:00:00`)

const dateKey = (date: Date) =>
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

export function splitLocally(source: string): DraftTask[] {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const listItems = lines.filter((line) => /^(?:[-*+]\s+(?:\[[ xX]\]\s*)?|\d+[.)、]\s*)/.test(line))
  const candidates = listItems.length
    ? listItems
    : lines.filter((line) => !/^#{1,6}\s+/.test(line) && !/^[-*_]{3,}$/.test(line))

  return candidates.map((line) => {
    const title = line
      .replace(/^(?:[-*+]\s+(?:\[[ xX]\]\s*)?|\d+[.)、]\s*)/, '')
      .replace(/[*_`]/g, '')
      .trim()
    return { title: title.slice(0, 60), details: title }
  }).filter((task) => task.title.length > 1)
}

function dateRange(start: string, end: string) {
  const dates: string[] = []
  let cursor = parseDate(start)
  const last = parseDate(end)
  while (cursor <= last) {
    dates.push(dateKey(cursor))
    cursor = addDays(cursor, 1)
  }
  return dates.length ? dates : [start]
}

export function scheduleDrafts(drafts: DraftTask[], plan: LearningPlan): LearningTask[] {
  const dates = dateRange(plan.startDate, plan.deadline)
  return drafts.map((draft, index) => ({
    id: crypto.randomUUID(),
    planId: plan.id,
    title: draft.title,
    details: draft.details,
    date: dates[Math.min(Math.floor(index * dates.length / drafts.length), dates.length - 1)],
    status: 'pending',
  }))
}

export function reschedulePending(tasks: LearningTask[], plans: LearningPlan[]) {
  const today = todayKey()
  const nextTasks = tasks.map((task) => ({ ...task }))

  plans.forEach((plan) => {
    const pending = nextTasks
      .filter((task) => task.planId === plan.id && task.status === 'pending')
      .sort((first, second) => first.date.localeCompare(second.date))
    const start = today > plan.startDate ? today : plan.startDate
    const dates = dateRange(start, plan.deadline < start ? start : plan.deadline)

    pending.forEach((task, index) => {
      task.date = dates[Math.min(Math.floor(index * dates.length / pending.length), dates.length - 1)]
    })
  })

  return nextTasks
}
