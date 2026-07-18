export type TaskStatus = 'pending' | 'completed'

export interface LearningTask {
  id: string
  planId: string
  title: string
  details: string
  date: string
  status: TaskStatus
  completedAt?: string
}

export interface LearningPlan {
  id: string
  title: string
  source: string
  startDate: string
  deadline: string
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
}

export interface DeepSeekSettings {
  endpoint: string
  model: string
  hasApiKey: boolean
  apiKeyHint: string
}

export interface DraftTask {
  title: string
  details: string
}

declare global {
  interface Window {
    achievements?: {
      loadData: () => Promise<AppData | null>
      saveData: (data: AppData) => Promise<void>
      showAchievement: (payload: { title: string; subtitle: string; kind?: string }) => Promise<void>
      loadSettings: () => Promise<DeepSeekSettings>
      saveSettings: (settings: { model: string; apiKey?: string }) => Promise<{ ok: boolean; hasApiKey: boolean; apiKeyHint: string }>
      splitWithDeepSeek: (input: { title: string; source: string }) => Promise<DraftTask[]>
    }
  }
}
