import { Route, Routes } from 'react-router'
import ProtectedLayout from './components/ProtectedLayout.tsx'
import HomePage from './pages/HomePage.tsx'
import LoginPage from './pages/LoginPage.tsx'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<HomePage />} />
      </Route>
    </Routes>
  )
}

export default App
