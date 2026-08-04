import { config } from 'dotenv'
// No-ops safely if the file is absent — packaged Electron sets all env vars
// directly via process.env before this ever runs, so no .env file ships.
config({ path: '../.env', quiet: true })

import { app } from './app.js'
import { logger } from './lib/logger.js'

const port = process.env.PORT ?? 3000

app.listen(port, () => {
  logger.info(`Server started on port ${port}`)
})
