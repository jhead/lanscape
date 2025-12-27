import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import * as net from 'net'
import * as path from 'path'
import * as fs from 'fs'

let mainWindow: BrowserWindow | null = null
let agentProcess: ChildProcess | null = null
let agentPort: number = 8082
let signalingUrl: string = process.env.SIGNALING_URL || 'ws://signaling.main.tsnet.jxh.io'

/**
 * Find an available port starting from the given port
 */
function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const maxPort = 8099
    let currentPort = startPort

    const tryPort = (port: number) => {
      if (port > maxPort) {
        reject(new Error(`No available port found in range ${startPort}-${maxPort}`))
        return
      }

      const server = net.createServer()
      server.listen(port, () => {
        server.once('close', () => {
          resolve(port)
        })
        server.close()
      })
      server.on('error', () => {
        // Port is in use, try next one
        tryPort(port + 1)
      })
    }

    tryPort(currentPort)
  })
}

/**
 * Get the path to the agent binary
 */
function getAgentBinaryPath(): string {
  if (app.isPackaged) {
    // In production, binary is in resources directory
    const resourcesPath = process.resourcesPath
    const platform = process.platform === 'win32' ? 'windows' : 'darwin'
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
    const ext = process.platform === 'win32' ? '.exe' : ''
    return path.join(resourcesPath, 'resources', `lanscape-agent-${platform}-${arch}${ext}`)
  } else {
    // In development, try multiple paths:
    // 1. Built binary in resources directory
    const platform = process.platform === 'win32' ? 'windows' : 'darwin'
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
    const ext = process.platform === 'win32' ? '.exe' : ''
    const devPath = path.join(__dirname, '..', 'resources', `lanscape-agent-${platform}-${arch}${ext}`)
    if (fs.existsSync(devPath)) {
      return devPath
    }
    // 2. Try source directory (if running from workspace root)
    const sourcePath = path.join(__dirname, '..', '..', '..', 'lanscape-agent', 'cmd', 'lanscape-agent')
    if (fs.existsSync(sourcePath)) {
      // Use 'go run' for development
      return 'go'
    }
    // 3. Fallback: try to use Go binary directly if available in PATH
    return 'lanscape-agent'
  }
}

/**
 * Spawn the lanscape-agent process
 */
async function spawnAgent(): Promise<void> {
  if (agentProcess) {
    console.log('[Electron] Agent already running')
    return
  }

  try {
    // Find available port
    agentPort = await findAvailablePort(8082)
    console.log(`[Electron] Found available port: ${agentPort}`)
    console.log(`[Electron] Using signaling URL: ${signalingUrl}`)

    const agentPath = getAgentBinaryPath()
    console.log(`[Electron] Spawning agent from: ${agentPath}`)

    // Determine spawn arguments based on whether we're using 'go run' or the binary
    let spawnArgs: string[]
    let spawnCommand: string
    let spawnCwd: string | undefined
    
    if (agentPath === 'go') {
      // Use 'go run' for development from source
      // Need to run from the lanscape-agent directory
      const agentDir = path.join(__dirname, '..', '..', '..', 'lanscape-agent')
      const mainPath = './cmd/lanscape-agent'
      spawnCommand = 'go'
      spawnArgs = [
        'run', mainPath,
        '--ws-addr', `localhost:${agentPort}`,
        '--signaling-url', signalingUrl,
        '--topic', 'lanscape-chat',
        '--log-level', 'info',
      ]
      spawnCwd = agentDir
    } else {
      // Use the binary directly
      spawnCommand = agentPath
      spawnArgs = [
        '--ws-addr', `localhost:${agentPort}`,
        '--signaling-url', signalingUrl,
        '--topic', 'lanscape-chat',
        '--log-level', 'info',
      ]
      spawnCwd = undefined
    }

    // Spawn agent with the selected port
    agentProcess = spawn(spawnCommand, spawnArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: spawnCwd,
    })

    // Log agent output
    agentProcess.stdout?.on('data', (data) => {
      console.log(`[Agent] ${data.toString().trim()}`)
    })

    agentProcess.stderr?.on('data', (data) => {
      console.error(`[Agent] ${data.toString().trim()}`)
    })

    agentProcess.on('error', (error) => {
      console.error('[Electron] Failed to spawn agent:', error)
      agentProcess = null
    })

    agentProcess.on('exit', (code, signal) => {
      console.log(`[Electron] Agent process exited with code ${code}, signal ${signal}`)
      agentProcess = null
    })

    // Wait a bit for agent to start
    await new Promise(resolve => setTimeout(resolve, 500))
    console.log(`[Electron] Agent spawned successfully on port ${agentPort}`)
  } catch (error) {
    console.error('[Electron] Error spawning agent:', error)
    throw error
  }
}

/**
 * Kill the agent process
 */
function killAgent(): void {
  if (agentProcess) {
    console.log('[Electron] Killing agent process')
    agentProcess.kill('SIGTERM')
    
    // Force kill after 5 seconds if still running
    setTimeout(() => {
      if (agentProcess && !agentProcess.killed) {
        console.log('[Electron] Force killing agent process')
        agentProcess.kill('SIGKILL')
      }
    }, 5000)
    
    agentProcess = null
  }
}

/**
 * Create the main window
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Load the webui
  if (app.isPackaged) {
    // In production, try multiple possible paths for webui dist
    const possiblePaths = [
      path.join(__dirname, 'webui', 'index.html'), // Copied to dist/webui
      path.join(process.resourcesPath, 'app', 'webui', 'index.html'), // In app.asar
      path.join(process.resourcesPath, 'webui', 'dist', 'index.html'), // In resources
    ]
    
    let loaded = false
    for (const webuiPath of possiblePaths) {
      if (fs.existsSync(webuiPath)) {
        console.log('[Electron] Loading webui from:', webuiPath)
        mainWindow.loadFile(webuiPath)
        loaded = true
        break
      }
    }
    
    if (!loaded) {
      console.error('[Electron] Could not find webui dist in any expected location')
      console.error('[Electron] Tried paths:', possiblePaths)
      // Fallback: try to load from dev server (might work if it's running)
      mainWindow.loadURL('http://localhost:5173')
    }
  } else {
    // In development, load from webui dev server
    mainWindow.loadURL('http://localhost:5173')
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// App event handlers
app.whenReady().then(async () => {
  console.log('[Electron] App ready')
  
  // Spawn agent before creating window
  try {
    await spawnAgent()
  } catch (error) {
    console.error('[Electron] Failed to start agent:', error)
    // Continue anyway - user might want to connect to external agent
  }
  
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  killAgent()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  killAgent()
})

// IPC handlers
ipcMain.handle('get-agent-port', () => {
  return agentPort
})

