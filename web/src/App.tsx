import { useState, type FormEvent } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'

type Profile = {
  name: string
  birthdate: string
  email: string
  phone: string
}

const profileStorageKey = 'mule-hacks-profile'
const emptyProfile: Profile = { name: '', birthdate: '', email: '', phone: '' }

function readSavedProfile(): { profile: Profile; error: string } {
  try {
    const savedProfile = localStorage.getItem(profileStorageKey)
    if (!savedProfile) return { profile: emptyProfile, error: '' }

    const parsed: unknown = JSON.parse(savedProfile)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('name' in parsed) ||
      !('birthdate' in parsed) ||
      !('email' in parsed) ||
      !('phone' in parsed) ||
      typeof parsed.name !== 'string' ||
      typeof parsed.birthdate !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.phone !== 'string'
    ) {
      return { profile: emptyProfile, error: 'The saved profile is invalid. Please enter your details again.' }
    }

    return {
      profile: {
        name: parsed.name,
        birthdate: parsed.birthdate,
        email: parsed.email,
        phone: parsed.phone,
      },
      error: '',
    }
  } catch {
    return { profile: emptyProfile, error: 'The saved profile could not be loaded. Please enter your details again.' }
  }
}

const pages = [
  { path: '/', label: 'Dashboard', desc: 'Event overview.' },
  { path: '/teams', label: 'Teams', desc: 'Define and manage teams.' },
  { path: '/rooms', label: 'Rooms', desc: 'Assign teams to rooms.' },
  { path: '/mentors', label: 'Mentors', desc: 'Track mentor locations.' },
  { path: '/profile', label: 'Profile', desc: 'Edit your account details and contact information.' },
]

function Page({ title, desc }: { title: string; desc: string }) {
  return (
    <section>
      <h1>{title}</h1>
      <p>{desc}</p>
    </section>
  )
}

function ProfilePage({
  profile,
  error,
  onSave,
}: {
  profile: Profile
  error: string
  onSave: (profile: Profile) => void
}) {
  const [formProfile, setFormProfile] = useState(profile)
  const [saved, setSaved] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSave(formProfile)
    setSaved(true)
  }

  return (
    <section className="profile-page">
      <div className="profile-heading">
        <p className="eyebrow">YOUR ACCOUNT</p>
        <h1>Profile</h1>
        <p>Manage your personal details and contact information.</p>
      </div>
      <form className="profile-form" onSubmit={handleSubmit}>
        <div className="profile-form-grid">
          <label>
            Full name
            <input
              type="text"
              autoComplete="name"
              value={formProfile.name}
              onChange={(event) => {
                setFormProfile({ ...formProfile, name: event.target.value })
                setSaved(false)
              }}
              required
            />
          </label>
          <label>
            Birthdate
            <input
              type="date"
              autoComplete="bday"
              value={formProfile.birthdate}
              onChange={(event) => {
                setFormProfile({ ...formProfile, birthdate: event.target.value })
                setSaved(false)
              }}
            />
          </label>
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              value={formProfile.email}
              onChange={(event) => {
                setFormProfile({ ...formProfile, email: event.target.value })
                setSaved(false)
              }}
              required
            />
          </label>
          <label>
            Phone number
            <input
              type="tel"
              autoComplete="tel"
              value={formProfile.phone}
              onChange={(event) => {
                setFormProfile({ ...formProfile, phone: event.target.value })
                setSaved(false)
              }}
            />
          </label>
        </div>
        {error && <p className="profile-message profile-error" role="alert">{error}</p>}
        {saved && !error && <p className="profile-message" role="status">Profile saved.</p>}
        <button className="profile-save" type="submit">Save changes</button>
      </form>
    </section>
  )
}

function AuthScreen({
  profile,
  onAuthenticated,
}: {
  profile: Profile
  onAuthenticated: (profile: Profile) => void
}) {
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
    onAuthenticated({
      ...(isSignUp ? emptyProfile : profile),
      name: isSignUp ? String(formData.get('name')) : profile.name,
      email: String(formData.get('email')),
    })
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
  const [savedProfile] = useState(readSavedProfile)
  const [profile, setProfile] = useState(savedProfile.profile)
  const [profileError, setProfileError] = useState(savedProfile.error)

  function persistProfile(nextProfile: Profile) {
    try {
      localStorage.setItem(profileStorageKey, JSON.stringify(nextProfile))
      setProfile(nextProfile)
      setProfileError('')
    } catch {
      setProfileError('Your profile could not be saved. Check your browser storage settings and try again.')
    }
  }

  if (!isAuthenticated) {
    return (
      <AuthScreen
        profile={profile}
        onAuthenticated={(authenticatedProfile) => {
          persistProfile(authenticatedProfile)
          setIsAuthenticated(true)
        }}
      />
    )
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
            <Route
              key={p.path}
              path={p.path}
              element={p.path === '/profile'
                ? <ProfilePage profile={profile} error={profileError} onSave={persistProfile} />
                : <Page title={p.label} desc={p.desc} />}
            />
          ))}
          <Route path="*" element={<Page title="Not found" desc="That page doesn't exist." />} />
        </Routes>
      </main>
    </div>
  )
}
