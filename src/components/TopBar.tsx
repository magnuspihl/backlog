import { Link } from 'react-router-dom'
import { useAuth } from '../auth.tsx'

export default function TopBar() {
  const { user, logout } = useAuth()
  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <Link to="/" className="brand">
          🎮 Backlog
        </Link>
        {user && (
          <div className="user-chip">
            {user.avatar && <img src={user.avatar} alt="" className="avatar" />}
            <span>{user.globalName || user.username}</span>
            <button className="link-btn" onClick={() => logout()}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
