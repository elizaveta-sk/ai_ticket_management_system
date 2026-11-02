import './instrument.ts'
import { reactErrorHandler } from '@sentry/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'

// No retries: the default of three delays showing errors such as a 403 by several seconds.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})
// Nothing observes a reply draft while another ticket is open, and it must not expire then.
queryClient.setQueryDefaults(['reply-draft'], { gcTime: Infinity })

createRoot(document.getElementById('root')!, {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
}).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
