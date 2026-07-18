import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Award, BookOpen, BrainCircuit, Check, ChevronRight, FileText, LayoutDashboard,
  Medal, Plus, RefreshCcw, Settings, Sparkles, Target, Trash2, Upload, X,
} from 'lucide-react'
import type { AppData, DeepSeekSettings, LearningPlan, LearningTask } from './types'
import { formatShortDate, reschedulePending, scheduleDrafts, splitLocally, todayKey } from './planner'

const EMPTY_DATA: AppData = { plans: [], tasks: [], achievements: [] }

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
  const [deletePlan, setDeletePlan] = useState<LearningPlan | null>(null)
  const [detailTask, setDetailTask] = useState<LearningTask | null>(null)
  const [detailPlan, setDetailPlan] = useState<LearningPlan | null>(null)
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
      id: crypto.randomUUID(),
      taskId: confirmTask.id,
      title: confirmTask.title,
      subtitle: plan?.title || '学习计划',
      unlockedAt: completedAt,
    }
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === confirmTask.id ? { ...task, status: 'completed', completedAt } : task),
      achievements: [achievement, ...current.achievements],
    }))
    if (window.achievements) void window.achievements.showAchievement({ title: achievement.title, subtitle: achievement.subtitle })
    else notify(`成就解锁：${achievement.title}`)
    setConfirmTask(null)
  }

  const removePlan = () => {
    if (!deletePlan) return
    setData((current) => {
      const taskIds = new Set(current.tasks.filter((task) => task.planId === deletePlan.id).map((task) => task.id))
      return {
        plans: current.plans.filter((plan) => plan.id !== deletePlan.id),
        tasks: current.tasks.filter((task) => task.planId !== deletePlan.id),
        achievements: current.achievements.filter((achievement) => !taskIds.has(achievement.taskId)),
      }
    })
    notify(`已删除“${deletePlan.title}”及其相关记录`)
    setDeletePlan(null)
  }

  const adaptSchedule = () => {
    setData((current) => ({ ...current, tasks: reschedulePending(current.tasks, current.plans) }))
    notify('已按剩余任务数量重新分配每日任务')
  }

  if (!ready) return <div className="loading-screen"><Sparkles size={24} />正在整理你的学习进度…</div>

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><ChevronRight /></div><div><strong>汉广</strong><span>ACHIEVEMENTS</span></div></div>
        <nav>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? 'nav-item active' : 'nav-item'} onClick={() => setPage(id)}>
              <Icon size={19} />{label}{id === 'today' && todayTasks.length > 0 && <b>{todayTasks.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setShowSettings(true)}><Settings size={19} />DeepSeek 设置</button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="titlebar-drag"><span>汉之广矣，不可永思；江之广矣，不可方思</span></header>
        <div className="content">
          {page === 'today' && <TodayPage tasks={todayTasks} plans={data.plans} completionRate={completionRate} onComplete={setConfirmTask} onOpen={setDetailTask} onCreate={() => setShowCreate(true)} onAdapt={adaptSchedule} />}
          {page === 'plans' && <PlansPage data={data} onCreate={() => setShowCreate(true)} onDelete={setDeletePlan} onOpen={setDetailPlan} />}
          {page === 'achievements' && <AchievementsPage data={data} />}
        </div>
      </main>

      {showCreate && <CreatePlanModal onClose={() => setShowCreate(false)} onCreated={(plan, tasks) => {
        setData((current) => ({ ...current, plans: [...current.plans, plan], tasks: [...current.tasks, ...tasks] }))
        setShowCreate(false); setPage('plans'); notify(`“${plan.title}”已拆分为 ${tasks.length} 项任务`)
      }} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onSaved={() => notify('DeepSeek 配置已安全保存')} />}
      {confirmTask && <ConfirmModal task={confirmTask} onCancel={() => setConfirmTask(null)} onConfirm={completeTask} />}
      {deletePlan && <DeletePlanModal plan={deletePlan} onCancel={() => setDeletePlan(null)} onConfirm={removePlan} />}
      {detailTask && <TaskDetailModal task={detailTask} plan={data.plans.find((plan) => plan.id === detailTask.planId)} onClose={() => setDetailTask(null)} onComplete={() => { setDetailTask(null); setConfirmTask(detailTask) }} />}
      {detailPlan && <PlanDetailModal plan={detailPlan} tasks={data.tasks.filter((task) => task.planId === detailPlan.id)} onClose={() => setDetailPlan(null)} onDelete={() => { setDetailPlan(null); setDeletePlan(detailPlan) }} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  )
}

