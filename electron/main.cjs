const { app, BrowserWindow, ipcMain, screen, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs/promises')

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)
let mainWindow
let achievementWindow

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
  return {
    endpoint: settings.endpoint,
    model: settings.model,
    hasApiKey: Boolean(settings.encryptedApiKey),
  }
})

ipcMain.handle('settings:save', async (_event, input) => {
  const current = await readJson('settings.json', {})
  const next = {
    endpoint: 'https://api.deepseek.com/chat/completions',
    model: input.model || 'deepseek-chat',
    encryptedApiKey: current.encryptedApiKey,
  }
  if (input.apiKey) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法安全保存 API Key')
    next.encryptedApiKey = safeStorage.encryptString(input.apiKey).toString('base64')
  }
  await writeJson('settings.json', next)
  return { ok: true, hasApiKey: Boolean(next.encryptedApiKey) }
})

ipcMain.handle('deepseek:split', async (_event, input) => {
  const settings = await readJson('settings.json', {})
  if (!settings.encryptedApiKey) throw new Error('请先在设置中保存 DeepSeek API Key')

  const apiKey = safeStorage.decryptString(Buffer.from(settings.encryptedApiKey, 'base64'))
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: settings.model || 'deepseek-chat',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: '你是一名专业学习规划师。把 Markdown 计划书拆成由易到难、边界清楚、可以独立确认完成的原子任务。只输出 JSON：{"tasks":[{"title":"","details":""}]}。标题必须具体且可验收，不估算时间，不添加用户没有要求的学习内容。',
        },
        {
          role: 'user',
          content: `计划名称：${input.title}\nMarkdown 任务书：\n${input.source}`,
        },
      ],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`DeepSeek 请求失败 (${response.status})：${body.slice(0, 180)}`)
  }
  const result = await response.json()
  const content = result.choices?.[0]?.message?.content
  if (!content) throw new Error('DeepSeek 未返回可用内容')
  const parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, ''))
  if (!Array.isArray(parsed.tasks)) throw new Error('DeepSeek 返回的数据格式不正确')
  return parsed.tasks
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
