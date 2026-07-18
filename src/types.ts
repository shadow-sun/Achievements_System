export type TaskStatus = 'pending' | 'completed'

export interface LearningTask {
  id: string
  planId: string
  title: string
  details: string
  date: string
  estimatedMinutes: number
  status: TaskStatus
  completedAt?: string
}

export interface LearningPlan {
  id: string
  title: string
  source: string
  startDate: string
  deadline: string
  dailyMinutes: number
  sessionMinutes: number
  restDays: number[]
  createdAt: string
}

export interface Achievement {
  id: string
  taskId: string
  title: string
  subtitle: string
  unlockedAt: string
}

export interface AppData {
  plans: LearningPlan[]
  tasks: LearningTask[]
  achievements: Achievement[]
  streak: number
  lastActiveDate?: string
}

export interface DeepSeekSettings {
  endpoint: string
  model: string
  hasApiKey: boolean
}

export interface DraftTask {
  title: string
  details: string
  estimatedMinutes: number
}

declare global {
  interface Window {
    achievements?: {
      loadData: () => Promise<AppData | null>
      saveData: (data: AppData) => Promise<void>
      showAchievement: (payload: { title: string; subtitle: string; kind?: string }) => Promise<void>
      loadSettings: () => Promise<DeepSeekSettings>
      saveSettings: (settings: { model: string; apiKey?: string }) => Promise<{ ok: boolean; hasApiKey: boolean }>
      splitWithDeepSeek: (input: { title: string; source: string; dailyMinutes: number; sessionMinutes: number }) => Promise<DraftTask[]>
    }
  }
}