function TodayPage({ tasks, plans, completionRate, onComplete, onOpen, onCreate, onAdapt }: {
  tasks: LearningTask[]; plans: LearningPlan[]; completionRate: number
  onComplete: (task: LearningTask) => void; onOpen: (task: LearningTask) => void; onCreate: () => void; onAdapt: () => void
}) {
  const dateLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())
  const doneCount = tasks.filter((task) => task.status === 'completed').length
  return <>
    <section className="page-heading poetic"><div><span className="eyebrow">{dateLabel}</span><h1>凤箫声动，玉壶光转，一夜鱼龙舞</h1></div><button className="primary-button" onClick={onCreate}><Plus size={18} />新建计划</button></section>
    <section className="stats-grid task-stats">
      <div className="stat-card accent"><div className="stat-icon"><Target /></div><span>今日完成度</span><strong>{completionRate}<small>%</small></strong><div className="progress"><i style={{ width: `${completionRate}%` }} /></div></div>
      <div className="stat-card"><div className="stat-icon"><Check /></div><span>今日任务</span><strong>{doneCount}<small> / {tasks.length} 项</small></strong><p>每完成一项，都由你亲自确认</p></div>
    </section>
    <section className="section-block">
      <div className="section-title"><div><span className="eyebrow">TODAY'S QUESTS</span><h2>今日任务</h2></div><button className="ghost-button" onClick={onAdapt}><RefreshCcw size={16} />自适应重排</button></div>
      {tasks.length === 0 ? <EmptyState onCreate={onCreate} /> : <div className="task-list">{tasks.map((task, index) => {
        const plan = plans.find((item) => item.id === task.planId)
        return <article className={task.status === 'completed' ? 'task-row completed clickable' : 'task-row clickable'} key={task.id} onClick={() => onOpen(task)}>
          <div className="task-index">{String(index + 1).padStart(2, '0')}</div><div className="task-copy"><span>{plan?.title}</span><h3>{task.title}</h3><p>{task.details}</p></div>
          <button className="complete-button" disabled={task.status === 'completed'} onClick={(event) => { event.stopPropagation(); onComplete(task) }}>{task.status === 'completed' ? <><Check size={17} />已完成</> : '确认完成'}</button>
        </article>
      })}</div>}
    </section>
  </>
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return <div className="empty-state"><div className="empty-orbit"><Sparkles /></div><h3>今天还没有任务</h3><p>导入 Markdown 计划书，让系统帮你拆成每天可以确认完成的小目标。</p><button className="secondary-button" onClick={onCreate}><Plus size={17} />导入第一个计划</button></div>
}

