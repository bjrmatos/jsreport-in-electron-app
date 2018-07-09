const { app, BrowserWindow, ipcMain } = require('electron')
const EOL = require('os').EOL
const fs = require('fs')
const url = require('url')
const path = require('path')
const isDev = require('electron-is-dev')

let CWD = process.cwd()

if (!isDev) {
  const chromePath = require('puppeteer').executablePath()
  const exePath = path.dirname(app.getPath('exe'))

  // process.cwd() returns '/' on unix from executable
  if (process.platform !== 'win32' && process.cwd() !== exePath) {
    CWD = exePath
    process.chdir(CWD)
  }

  // get correct path to chrome executable when running on compiled electron app
  process.env.extensions_chromePdf_launchOptions_executablePath = path.join(CWD, chromePath.slice(chromePath.indexOf('node_modules')))
}

const rootDir = process.platform === 'darwin' ? __dirname : CWD

const jsreport = require('jsreport')({
  rootDirectory: rootDir
})

let mainWindow

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit()
  }
});

app.on('ready', () => {
  mainWindow = new BrowserWindow({ width: 500, height: 300 })

  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file'
  }))

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // handling action that was generated from renderer process
  ipcMain.on('render-start', async (event, args) => {
    appLog('info', 'initializing reporter..')

    try {
      // we defer jsreport initialization on first report render
      // to avoid slowing down the app at start time
      if (!jsreport._initialized) {
        await jsreport.init()
        appLog('info', 'jsreport started')
      }

      appLog('info', 'rendering report..')

      try {
        const resp = await jsreport.render({
          template: {
            content: fs.readFileSync(path.join(__dirname, './report.html')).toString(),
            engine: 'handlebars',
            recipe: 'chrome-pdf'
          },
          data: {
            rows: args
          }
        })

        appLog('info', 'report generated')

        fs.writeFileSync(path.join(CWD, 'report.pdf'), resp.content)

        const pdfWindow = new BrowserWindow({
      		width: 1024,
      		height: 800,
      		webPreferences: {
      			plugins: true
      		}
      	})

      	pdfWindow.loadURL(url.format({
          pathname: path.join(CWD, 'report.pdf'),
          protocol: 'file'
        }))

        event.sender.send('render-finish', {})
      } catch (e) {
        appLog('error', `error while generating or saving report: ${e.stack}`)
        event.sender.send('render-finish', { errorText: e.stack })
      }
    } catch (e) {
      appLog('error', `error while starting jsreport: ${e.stack}`)
      app.quit()
    }
  })
})

process.on('uncaughtException', (err) => {
  appLog('error', `Uncaught error: ${err.stack}`)
  throw err
})

// function to save app logs, it writes to console and to a file.
// writing to a file is handy because when running the app from normal
// executable there is no console to see logs
function appLog(level, message) {
  const origMsg = message

  message += EOL

  if (level === 'info') {
    console.log(origMsg)
    fs.appendFileSync(path.join(CWD, 'app-info.log'), message)
  } else if (level === 'error') {
    console.error(origMsg)
    fs.appendFileSync(path.join(CWD, 'app-error.log'), message)
  }
}
