import { useState, type FormEvent } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'

const pages = [
  { path: '/', label: 'Dashboard', desc: 'Event overview.' },
  { path: '/teams', label: 'Teams', desc: 'Define and manage teams.' },
  { path: '/rooms', label: 'Rooms', desc: 'Assign teams to rooms.' },
  { path: '/mentors', label: 'Mentors', desc: 'Track mentor locations.' },
]

function Page({ title, desc }: { title: string; desc: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <p>{desc}</p>
    </section>
  )
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const password = formData.get('password')
    const confirmPassword = formData.get('confirmPassword')

    if (isSignUp && password !== confirmPassword) {
      setError('Your passwords do not match.')
      return
    }

    setError('')
    onAuthenticated()
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <a className="auth-brand" href="/" aria-label="Mule Hacks home">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>Mule Hacks <span className="brand-light">Admin</span></span>
        </a>

        <div className="auth-intro">
          <p className="eyebrow">{isSignUp ? 'JOIN YOUR EVENT TEAM' : 'WELCOME BACK'}</p>
          <h1 id="auth-title">{isSignUp ? 'Create your account' : 'Sign in to your account'}</h1>
          <p className="auth-subtitle">
            {isSignUp
              ? 'Get started managing your Mule Hacks event.'
              : 'Manage your Mule Hacks event, all in one place.'}
          </p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Account options">
          <button
            type="button"
            role="tab"
            aria-selected={!isSignUp}
            className={!isSignUp ? 'selected' : ''}
            onClick={() => {
              setIsSignUp(false)
              setError('')
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSignUp}
            className={isSignUp ? 'selected' : ''}
            onClick={() => {
              setIsSignUp(true)
              setError('')
            }}
          >
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignUp && (
            <label>
              Full name
              <input name="name" type="text" placeholder="Your name" autoComplete="name" required />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              placeholder="At least 8 characters"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              minLength={8}
              required
            />
          </label>
          {isSignUp && (
            <label>
              Confirm password
              <input
                name="confirmPassword"
                type="password"
                placeholder="Enter your password again"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
          )}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit">
            {isSignUp ? 'Create account' : 'Sign in'}
            <span aria-hidden="true">→</span>
          </button>
        </form>

        <p className="auth-switch">
          {isSignUp ? 'Already have an account?' : 'New to Mule Hacks?'}{' '}
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp)
              setError('')
            }}
          >
            {isSignUp ? 'Sign in' : 'Create an account'}
          </button>
        </p>
        <p className="demo-notice">Demo mode · Authentication is not connected yet</p>
      </section>
      <aside className="auth-aside" aria-label="About Mule Hacks">
        <div className="aside-orb orb-one" />
        <div className="aside-orb orb-two" />
        <div className="aside-content">
          <p className="eyebrow">MAKE IT HAPPEN</p>
          <h2>Big ideas start with a team.</h2>
          <p>Everything you need to bring your next great event together.</p>
          <div className="aside-decoration" aria-hidden="true">
            <span>TEAMWORK</span><span>·</span><span>CREATIVITY</span><span>·</span><span>IMPACT</span>
          </div>
        </div>
        <span className="aside-footer">Mule Hacks · Event management</span>
      </aside>
    </main>
  )
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  if (!isAuthenticated) {
    return <AuthScreen onAuthenticated={() => setIsAuthenticated(true)} />
  }

  return (
    <div className="layout">
      <header className="topbar">
        <span>Mule Hacks Admin</span>
        <button className="sign-out" type="button" onClick={() => setIsAuthenticated(false)}>
          Sign out
        </button>
      </header>
      <nav className="nav">
        {pages.map((p) => (
          <NavLink key={p.path} to={p.path} end>
            {p.label}
          </NavLink>
        ))}
      </nav>
      <main className="content">
        <Routes>
          {pages.map((p) => (
            <Route key={p.path} path={p.path} element={<Page title={p.label} desc={p.desc} />} />
          ))}
          <Route path="*" element={<Page title="Not found" desc="That page doesn't exist." />} />
        </Routes>
      </main>
    </div>
  )
}
