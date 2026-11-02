import { app } from './app.ts'
import { startTicketSweep } from './lib/process-ticket.ts'

const port = Number(process.env.PORT ?? 3000)

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
  startTicketSweep()
})