function PlansPage({ data, onCreate, onDelete, onOpen }: { data: AppData; onCreate: () => void; onDelete: (plan: LearningPlan) => void; onOpen: (plan: LearningPlan) => void }) {
  return <><section className="page-heading compact"><div><span className="eyebrow">LEARNING MAP</span><h1>学习计划</h1></div><button className="primary-button" onClick={onCreate}><Plus size={18} />导入新计划</button></section>
    {data.plans.length === 0 ? <EmptyState onCreate={onCreate} /> : <div className="plan-grid">{data.plans.map((plan) => {
      const tasks = data.tasks.filter((task) => task.planId === plan.id)
      const done = tasks.filter((task) => task.status === 'completed').length
      const rate = tasks.length ? Math.round(done / tasks.length * 100) : 0
      return <article className="plan-card clickable" key={plan.id} onClick={() => onOpen(plan)}><div className="plan-card-top"><div className="plan-symbol"><BookOpen /></div><div className="plan-card-actions"><span>{rate}%</span><button title="删除计划" onClick={(event) => { event.stopPropagation(); onDelete(plan) }}><Trash2 /></button></div></div><h3>{plan.title}</h3><p>{formatShortDate(plan.startDate)} — {formatShortDate(plan.deadline)}</p><div className="progress"><i style={{ width: `${rate}%` }} /></div><div className="plan-meta"><span>{done} / {tasks.length} 项完成</span></div></article>
    })}</div>}
  </>
}

