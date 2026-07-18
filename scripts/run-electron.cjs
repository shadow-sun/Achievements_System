const { spawn } = require('child_process')
const electron = require('electron')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electron, ['.'], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
})

const stop = () => {
  if (!child.killed) child.kill()
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
child.on('exit', (code) => process.exit(code ?? 0))
