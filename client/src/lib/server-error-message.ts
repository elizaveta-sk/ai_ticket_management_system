import axios from 'axios'

// The server's `error` message when there is one, otherwise the fallback.
export function serverErrorMessage(error: unknown, fallback: string) {
  const message = axios.isAxiosError(error) ? error.response?.data?.error : undefined
  return typeof message === 'string' ? message : fallback
}
