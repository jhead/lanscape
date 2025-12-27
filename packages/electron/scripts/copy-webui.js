const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const src = path.join(__dirname, '..', '..', 'webui', 'dist')
const dst = path.join(__dirname, '..', 'dist', 'webui')

if (fs.existsSync(src)) {
  // Remove destination if it exists
  if (fs.existsSync(dst)) {
    fs.rmSync(dst, { recursive: true, force: true })
  }
  
  // Copy directory
  if (process.platform === 'win32') {
    // Windows: use robocopy or xcopy
    try {
      execSync(`robocopy "${src}" "${dst}" /E /NFL /NDL /NJH /NJS`, { stdio: 'inherit' })
    } catch (e) {
      // robocopy exits with non-zero code on success, so try xcopy as fallback
      execSync(`xcopy /E /I /Y "${src}" "${dst}"`, { stdio: 'inherit' })
    }
  } else {
    // Unix: use cp
    execSync(`cp -r "${src}" "${dst}"`, { stdio: 'inherit' })
  }
  console.log('Copied webui dist to electron package')
} else {
  console.warn('Warning: webui/dist not found, run pnpm --filter webui build first')
  fs.mkdirSync(dst, { recursive: true })
}

