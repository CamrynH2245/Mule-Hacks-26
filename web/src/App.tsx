import { useState, type FormEvent } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'

type Profile = {
  name: string
  birthdate: string
  email: string
  phone: string
}

type PasswordCredential = {
  salt: string
  hash: string
}

type SavedAccount = {
  profile: Profile
  credential: PasswordCredential | null
}

const profileStorageKey = 'mule-hacks-profile'
const emptyProfile: Profile = { name: '', birthdate: '', email: '', phone: '' }
const passwordHashIterations = 310_000

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function getTodayDate(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
}

function isProfile(value: unknown): value is Profile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    'birthdate' in value &&
    typeof value.birthdate === 'string' &&
    'email' in value &&
    typeof value.email === 'string' &&
    'phone' in value &&
    typeof value.phone === 'string'
  )
}

function isPasswordCredential(value: unknown): value is PasswordCredential {
  return (
    typeof value === 'object' &&
    value !== null &&
    'salt' in value &&
    typeof value.salt === 'string' &&
    /^[0-9a-f]{32}$/.test(value.salt) &&
    'hash' in value &&
    typeof value.hash === 'string' &&
    /^[0-9a-f]{64}$/.test(value.hash)
  )
}

function readSavedAccounts(): { accounts: SavedAccount[]; error: string } {
  try {
    const savedAccounts = localStorage.getItem(profileStorageKey)
    if (!savedAccounts) return { accounts: [], error: '' }

    const parsed: unknown = JSON.parse(savedAccounts)
    if (typeof parsed !== 'object' || parsed === null) {
      return { accounts: [], error: 'The saved accounts are invalid. Please sign up again.' }
    }

    let accountRecords: unknown[]
    if ('accounts' in parsed && Array.isArray(parsed.accounts)) {
      accountRecords = parsed.accounts
    } else {
      accountRecords = [parsed]
    }

    const accounts: SavedAccount[] = []
    for (const record of accountRecords) {
      if (typeof record !== 'object' || record === null) {
        return { accounts: [], error: 'The saved accounts are invalid. Please sign up again.' }
      }
      const isAccountRecord = 'profile' in record
      const profile = isAccountRecord ? record.profile : record
      const credential = isAccountRecord && 'credential' in record ? record.credential : null
      if (!isProfile(profile) || (credential !== null && !isPasswordCredential(credential))) {
        return { accounts: [], error: 'A saved account is invalid. Please sign up again.' }
      }
      accounts.push({
        profile: { ...profile, phone: formatPhoneNumber(profile.phone) },
        credential,
      })
    }

    const emails = accounts.map(({ profile }) => normalizeEmail(profile.email))
    if (new Set(emails).size !== emails.length) {
      return { accounts: [], error: 'Saved accounts contain duplicate email addresses. Please contact support.' }
    }

    return {
      accounts,
      error: '',
    }
  } catch {
    return { accounts: [], error: 'The saved accounts could not be loaded. Please try again.' }
  }
}

function toHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: Uint8Array.from(salt.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16)), iterations: passwordHashIterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return toHex(new Uint8Array(hash))
}

async function createPasswordCredential(password: string): Promise<PasswordCredential> {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)))
  return { salt, hash: await hashPassword(password, salt) }
}

