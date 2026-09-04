import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth.tsx'
import Login from './pages/Login.tsx'
import Dashboard from './pages/Dashboard.tsx'
import ListView from './pages/ListView.tsx'
import TopBar from './components/TopBar.tsx'

function Shell() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="center muted">Loading…</div>
  }

  return (
    <>
      <TopBar />
      {!user ? (
        <Login />
      ) : (
        <main className="container">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/lists/:id" element={<ListView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      )}
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
