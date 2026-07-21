const { app, BrowserWindow, ipcMain, screen, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs/promises')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
let mainWindow
let achievementWindow

const DEEPSEEK_NORMALIZE_PROMPT = `你是一名专业学习计划编辑。请先把任意格式的 Markdown 计划书统一成按绝对日期排列的每日计划。

输出格式只能是 JSON：{"startDate":"YYYY-MM-DD","deadline":"YYYY-MM-DD","days":[{"date":"YYYY-MM-DD","label":"","requirements":[""]}]}。

规则：
1. 先理解周次、阶段、日期表、日期范围、Day N 和自然语言日程，再换算为绝对日期；每周重新从 Day 1 编号时，必须结合所属周次计算，不能当作全局 Day 1。
2. startDate 是实际执行计划的第一天，deadline 是计划最后一天；准备期、冻结期和其他项目日期不能误作本计划周期。
3. 每个有明确执行内容的日期输出一个 days 项；同一天的全部要求放入 requirements，不得遗漏。没有逐日安排但有明确周范围时，可按原有优先级在该周内合理分配。
4. requirements 只保留实际执行、产出、测试和验收要求；忽略背景介绍、参考资料、时间投入、娱乐睡眠、风险解释、示例、模板、“不做”事项和重复的总目标。
5. 不得添加计划书未要求的工作。label 简短说明当天主题，每条 requirement 保留验收边界但措辞简洁。`

const DEEPSEEK_SPLIT_PROMPT = `你是一名专业学习任务编辑。输入已经是统一后的每日计划，请把每天的 requirements 拆成边界清楚、可以独立确认完成的任务。

输出格式只能是 JSON：{"tasks":[{"requirementId":"R001","title":"","details":""}]}。

规则：
1. 每项任务必须使用输入中已有的 requirementId；同一要求拆成多项时重复使用该 ID。不能遗漏 ID，也不能修改日期或把任务移动到其他天。
2. 当一条 requirement 包含多个能够独立验收的动作时拆开；不可独立验收的上下文保留在 details 中。
3. 不得遗漏输入要求，不得添加新要求，不估算专注时间。
4. title 必须具体且可验收，details 简洁说明完成边界。`

const DEEPSEEK_PROMPT_VIEW = `第一阶段：统一计划书

${DEEPSEEK_NORMALIZE_PROMPT}

第二阶段：拆分每日任务

${DEEPSEEK_SPLIT_PROMPT}

第一阶段还会附加计划名称、导入日期、本地识别的日期提示和完整 Markdown。第二阶段按统一后的日期分批发送，结果在本地校验并合并。`

function arrayChunks(items, limit = 2400) {
  const chunks = []
  let current = []
  let length = 0
  for (const item of items) {
    const itemLength = JSON.stringify(item).length
    if (current.length && length + itemLength > limit) {
      chunks.push(current)
      current = []
      length = 0
    }
    current.push(item)
    length += itemLength
  }
  if (current.length) chunks.push(current)
  return chunks
}

function isDateKey(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3])
}

function normalizedMarkdown(title, startDate, deadline, days) {
  const lines = [`# ${title}：统一后的每日计划`, '', `计划周期：${startDate} 至 ${deadline}`]
  for (const day of days) {
    lines.push('', `## ${day.date} ${day.label}`.trim())
    day.requirements.forEach((requirement) => lines.push(`- ${requirement.text}`))
  }
  return lines.join('\n')
}

function dataPath(name) {
  return path.join(app.getPath('userData'), name)
}

async function readJson(name, fallback) {
  try {
    return JSON.parse(await fs.readFile(dataPath(name), 'utf8'))
  } catch {
    return fallback
  }
}

