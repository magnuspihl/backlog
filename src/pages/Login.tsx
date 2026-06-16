import { useAuth } from '../auth.tsx'

export default function Login() {
  const { discordReady, redirectUri } = useAuth()
  const params = new URLSearchParams(window.location.search)
  const authError = params.get('auth') === 'error'

  return (
    <div className="center">
      <div className="login-card">
        <div className="login-emoji">🎮</div>
        <h1>Backlog</h1>
        <p className="muted">
          Build the list of games you want to play — on your own or with friends. Share a list,
          everyone ranks it their way, and Backlog blends it into one group order.
        </p>
        {authError && <p className="error">Sign-in didn't complete. Please try again.</p>}
        {discordReady ? (
          <a className="btn discord" href="/api/auth/discord/login">
            Continue with Discord
          </a>
        ) : (
          <div className="notice">
            Discord sign-in isn't switched on yet. Once the Discord keys are added, this button
            will log you in.
          </div>
        )}
        {redirectUri && (
          <div className="redirect-hint">
            <span className="muted">
              If sign-in errors out, add this Redirect URL in your Discord app's OAuth2 settings:
            </span>
            <code>{redirectUri}</code>
          </div>
        )}
      </div>
    </div>
  )
}
