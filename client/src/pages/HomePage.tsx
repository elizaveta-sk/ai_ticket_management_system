import { useEffect, useState } from 'react'

type Health = { status: string; database: string }

function HomePage() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setError('Could not reach the server'))
  }, [])

  return (
    <main className="mx-auto max-w-240 p-6">
      <h1 className="mb-4 text-2xl font-bold">Home</h1>
      {error && <p>{error}</p>}
      {health && (
        <p>
          Server: {health.status} · Database: {health.database}
        </p>
      )}
    </main>
  )
}

export default HomePage