async function verifyPassword(password: string, credential: PasswordCredential): Promise<boolean> {
  const candidate = await hashPassword(password, credential.salt)
  let difference = 0
  for (let index = 0; index < candidate.length; index += 1) {
    difference |= candidate.charCodeAt(index) ^ credential.hash.charCodeAt(index)
  }
  return difference === 0
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
  onSave: (profile: Profile) => boolean
}) {
  const [formProfile, setFormProfile] = useState(profile)
  const [saved, setSaved] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaved(onSave(formProfile))
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
              max={getTodayDate()}
              value={formProfile.birthdate}
              onChange={(event) => {
                setFormProfile({ ...formProfile, birthdate: event.target.value })
                setSaved(false)
              }}
              required
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
              inputMode="numeric"
              placeholder="xxx-xxx-xxxx"
              pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}"
              title="Enter a 10-digit phone number in xxx-xxx-xxxx format."
              value={formProfile.phone}
              onChange={(event) => {
                setFormProfile({ ...formProfile, phone: formatPhoneNumber(event.target.value) })
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
  accounts,
  onAuthenticated,
}: {
  accounts: SavedAccount[]
  onAuthenticated: (profile: Profile, credential: PasswordCredential | null, isSignUp: boolean) => boolean
}) {
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const password = String(formData.get('password'))
    const email = String(formData.get('email')).trim().toLowerCase()

    setError('')
    setIsSubmitting(true)
    try {
      if (isSignUp) {
        if (password !== formData.get('confirmPassword')) {
          setError('Your passwords do not match.')
          return
        }

        if (accounts.some(({ profile }) => normalizeEmail(profile.email) === email)) {
          setError('An account with this email already exists. Sign in instead.')
          return
        }

        const nextProfile = {
          ...emptyProfile,
          name: String(formData.get('name')).trim(),
          birthdate: String(formData.get('birthdate')),
          email,
          phone: String(formData.get('phone')),
        }
        const nextCredential = await createPasswordCredential(password)
        if (!onAuthenticated(nextProfile, nextCredential, true)) {
          setError('Your account could not be saved. Check your browser storage settings and try again.')
        }
        return
      }

      const account = accounts.find(({ profile }) => normalizeEmail(profile.email) === email)
      if (!account?.credential || !(await verifyPassword(password, account.credential))) {
        setError('Email or password is incorrect.')
        return
      }

      if (!onAuthenticated(account.profile, account.credential, false)) {
        setError('Your account could not be loaded. Check your browser storage settings and try again.')
      }
    } catch {
      setError('Authentication could not be completed. Make sure browser cryptography is available and try again.')
    } finally {
      setIsSubmitting(false)
    }
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
          {isSignUp && (
            <label>
              Date of birth
              <input name="birthdate" type="date" autoComplete="bday" max={getTodayDate()} required />
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
          {isSignUp && (
            <label>
              Phone number
              <input
                name="phone"
                type="tel"
                placeholder="xxx-xxx-xxxx"
                autoComplete="tel"
                inputMode="numeric"
                pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}"
                title="Enter a 10-digit phone number in xxx-xxx-xxxx format."
                onChange={(event) => {
                  event.currentTarget.value = formatPhoneNumber(event.currentTarget.value)
                }}
                required
              />
            </label>
          )}
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
          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
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
        <p className="demo-notice">Demo mode · Account is saved in this browser only</p>
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
  const [savedAccounts] = useState(readSavedAccounts)
  const [accounts, setAccounts] = useState(savedAccounts.accounts)
  const [profile, setProfile] = useState(emptyProfile)
  const [activeEmail, setActiveEmail] = useState('')
  const [profileError, setProfileError] = useState(savedAccounts.error)

  function authenticateAccount(
    nextProfile: Profile,
    nextCredential: PasswordCredential | null,
    isSignUp: boolean,
  ): boolean {
    if (!isSignUp) {
      setProfile(nextProfile)
      setActiveEmail(normalizeEmail(nextProfile.email))
      setProfileError('')
      setIsAuthenticated(true)
      return true
    }

    if (accounts.some(({ profile: savedProfile }) =>
      normalizeEmail(savedProfile.email) === normalizeEmail(nextProfile.email))) {
      return false
    }

    const nextAccounts = [...accounts, { profile: nextProfile, credential: nextCredential }]
    try {
      localStorage.setItem(profileStorageKey, JSON.stringify({ accounts: nextAccounts }))
      setAccounts(nextAccounts)
      setProfile(nextProfile)
      setActiveEmail(normalizeEmail(nextProfile.email))
      setProfileError('')
      setIsAuthenticated(true)
      return true
    } catch {
      setProfileError('Your account could not be saved. Check your browser storage settings and try again.')
      return false
    }
  }

  function persistProfile(nextProfile: Profile): boolean {
    const accountIndex = accounts.findIndex(({ profile: savedProfile }) =>
      normalizeEmail(savedProfile.email) === activeEmail)
    if (accountIndex === -1) {
      setProfileError('Your account could not be found. Please sign in again.')
      return false
    }
    if (accounts.some(({ profile: savedProfile }, index) =>
      index !== accountIndex && normalizeEmail(savedProfile.email) === normalizeEmail(nextProfile.email))) {
      setProfileError('Another account already uses this email address.')
      return false
    }

    const nextAccounts = accounts.map((account, index) =>
      index === accountIndex ? { ...account, profile: nextProfile } : account)
    try {
      localStorage.setItem(profileStorageKey, JSON.stringify({ accounts: nextAccounts }))
      setAccounts(nextAccounts)
      setProfile(nextProfile)
      setActiveEmail(normalizeEmail(nextProfile.email))
      setProfileError('')
      return true
    } catch {
      setProfileError('Your profile could not be saved. Check your browser storage settings and try again.')
      return false
    }
  }

  if (!isAuthenticated) {
    return (
      <AuthScreen
        accounts={accounts}
        onAuthenticated={authenticateAccount}
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
