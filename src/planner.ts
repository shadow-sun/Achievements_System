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

const validDateKey = (year: number, month: number, day: number) => {
  const date = new Date(year, month - 1, day, 12)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined
  return dateKey(date)
}

const isDateKey = (value?: string): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = parseDate(value)
  return !Number.isNaN(date.getTime()) && dateKey(date) === value
}

function extractDates(value: string, referenceDate: string) {
  const dates: string[] = []
  const fullPattern = /(?:^|\D)(\d{4})\s*(?:[-/.]|年)\s*(\d{1,2})\s*(?:[-/.]|月)\s*(\d{1,2})\s*日?/g
  for (const match of value.matchAll(fullPattern)) {
    const date = validDateKey(Number(match[1]), Number(match[2]), Number(match[3]))
    if (date) dates.push(date)
  }
  const shortPattern = /(?:^|\D)(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g
  for (const match of value.matchAll(shortPattern)) {
    const date = validDateKey(parseDate(referenceDate).getFullYear(), Number(match[1]), Number(match[2]))
    if (date) dates.push(date)
  }
  return [...new Set(dates)]
}

const extractDate = (value: string, referenceDate: string) => extractDates(value, referenceDate)[0]

function sourceDates(source: string, referenceDate: string) {
  return source.split(/\r?\n/).flatMap((line) => extractDates(line, referenceDate))
}

function labeledDate(source: string, labels: string, referenceDate: string) {
  const lines = source.split(/\r?\n/)
  const label = new RegExp(`(?:${labels})(?:日期|时间)?\\s*[:：]?`, 'i')
  for (const line of lines) {
    const match = label.exec(line)
    if (!match) continue
    const date = extractDate(line.slice(match.index + match[0].length), referenceDate)
    if (date) return date
  }
  return undefined
}

export function formatShortDate(value: string) {
  const date = parseDate(value)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function splitLocally(source: string): DraftTask[] {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const hasListItems = lines.some((line) => /^(?:[-*+]\s+(?:\[[ xX]\]\s*)?|\d+[.)、]\s*)/.test(line))
  const referenceDate = todayKey()
  let currentDate: string | undefined
  const candidates: Array<{ line: string; date?: string }> = []

  lines.forEach((line) => {
    const isListItem = /^(?:[-*+]\s+(?:\[[ xX]\]\s*)?|\d+[.)、]\s*)/.test(line)
    const lineDate = extractDate(line, referenceDate)
    const isDateHeading = /^#{1,6}\s+/.test(line) || !/(?:开始|起始|启动|截止|结束|目标)(?:日期|时间)?/.test(line)
    if (!isListItem && lineDate && isDateHeading) currentDate = lineDate
    if (hasListItems ? isListItem : !/^#{1,6}\s+/.test(line) && !/^[-*_]{3,}$/.test(line)) {
      candidates.push({ line, date: lineDate || currentDate })
    }
  })

  return candidates.map(({ line, date }) => {
    const title = line
      .replace(/^(?:[-*+]\s+(?:\[[ xX]\]\s*)?|\d+[.)、]\s*)/, '')
      .replace(/[*_`]/g, '')
      .trim()
    return { title: title.slice(0, 60), details: title, date }
  }).filter((task) => task.title.length > 1)
}

export function derivePlanSchedule(source: string, drafts: DraftTask[], importDate = todayKey()) {
  const explicitStart = labeledDate(source, '开始|起始|启动', importDate)
  const explicitDeadline = labeledDate(source, '截止|结束|目标', importDate)
  const datedTasks = drafts.map((task) => task.date).filter(isDateKey)
  const allDates = [...sourceDates(source, importDate), ...datedTasks].sort()
  const startDate = explicitStart || importDate
  const latestDate = allDates.at(-1)
  const deadline = explicitDeadline || (latestDate && latestDate >= startDate ? latestDate : startDate)
  return { startDate, deadline: deadline < startDate ? startDate : deadline }
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
  const undatedCount = drafts.filter((draft) => !isDateKey(draft.date)).length
  let undatedIndex = 0
  return drafts.map((draft) => {
    const fallbackIndex = undatedCount > 1
      ? Math.round(undatedIndex * (dates.length - 1) / (undatedCount - 1))
      : 0
    const scheduledDate = isDateKey(draft.date) ? draft.date : dates[fallbackIndex]
    if (!isDateKey(draft.date)) undatedIndex += 1
    return {
      id: crypto.randomUUID(),
      planId: plan.id,
      title: draft.title,
      details: draft.details,
      date: scheduledDate,
      status: 'pending',
    }
  })
}

export function reschedulePending(tasks: LearningTask[], plans: LearningPlan[], advanceNext = false) {
  const today = todayKey()
  const planIds = new Set(plans.map((plan) => plan.id))
  const updated = tasks.map((task) => task.status === 'pending' && task.date < today && planIds.has(task.planId)
    ? { ...task, date: today }
    : { ...task })

  const hasPendingToday = updated.some((task) => task.status === 'pending' && task.date === today && planIds.has(task.planId))
  if (!advanceNext || hasPendingToday) return updated

  const nextDate = updated
    .filter((task) => task.status === 'pending' && task.date > today && planIds.has(task.planId))
    .map((task) => task.date)
    .sort()[0]
  if (!nextDate) return updated

  return updated.map((task) => task.status === 'pending' && task.date === nextDate && planIds.has(task.planId)
    ? { ...task, date: today }
    : task)
}
