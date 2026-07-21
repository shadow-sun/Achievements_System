const { app, BrowserWindow, ipcMain, screen, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs/promises')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
let mainWindow
let achievementWindow

const DEEPSEEK_SYSTEM_PROMPT = `你是一名专业学习规划师。请从给定的 Markdown 计划片段中提取全部可执行任务，并保留计划书的日期安排。

输出格式只能是 JSON：{"tasks":[{"title":"","details":"","day":1,"date":"YYYY-MM-DD"}]}。

规则：
1. 日期标题或 Day N 下有多项待办时，每项分别输出，不得遗漏或合并。
2. Day N 标题下的每项任务都必须原样填写对应的 day 数字；Day 1 等于计划开始日期，最终日期由本地程序计算。
3. 优先采用计划书明确写出的日期；没有任务日期时，才在计划起止日期内按原顺序安排。
4. 只提取实际执行清单、明确产出和验收任务；不要把背景介绍、技术选型、参考资料、风险说明、模板、可选项或“不做”事项创建为任务。
5. title 必须具体且可验收，details 简洁保留必要上下文；不估算专注时间，不添加计划书未要求的内容。`

const DEEPSEEK_PROMPT_VIEW = `${DEEPSEEK_SYSTEM_PROMPT}

每批请求还会附加：计划名称、导入日期、本地识别的计划起止日期、当前批次编号，以及对应的 Markdown 计划片段。包含 Day N 的长计划会按 Day 段落分批发送，结果在本地合并。`

function scheduledTaskSource(source) {
  const lines = source.split(/\r?\n/)
  const sections = []
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^(#{2,6})\s+(.+)$/)
    if (!heading || !/^(?:Day\s*\d+\s*(?:[：:]|$)|第\s*\d+\s*天)/i.test(heading[2])) continue
    const level = heading[1].length
    let end = index + 1
    while (end < lines.length) {
      const nextHeading = lines[end].match(/^(#{1,6})\s+/)
      if (nextHeading && nextHeading[1].length <= level) break
      end += 1
    }
    sections.push(lines.slice(index, end).join('\n'))
    index = end - 1
  }
  return sections.length ? sections.join('\n\n') : source
}

function markdownChunks(source, limit = 1800) {
  const blocks = source.split(/(?=^#{2,6}\s+)/m).filter((block) => block.trim())
  const chunks = []
  let current = ''
  for (const block of blocks.length ? blocks : [source]) {
    if (current && current.length + block.length > limit) {
      chunks.push(current)
      current = ''
    }
    if (block.length <= limit) {
      current += block
      continue
    }
    const lines = block.split(/\r?\n/)
    for (const line of lines) {
      if (current && current.length + line.length + 1 > limit) {
        chunks.push(current)
        current = ''
      }
      current += `${line}\n`
    }
  }
  if (current.trim()) chunks.push(current)
  return chunks
}

function addDaysToDateKey(value, count) {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + count)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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

ipcMain.handle('deepseek:split', async (_event, input) => {
  const settings = await readJson('settings.json', {})
  if (!settings.encryptedApiKey) throw new Error('请先在设置中保存 DeepSeek API Key')

  const apiKey = safeStorage.decryptString(Buffer.from(settings.encryptedApiKey, 'base64'))
  const chunks = markdownChunks(scheduledTaskSource(input.source))
  const tasks = []

  for (let index = 0; index < chunks.length; index += 1) {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: settings.model || 'deepseek-chat',
        temperature: 0.1,
        max_tokens: 8192,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: DEEPSEEK_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `计划名称：${input.title}\n导入日期：${input.importDate}\n计划开始日期：${input.planStartDate}\n计划截止日期：${input.planDeadline}\n当前片段：第 ${index + 1}/${chunks.length} 批\nMarkdown 计划片段：\n${chunks[index]}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`DeepSeek 第 ${index + 1}/${chunks.length} 批请求失败 (${response.status})：${body.slice(0, 180)}`)
    }
    const result = await response.json()
    const choice = result.choices?.[0]
    const content = choice?.message?.content
    if (!content) throw new Error(`DeepSeek 第 ${index + 1}/${chunks.length} 批未返回可用内容`)
    if (choice.finish_reason === 'length') {
      throw new Error(`DeepSeek 第 ${index + 1}/${chunks.length} 批输出达到长度上限，请重试或改用本地模式`)
    }

    let parsed
    try {
      const json = content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1)
      parsed = JSON.parse(json)
    } catch {
      throw new Error(`DeepSeek 第 ${index + 1}/${chunks.length} 批返回了不完整的 JSON，请重试`)
    }
    if (!Array.isArray(parsed.tasks)) throw new Error(`DeepSeek 第 ${index + 1}/${chunks.length} 批返回的数据格式不正确`)
    tasks.push(...parsed.tasks)
  }

  const normalized = tasks.map((task) => ({
    title: String(task.title || '').trim(),
    details: String(task.details || task.title || '').trim(),
    date: Number.isInteger(Number(task.day)) && Number(task.day) > 0
      ? addDaysToDateKey(input.planStartDate, Number(task.day) - 1)
      : /^\d{4}-\d{2}-\d{2}$/.test(task.date) ? task.date : input.planStartDate,
  })).filter((task) => task.title)
  const seen = new Set()
  return normalized.filter((task) => {
    const key = `${task.date}\n${task.title}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
