import { Route, Routes } from 'react-router'
import AdminRoute from './components/AdminRoute.tsx'
import ProtectedLayout from './components/ProtectedLayout.tsx'
import ContactPage from './pages/ContactPage.tsx'
import DashboardPage from './pages/DashboardPage.tsx'
import HomePage from './pages/HomePage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import TicketDetailPage from './pages/TicketDetailPage.tsx'
import TicketsPage from './pages/TicketsPage.tsx'
import UsersPage from './pages/UsersPage.tsx'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<HomePage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="tickets/:id" element={<TicketDetailPage />} />
        <Route element={<AdminRoute />}>
          <Route path="users" element={<UsersPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