function AchievementsPage({ data }: { data: AppData }) {
  const groups = useMemo(() => {
    const monthly = new Map<string, typeof data.achievements>()
    data.achievements.forEach((achievement) => {
      const date = new Date(achievement.unlockedAt)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      monthly.set(key, [...(monthly.get(key) || []), achievement])
    })
    return [...monthly.entries()].sort(([first], [second]) => second.localeCompare(first))
  }, [data.achievements])

  return <><section className="page-heading compact"><div><span className="eyebrow">YOUR TROPHY ROOM</span><h1>成就陈列</h1></div><div className="achievement-total"><Medal /><strong>{data.achievements.length}</strong><span>已解锁</span></div></section>
    {groups.length === 0 ? <div className="empty-state"><div className="empty-orbit"><Award /></div><h3>第一枚成就在等你</h3><p>完成并亲自确认一项任务，它就会出现在这里。</p></div> : <div className="achievement-months">{groups.map(([month, achievements]) => {
      const [year, monthNumber] = month.split('-')
      return <section className="achievement-month" key={month}><div className="month-heading"><h2>{year} 年 {Number(monthNumber)} 月</h2><span>{achievements.length} 项解锁</span></div><div className="achievement-grid">{achievements.map((item) => <article className="achievement-card" key={item.id}><div className="medal-ring"><Award /></div><span>成就解锁</span><h3>{item.title}</h3><p>{item.subtitle}</p><time>{new Date(item.unlockedAt).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></article>)}</div></section>
    })}</div>}
  </>
}

function CreatePlanModal({ onClose, onCreated }: { onClose: () => void; onCreated: (plan: LearningPlan, tasks: LearningTask[]) => void }) {
  const today = todayKey()
  const later = new Date(); later.setDate(later.getDate() + 30)
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('')
  const [fileName, setFileName] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [deadline, setDeadline] = useState(dateInputValue(later))
  const [useAi, setUseAi] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const importFile = async (file?: File) => {
    if (!file) return
    if (!/\.md$/i.test(file.name)) { setError('请选择 Markdown（.md）计划书。'); return }
    setSource(await file.text())
    setTitle(file.name.replace(/\.md$/i, ''))
    setFileName(file.name)
    setError('')
  }

  const create = async () => {
    if (!source.trim()) { setError('请先选择 Markdown 计划书'); return }
    if (deadline < startDate) { setError('截止日期不能早于开始日期'); return }
    setBusy(true); setError('')
    try {
      const drafts = useAi && window.achievements
        ? await window.achievements.splitWithDeepSeek({ title, source })
        : splitLocally(source)
      if (!drafts.length) throw new Error('计划书中没有识别到任务，请使用 Markdown 列表编写任务项')
      const plan: LearningPlan = { id: crypto.randomUUID(), title, source, startDate, deadline, createdAt: new Date().toISOString() }
      onCreated(plan, scheduleDrafts(drafts, plan))
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建计划失败') }
    finally { setBusy(false) }
  }

  return <div className="modal-backdrop"><div className="drawer"><div className="modal-head"><div><span className="eyebrow">NEW JOURNEY</span><h2>导入学习计划</h2></div><button className="icon-button" onClick={onClose}><X /></button></div>
    <div className="form-body">
      <label className={fileName ? 'upload-box file-selected' : 'upload-box'}><Upload /><div><span>{fileName || '选择 Markdown 计划书'}</span><small>{fileName ? '点击可重新选择文件' : '仅支持 .md 文件，计划名取自文件名'}</small></div><input type="file" accept=".md,text/markdown" onChange={(event) => void importFile(event.target.files?.[0])} /></label>
      {fileName && <div className="imported-file"><FileText /><div><strong>{title}</strong><span>{source.split(/\r?\n/).length} 行内容已读取</span></div><Check /></div>}
      <div className="form-grid"><label>开始日期<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>目标日期<input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label></div>
      <button className={useAi ? 'ai-toggle selected' : 'ai-toggle'} onClick={() => setUseAi(!useAi)}><BrainCircuit /><div><strong>使用 DeepSeek 智能拆分</strong><span>理解任务依赖，优化任务边界与描述；需先配置 API Key</span></div><i>{useAi ? '已开启' : '本地模式'}</i></button>
      {error && <div className="form-error">{error}</div>}
    </div><div className="modal-actions"><button className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" disabled={busy} onClick={() => void create()}>{busy ? '正在拆分…' : <><Sparkles size={17} />生成每日任务</>}</button></div>
  </div></div>
}

function SettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [settings, setSettings] = useState<DeepSeekSettings>({ endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', hasApiKey: false, apiKeyHint: '' })
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (window.achievements) void window.achievements.loadSettings().then(setSettings) }, [])
  const save = async () => {
    if (!window.achievements) { setError('请在 Electron 桌面应用中配置 DeepSeek'); return }
    try { const result = await window.achievements.saveSettings({ model: settings.model, apiKey: apiKey || undefined }); setSettings({ ...settings, hasApiKey: result.hasApiKey, apiKeyHint: result.apiKeyHint || settings.apiKeyHint }); onSaved(); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败') }
  }
  return <div className="modal-backdrop"><div className="dialog settings-dialog"><div className="modal-head"><div><span className="eyebrow">DEEPSEEK AI</span><h2>智能拆分设置</h2></div><button className="icon-button" onClick={onClose}><X /></button></div><div className="form-body">
    <div className="provider-card"><BrainCircuit /><div><strong>DeepSeek API</strong><span>{settings.hasApiKey ? 'API Key 已通过系统安全存储保存' : '尚未配置 API Key'}</span></div><b className={settings.hasApiKey ? 'status-ok' : ''}>{settings.hasApiKey ? '已连接' : '待配置'}</b></div>
    <label>接口地址<input value={settings.endpoint} disabled /></label><label>模型名称<input value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })} placeholder="deepseek-chat 或你的 V4 模型标识" /><small>默认使用 deepseek-chat；若 V4 API 提供了专属模型名，请填写服务商给出的标识。</small></label>
    {settings.hasApiKey && <div className="current-api"><span>当前 API Key</span><strong>{settings.apiKeyHint || '已安全保存'}</strong></div>}
    <label>更新 API Key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings.hasApiKey ? '留空则保留当前 Key' : 'sk-...'} /></label>{error && <div className="form-error">{error}</div>}
  </div><div className="modal-actions"><button className="ghost-button" onClick={onClose}>取消</button><button className="primary-button" onClick={() => void save()}>安全保存</button></div></div></div>
}

