import { useEffect, useMemo, useState } from 'react'
import {
  Award, BookOpen, BrainCircuit, CalendarDays, Check, ChevronRight, Clock3,
  Flame, LayoutDashboard, Medal, Plus, RefreshCcw, Settings, Sparkles,
  Target, Upload, X,
} from 'lucide-react'
import type { AppData, DeepSeekSettings, LearningPlan, LearningTask } from './types'
import { calculateStreak, formatShortDate, planCapacity, reschedulePending, scheduleDrafts, splitLocally, todayKey } from './planner'

const EMPTY_DATA: AppData = { plans: [], tasks: [], achievements: [], streak: 0 }

const navItems = [
  { id: 'today', label: '今日进度', icon: LayoutDashboard },
  { id: 'plans', label: '学习计划', icon: BookOpen },
  { id: 'achievements', label: '成就陈列', icon: Award },
] as const

type PageId = typeof navItems[number]['id']

function loadBrowserData(): AppData {
  try { return JSON.parse(localStorage.getItem('achievements-data') || '') } catch { return EMPTY_DATA }
}

export default function App() {
  const [data, setData] = useState<AppData>(EMPTY_DATA)
  const [ready, setReady] = useState(false)
  const [page, setPage] = useState<PageId>('today')
  const [showCreate, setShowCreate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [confirmTask, setConfirmTask] = useState<LearningTask | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    const load = async () => {
      const stored = window.achievements ? await window.achievements.loadData() : loadBrowserData()
      setData(stored || EMPTY_DATA)
      setReady(true)
    }
    void load()
  }, [])

  useEffect(() => {
    if (!ready) return
    if (window.achievements) void window.achievements.saveData(data)
    else localStorage.setItem('achievements-data', JSON.stringify(data))
  }, [data, ready])

  const today = todayKey()
  const todayTasks = data.tasks.filter((task) => task.date === today)
  const completedToday = todayTasks.filter((task) => task.status === 'completed')
  const todayMinutes = todayTasks.reduce((sum, task) => sum + task.estimatedMinutes, 0)
  const doneMinutes = completedToday.reduce((sum, task) => sum + task.estimatedMinutes, 0)
  const completionRate = todayTasks.length ? Math.round((completedToday.length / todayTasks.length) * 100) : 0

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }

  const completeTask = () => {
    if (!confirmTask) return
    const completedAt = new Date().toISOString()
    const plan = data.plans.find((item) => item.id === confirmTask.planId)
    const achievement = {
      id: crypto.randomUUID(), taskId: confirmTask.id, title: confirmTask.title,
      subtitle: `${plan?.title || '学习计划'} · ${confirmTask.estimatedMinutes} 分钟`, unlockedAt: completedAt,
    }
    setData((current) => {
      const achievements = [achievement, ...current.achievements]
      return {
        ...current,
        tasks: current.tasks.map((task) => task.id === confirmTask.id ? { ...task, status: 'completed', completedAt } : task),
        achievements,
        streak: calculateStreak(achievements),
        lastActiveDate: today,
      }
    })
    if (window.achievements) void window.achievements.showAchievement({ title: achievement.title, subtitle: achievement.subtitle })
    else notify(`成就解锁：${achievement.title}`)
    setConfirmTask(null)
  }

  const adaptSchedule = () => {
    const tasks = reschedulePending(data.tasks, data.plans)
    const overdue = data.plans.some((plan) => tasks.some((task) => task.planId === plan.id && task.status === 'pending' && task.date > plan.deadline))
    setData((current) => ({ ...current, tasks }))
    notify(overdue ? '已重排；当前时间预算不足，部分任务会晚于目标日期' : '已根据今天的进度重新安排未完成任务')
  }

  if (!ready) return <div className="loading-screen"><Sparkles size={24} />正在整理你的学习进度…</div>

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><ChevronRight /></div><div><strong>拾级</strong><span>ACHIEVEMENTS</span></div></div>
        <nav>
          <span className="nav-caption">学习空间</span>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? 'nav-item active' : 'nav-item'} onClick={() => setPage(id)}>
              <Icon size={19} />{label}{id === 'today' && todayTasks.length > 0 && <b>{todayTasks.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="streak-card"><Flame size={22} /><div><strong>{data.streak} 天</strong><span>连续学习</span></div></div>
          <button className="nav-item" onClick={() => setShowSettings(true)}><Settings size={19} />DeepSeek 设置</button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="titlebar-drag"><span>为自己而学，也为每一步喝彩。</span></header>
        <div className="content">
          {page === 'today' && (
            <TodayPage
              tasks={todayTasks} plans={data.plans} completionRate={completionRate}
              doneMinutes={doneMinutes} todayMinutes={todayMinutes} streak={data.streak}
              onComplete={setConfirmTask} onCreate={() => setShowCreate(true)} onAdapt={adaptSchedule}
            />
          )}
          {page === 'plans' && <PlansPage data={data} onCreate={() => setShowCreate(true)} />}
          {page === 'achievements' && <AchievementsPage data={data} />}
        </div>
      </main>

      {showCreate && <CreatePlanModal onClose={() => setShowCreate(false)} onCreated={(plan, tasks) => {
        setData((current) => ({ ...current, plans: [...current.plans, plan], tasks: [...current.tasks, ...tasks] }))
        setShowCreate(false); setPage('plans'); notify(`“${plan.title}”已拆分为 ${tasks.length} 项任务`)
      }} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onSaved={() => notify('DeepSeek 配置已安全保存')} />}
      {confirmTask && <ConfirmModal task={confirmTask} onCancel={() => setConfirmTask(null)} onConfirm={completeTask} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  )
}

function TodayPage({ tasks, plans, completionRate, doneMinutes, todayMinutes, streak, onComplete, onCreate, onAdapt }: {
  tasks: LearningTask[]; plans: LearningPlan[]; completionRate: number; doneMinutes: number; todayMinutes: number; streak: number
  onComplete: (task: LearningTask) => void; onCreate: () => void; onAdapt: () => void
}) {
  const dateLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())
  return <>
    <section className="page-heading"><div><span className="eyebrow">{dateLabel}</span><h1>今天，推进一点点。</h1><p>完成不必完美，每一次确认都算数。</p></div><button className="primary-button" onClick={onCreate}><Plus size={18} />新建计划</button></section>
    <section className="stats-grid">
      <div className="stat-card accent"><div className="stat-icon"><Target /></div><span>今日完成度</span><strong>{completionRate}<small>%</small></strong><div className="progress"><i style={{ width: `${completionRate}%` }} /></div></div>
      <div className="stat-card"><div className="stat-icon"><Clock3 /></div><span>专注时间</span><strong>{doneMinutes}<small> / {todayMinutes || 0} 分钟</small></strong><p>按自己的节奏前进</p></div>
      <div className="stat-card"><div className="stat-icon flame"><Flame /></div><span>连续学习</span><strong>{streak}<small> 天</small></strong><p>{streak ? '势头很好，保持住' : '今天开始你的记录'}</p></div>
    </section>
    <section className="section-block">
      <div className="section-title"><div><span className="eyebrow">TODAY'S QUESTS</span><h2>今日任务</h2></div><button className="ghost-button" onClick={onAdapt}><RefreshCcw size={16} />自适应重排</button></div>
      {tasks.length === 0 ? <EmptyState onCreate={onCreate} /> : <div className="task-list">{tasks.map((task, index) => {
        const plan = plans.find((item) => item.id === task.planId)
        return <article className={task.status === 'completed' ? 'task-row completed' : 'task-row'} key={task.id}>
          <div className="task-index">{String(index + 1).padStart(2, '0')}</div><div className="task-copy"><span>{plan?.title}</span><h3>{task.title}</h3><p>{task.details}</p></div>
          <div className="task-time"><Clock3 size={15} />{task.estimatedMinutes} 分钟</div>
          <button className="complete-button" disabled={task.status === 'completed'} onClick={() => onComplete(task)}>{task.status === 'completed' ? <><Check size={17} />已完成</> : '确认完成'}</button>
        </article>
      })}</div>}
    </section>
  </>
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return <div className="empty-state"><div className="empty-orbit"><Sparkles /></div><h3>今天还没有任务</h3><p>导入任务书或粘贴计划，让系统帮你拆成每天能完成的小目标。</p><button className="secondary-button" onClick={onCreate}><Plus size={17} />创建第一个计划</button></div>
}

