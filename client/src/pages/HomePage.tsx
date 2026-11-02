import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import PageHeader from '../components/PageHeader.tsx'

type Health = { status: string; database: string }

async function fetchHealth() {
  // The server answers 503 with a body when the database is unreachable.
  const res = await axios.get<Health>('/api/health', {
    validateStatus: (status) => status === 200 || status === 503,
  })
  return res.data
}

function HomePage() {
  const { data: health, isError } = useQuery({ queryKey: ['health'], queryFn: fetchHealth })

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <PageHeader title="Home" />
      <div className="p-4">
        {isError && <p>Could not reach the server</p>}
        {health && (
          <p>
            Server: {health.status} · Database: {health.database}
          </p>
        )}
      </div>
    </main>
  )
}

export default HomePage