function ConfirmModal({ task, onCancel, onConfirm }: { task: LearningTask; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop center"><div className="dialog confirm-dialog"><div className="confirm-emblem"><Award /></div><span className="eyebrow">READY TO UNLOCK?</span><h2>确认已经完成</h2><p>“{task.title}”</p><small>由你亲自确认。确认后将记录完成时间，并解锁一枚成就。</small><div className="modal-actions"><button className="ghost-button" onClick={onCancel}>再检查一下</button><button className="primary-button" onClick={onConfirm}><Check size={18} />确认并解锁</button></div></div></div>
}

function DeletePlanModal({ plan, onCancel, onConfirm }: { plan: LearningPlan; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop center"><div className="dialog confirm-dialog danger-dialog"><div className="confirm-emblem"><Trash2 /></div><span className="eyebrow">DELETE PLAN</span><h2>删除这项计划？</h2><p>“{plan.title}”</p><small>计划内的任务和由这些任务解锁的成就也会一并删除，此操作无法撤销。</small><div className="modal-actions"><button className="ghost-button" onClick={onCancel}>取消</button><button className="danger-button" onClick={onConfirm}><Trash2 size={17} />确认删除</button></div></div></div>
}

function TaskDetailModal({ task, plan, onClose, onComplete }: { task: LearningTask; plan?: LearningPlan; onClose: () => void; onComplete: () => void }) {
  return <div className="modal-backdrop center"><div className="dialog detail-dialog"><div className="modal-head"><div><span className="eyebrow">TASK DETAILS</span><h2>{task.title}</h2></div><button className="icon-button" onClick={onClose}><X /></button></div>
    <div className="detail-body"><div className="detail-meta"><div><span>所属计划</span><strong>{plan?.title || '未知计划'}</strong></div><div><span>执行日期</span><strong>{formatShortDate(task.date)}</strong></div><div><span>当前状态</span><strong className={task.status === 'completed' ? 'status-completed' : ''}>{task.status === 'completed' ? '已完成' : '待完成'}</strong></div></div>
      <section className="detail-section"><span className="eyebrow">任务说明</span><p>{task.details || '计划书中未提供额外说明。'}</p></section>
      {task.completedAt && <section className="detail-section"><span className="eyebrow">完成时间</span><p>{new Date(task.completedAt).toLocaleString('zh-CN')}</p></section>}
    </div>{task.status === 'pending' && <div className="modal-actions"><button className="primary-button" onClick={onComplete}><Check size={17} />确认完成</button></div>}
  </div></div>
}

function PlanDetailModal({ plan, tasks, onClose, onDelete }: { plan: LearningPlan; tasks: LearningTask[]; onClose: () => void; onDelete: () => void }) {
  const completed = tasks.filter((task) => task.status === 'completed').length
  const rate = tasks.length ? Math.round(completed / tasks.length * 100) : 0
  return <div className="modal-backdrop center"><div className="dialog detail-dialog plan-detail-dialog"><div className="modal-head"><div><span className="eyebrow">PLAN DETAILS</span><h2>{plan.title}</h2></div><button className="icon-button" onClick={onClose}><X /></button></div>
    <div className="detail-body"><div className="detail-meta"><div><span>计划周期</span><strong>{formatShortDate(plan.startDate)} — {formatShortDate(plan.deadline)}</strong></div><div><span>任务进度</span><strong>{completed} / {tasks.length} 项</strong></div><div><span>完成比例</span><strong>{rate}%</strong></div></div>
      <div className="progress detail-progress"><i style={{ width: `${rate}%` }} /></div>
      <section className="detail-section"><span className="eyebrow">计划书</span><div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        a: ({ children }) => <span className="markdown-link">{children}</span>,
        img: ({ alt }) => <span className="markdown-image">[图片：{alt || '未命名'}]</span>,
      }}>{plan.source}</ReactMarkdown></div></section>
      <section className="detail-section"><span className="eyebrow">任务清单</span><div className="detail-task-list">{tasks.map((task) => <div key={task.id} className={task.status === 'completed' ? 'detail-task done' : 'detail-task'}><span>{formatShortDate(task.date)}</span><strong>{task.title}</strong><i>{task.status === 'completed' ? '已完成' : '待完成'}</i></div>)}</div></section>
    </div><div className="modal-actions between"><button className="danger-link" onClick={onDelete}><Trash2 size={16} />删除计划</button><button className="ghost-button" onClick={onClose}>关闭</button></div>
  </div></div>
}

function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