function PlansPage({ data, onCreate }: { data: AppData; onCreate: () => void }) {
  return <><section className="page-heading compact"><div><span className="eyebrow">LEARNING MAP</span><h1>学习计划</h1><p>把遥远的目标，拆成今天可以迈出的一步。</p></div><button className="primary-button" onClick={onCreate}><Plus size={18} />导入新计划</button></section>
    {data.plans.length === 0 ? <EmptyState onCreate={onCreate} /> : <div className="plan-grid">{data.plans.map((plan) => {
      const tasks = data.tasks.filter((task) => task.planId === plan.id)
      const done = tasks.filter((task) => task.status === 'completed').length
      const rate = tasks.length ? Math.round(done / tasks.length * 100) : 0
      return <article className="plan-card" key={plan.id}><div className="plan-card-top"><div className="plan-symbol"><BookOpen /></div><span>{rate}%</span></div><h3>{plan.title}</h3><p>{formatShortDate(plan.startDate)} — {formatShortDate(plan.deadline)}</p><div className="progress"><i style={{ width: `${rate}%` }} /></div><div className="plan-meta"><span>{done} / {tasks.length} 项完成</span><span>每天 {plan.dailyMinutes} 分钟</span></div></article>
    })}</div>}
  </>
}

function AchievementsPage({ data }: { data: AppData }) {
  return <><section className="page-heading compact"><div><span className="eyebrow">YOUR TROPHY ROOM</span><h1>成就陈列</h1><p>这里收藏的不是奖杯，是你没有放弃的证据。</p></div><div className="achievement-total"><Medal /><strong>{data.achievements.length}</strong><span>已解锁</span></div></section>
    {data.achievements.length === 0 ? <div className="empty-state"><div className="empty-orbit"><Award /></div><h3>第一枚成就在等你</h3><p>完成并亲自确认一项任务，它就会出现在这里。</p></div> : <div className="achievement-grid">{data.achievements.map((item) => <article className="achievement-card" key={item.id}><div className="medal-ring"><Award /></div><span>成就解锁</span><h3>{item.title}</h3><p>{item.subtitle}</p><time>{new Date(item.unlockedAt).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></article>)}</div>}
  </>
}

function CreatePlanModal({ onClose, onCreated }: { onClose: () => void; onCreated: (plan: LearningPlan, tasks: LearningTask[]) => void }) {
  const today = todayKey()
  const later = new Date(); later.setDate(later.getDate() + 30)
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [deadline, setDeadline] = useState(todayKeyFromDate(later))
  const [dailyMinutes, setDailyMinutes] = useState(90)
  const [sessionMinutes, setSessionMinutes] = useState(45)
  const [useAi, setUseAi] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const importFile = async (file?: File) => {
    if (!file) return
    if (!/\.(txt|md)$/i.test(file.name)) { setError('首版支持导入 .txt 和 .md 文件，也可以直接粘贴文本。'); return }
    setSource(await file.text())
    if (!title) setTitle(file.name.replace(/\.(txt|md)$/i, ''))
  }

  const create = async () => {
    if (!title.trim() || !source.trim()) { setError('请填写计划名称和任务内容'); return }
    if (deadline < startDate) { setError('截止日期不能早于开始日期'); return }
    setBusy(true); setError('')
    try {
      const drafts = useAi && window.achievements
        ? await window.achievements.splitWithDeepSeek({ title, source, dailyMinutes, sessionMinutes })
        : splitLocally(source, sessionMinutes)
      if (!drafts.length) throw new Error('没有识别到可拆分的任务，请补充具体内容')
      const plan: LearningPlan = { id: crypto.randomUUID(), title: title.trim(), source, startDate, deadline, dailyMinutes, sessionMinutes, restDays: [0], createdAt: new Date().toISOString() }
      const requiredMinutes = drafts.reduce((sum, task) => sum + task.estimatedMinutes, 0)
      if (requiredMinutes > planCapacity(plan)) throw new Error(`当前日期范围最多可安排 ${planCapacity(plan)} 分钟，但任务约需 ${requiredMinutes} 分钟。请延后目标日期或增加每天可用时间。`)
      onCreated(plan, scheduleDrafts(drafts, plan))
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建计划失败') }
    finally { setBusy(false) }
  }

  return <div className="modal-backdrop"><div className="drawer"><div className="modal-head"><div><span className="eyebrow">NEW JOURNEY</span><h2>导入学习计划</h2></div><button className="icon-button" onClick={onClose}><X /></button></div>
    <div className="form-body"><label>计划名称<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：高等数学第一章" /></label>
      <label>任务书 / 计划内容<textarea value={source} onChange={(event) => setSource(event.target.value)} placeholder={'每行写一个阶段，或直接粘贴完整计划书\n例如：\n观看极限课程（60分钟）\n完成课后习题 1-10'} /></label>
      <label className="upload-box"><Upload /><span>导入 TXT / Markdown</span><small>也可以直接粘贴到上方</small><input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={(event) => void importFile(event.target.files?.[0])} /></label>
      <div className="form-grid"><label>开始日期<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>目标日期<input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label><label>每天可用（分钟）<input type="number" min="15" max="720" value={dailyMinutes} onChange={(event) => setDailyMinutes(Number(event.target.value))} /></label><label>单次专注（分钟）<input type="number" min="15" max="120" value={sessionMinutes} onChange={(event) => setSessionMinutes(Number(event.target.value))} /></label></div>
      <button className={useAi ? 'ai-toggle selected' : 'ai-toggle'} onClick={() => setUseAi(!useAi)}><BrainCircuit /><div><strong>使用 DeepSeek 智能拆分</strong><span>理解任务依赖，优化粒度与描述；需先配置 API Key</span></div><i>{useAi ? '已开启' : '本地模式'}</i></button>
      {error && <div className="form-error">{error}</div>}
    </div><div className="modal-actions"><button className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" disabled={busy} onClick={() => void create()}>{busy ? '正在拆分…' : <><Sparkles size={17} />生成每日任务</>}</button></div>
  </div></div>
}

function SettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [settings, setSettings] = useState<DeepSeekSettings>({ endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', hasApiKey: false })
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (window.achievements) void window.achievements.loadSettings().then(setSettings) }, [])
  const save = async () => {
    if (!window.achievements) { setError('请在 Electron 桌面应用中配置 DeepSeek'); return }
    try { const result = await window.achievements.saveSettings({ model: settings.model, apiKey: apiKey || undefined }); setSettings({ ...settings, hasApiKey: result.hasApiKey }); onSaved(); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败') }
  }
  return <div className="modal-backdrop"><div className="dialog settings-dialog"><div className="modal-head"><div><span className="eyebrow">DEEPSEEK AI</span><h2>智能拆分设置</h2></div><button className="icon-button" onClick={onClose}><X /></button></div><div className="form-body">
    <div className="provider-card"><BrainCircuit /><div><strong>DeepSeek API</strong><span>{settings.hasApiKey ? 'API Key 已通过系统安全存储保存' : '尚未配置 API Key'}</span></div><b className={settings.hasApiKey ? 'status-ok' : ''}>{settings.hasApiKey ? '已连接' : '待配置'}</b></div>
    <label>接口地址<input value={settings.endpoint} disabled /></label><label>模型名称<input value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })} placeholder="deepseek-chat 或你的 V4 模型标识" /><small>默认使用 deepseek-chat；若 V4 API 提供了专属模型名，请填写服务商给出的标识。</small></label>
    <label>API Key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings.hasApiKey ? '留空则保留现有 Key' : 'sk-...'} /></label>{error && <div className="form-error">{error}</div>}
  </div><div className="modal-actions"><button className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" onClick={() => void save()}>安全保存</button></div></div></div>
}

function ConfirmModal({ task, onCancel, onConfirm }: { task: LearningTask; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop center"><div className="dialog confirm-dialog"><div className="confirm-emblem"><Award /></div><span className="eyebrow">READY TO UNLOCK?</span><h2>确认已经完成</h2><p>“{task.title}”</p><small>由你亲自确认。确认后将记录完成时间，并解锁一枚成就。</small><div className="modal-actions"><button className="ghost-button" onClick={onCancel}>再检查一下</button><button className="primary-button" onClick={onConfirm}><Check size={18} />确认并解锁</button></div></div></div>
}

function todayKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
