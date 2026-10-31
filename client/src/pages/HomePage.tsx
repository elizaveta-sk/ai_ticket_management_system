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
    <main className="page">
      <h1>Home</h1>
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
