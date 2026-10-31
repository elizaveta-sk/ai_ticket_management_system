import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

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
    <main className="mx-auto max-w-240 p-6">
      <h1 className="mb-4 text-2xl font-bold">Home</h1>
      {isError && <p>Could not reach the server</p>}
      {health && (
        <p>
          Server: {health.status} · Database: {health.database}
        </p>
      )}
    </main>
  )
}

export default HomePage