async function writeJson(name, value) {
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(dataPath(name), JSON.stringify(value, null, 2), 'utf8')
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#090b0e',
    title: '汉广',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#090b0e', symbolColor: '#8e959f', height: 42 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

function showAchievement(payload) {
  if (achievementWindow && !achievementWindow.isDestroyed()) achievementWindow.close()

  const width = 420
  const height = 126
  const { workArea } = screen.getPrimaryDisplay()
  achievementWindow = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 24,
    y: workArea.y + workArea.height - height - 24,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })

  achievementWindow.setAlwaysOnTop(true, 'screen-saver')
  const query = new URLSearchParams({
    title: payload.title || '计划完成',
    subtitle: payload.subtitle || '你又向目标前进了一步',
    kind: payload.kind || 'task',
  }).toString()

  achievementWindow.once('ready-to-show', () => achievementWindow?.showInactive())
  if (isDev) achievementWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}/popup.html?${query}`)
  else achievementWindow.loadFile(path.join(__dirname, '..', 'dist', 'popup.html'), { query: Object.fromEntries(new URLSearchParams(query)) })
}

ipcMain.handle('data:load', () => readJson('learning-data.json', null))
ipcMain.handle('data:save', (_event, data) => writeJson('learning-data.json', data))
ipcMain.handle('achievement:show', (_event, payload) => showAchievement(payload))

ipcMain.handle('settings:load', async () => {
  const settings = await readJson('settings.json', {
    endpoint: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
  })
  let apiKeyHint = settings.apiKeyHint || ''
  if (!apiKeyHint && settings.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
    try {
      const currentKey = safeStorage.decryptString(Buffer.from(settings.encryptedApiKey, 'base64'))
      apiKeyHint = `${currentKey.slice(0, 3)}••••••${currentKey.slice(-4)}`
    } catch {
      apiKeyHint = '已安全保存'
    }
  }
  return {
    endpoint: settings.endpoint,
    model: settings.model,
    hasApiKey: Boolean(settings.encryptedApiKey),
    apiKeyHint,
    prompt: DEEPSEEK_PROMPT_VIEW,
  }
})

ipcMain.handle('settings:save', async (_event, input) => {
  const current = await readJson('settings.json', {})
  const next = {
    endpoint: 'https://api.deepseek.com/chat/completions',
    model: input.model || 'deepseek-chat',
    encryptedApiKey: current.encryptedApiKey,
    apiKeyHint: current.apiKeyHint || '',
  }
  if (input.apiKey) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法安全保存 API Key')
    next.encryptedApiKey = safeStorage.encryptString(input.apiKey).toString('base64')
    next.apiKeyHint = `${input.apiKey.slice(0, 3)}••••••${input.apiKey.slice(-4)}`
  }
  await writeJson('settings.json', next)
  return { ok: true, hasApiKey: Boolean(next.encryptedApiKey), apiKeyHint: next.apiKeyHint }
})

async function requestDeepSeekJson({ apiKey, model, systemPrompt, userPrompt, label }) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`DeepSeek ${label}请求失败 (${response.status})：${body.slice(0, 180)}`)
  }
  const result = await response.json()
  const choice = result.choices?.[0]
  const content = choice?.message?.content
  if (!content) throw new Error(`DeepSeek ${label}未返回可用内容`)
  if (choice.finish_reason === 'length') throw new Error(`DeepSeek ${label}输出达到长度上限，请重试`)
  try {
    const json = content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1)
    return JSON.parse(json)
  } catch {
    throw new Error(`DeepSeek ${label}返回了不完整的 JSON，请重试`)
  }
}

ipcMain.handle('deepseek:split', async (_event, input) => {
  const settings = await readJson('settings.json', {})
  if (!settings.encryptedApiKey) throw new Error('请先在设置中保存 DeepSeek API Key')

  const apiKey = safeStorage.decryptString(Buffer.from(settings.encryptedApiKey, 'base64'))
  const model = settings.model || 'deepseek-chat'
  const rawPlan = await requestDeepSeekJson({
    apiKey,
    model,
    systemPrompt: DEEPSEEK_NORMALIZE_PROMPT,
    userPrompt: `计划名称：${input.title}\n导入日期：${input.importDate}\n本地日期提示：${input.planStartDate} 至 ${input.planDeadline}\n请以计划书语义为准，本地日期仅作参考。\nMarkdown 计划书：\n${input.source}`,
    label: '统一计划书阶段',
  })
  if (!Array.isArray(rawPlan.days)) throw new Error('DeepSeek 统一计划书阶段返回的数据格式不正确')

  const rawDays = rawPlan.days.map((day) => ({
    date: String(day.date || ''),
    label: String(day.label || '').trim(),
    requirements: (Array.isArray(day.requirements) ? day.requirements : [])
      .map((requirement) => typeof requirement === 'string'
        ? requirement.trim()
        : String(requirement?.text || requirement?.title || '').trim())
      .filter(Boolean),
  })).filter((day) => isDateKey(day.date) && day.requirements.length)
  const daysByDate = new Map()
  for (const day of rawDays) {
    const current = daysByDate.get(day.date) || { date: day.date, label: day.label, requirements: [] }
    if (!current.label && day.label) current.label = day.label
    for (const requirement of day.requirements) {
      if (!current.requirements.includes(requirement)) current.requirements.push(requirement)
    }
    daysByDate.set(day.date, current)
  }
  let requirementIndex = 0
  const days = [...daysByDate.values()]
    .sort((first, second) => first.date.localeCompare(second.date))
    .map((day) => ({
      ...day,
      requirements: day.requirements.map((text) => ({ id: `R${String(++requirementIndex).padStart(3, '0')}`, text })),
    }))
  if (!days.length) throw new Error('DeepSeek 统一计划书后没有得到任何每日执行内容')

  const firstTaskDate = days[0].date
  const lastTaskDate = days.at(-1).date
  const declaredStart = isDateKey(rawPlan.startDate) ? rawPlan.startDate : input.planStartDate
  const declaredDeadline = isDateKey(rawPlan.deadline) ? rawPlan.deadline : input.planDeadline
  const startDate = declaredStart < firstTaskDate ? declaredStart : firstTaskDate
  const deadline = declaredDeadline > lastTaskDate ? declaredDeadline : lastTaskDate
  if (deadline < startDate) throw new Error('DeepSeek 统一计划书后得到的计划周期无效')

  const chunks = arrayChunks(days)
  const rawTasks = []
  for (let index = 0; index < chunks.length; index += 1) {
    const parsed = await requestDeepSeekJson({
      apiKey,
      model,
      systemPrompt: DEEPSEEK_SPLIT_PROMPT,
      userPrompt: `计划名称：${input.title}\n当前批次：第 ${index + 1}/${chunks.length} 批\n统一后的每日计划数据：\n${JSON.stringify(chunks[index], null, 2)}`,
      label: `拆分任务第 ${index + 1}/${chunks.length} 批`,
    })
    if (!Array.isArray(parsed.tasks)) throw new Error(`DeepSeek 拆分任务第 ${index + 1}/${chunks.length} 批返回的数据格式不正确`)
    rawTasks.push(...parsed.tasks)
  }

  const requirements = new Map(days.flatMap((day) => day.requirements.map((requirement) => [requirement.id, { ...requirement, date: day.date }])))
  const coveredRequirements = new Set()
  const tasks = rawTasks.map((task) => {
    const requirementId = String(task.requirementId || '')
    const requirement = requirements.get(requirementId)
    if (!requirement) throw new Error(`DeepSeek 拆分任务时返回了未知要求编号：${requirementId || '空值'}`)
    const title = String(task.title || '').trim()
    if (!title) throw new Error(`DeepSeek 拆分任务时为要求 ${requirementId} 返回了空标题`)
    coveredRequirements.add(requirementId)
    return {
      title,
      details: String(task.details || task.title || requirement.text).trim(),
      date: requirement.date,
    }
  })
  const missingRequirements = [...requirements.keys()].filter((id) => !coveredRequirements.has(id))
  if (missingRequirements.length) throw new Error(`DeepSeek 拆分任务时遗漏了 ${missingRequirements.length} 项计划要求，请重试`)

  const seen = new Set()
  const uniqueTasks = tasks.filter((task) => {
    const key = `${task.date}\n${task.title}\n${task.details}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return {
    tasks: uniqueTasks,
    startDate,
    deadline,
    normalizedPlan: normalizedMarkdown(input.title, startDate, deadline, days),
  }
})

app.whenReady().then(() => {
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
