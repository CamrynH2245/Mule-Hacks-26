import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'

type Profile = {
  name: string
  birthdate: string
  email: string
  phone: string
}

type PasswordCredential = { salt: string; hash: string }
type SavedAccount = { profile: Profile; credential: PasswordCredential | null }

const profileStorageKey = 'mule-hacks-profile'
const emptyProfile: Profile = { name: '', birthdate: '', email: '', phone: '' }
const passwordHashIterations = 310_000

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function getTodayDate(): string {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
}

function isProfile(value: unknown): value is Profile {
  return typeof value === 'object' && value !== null &&
    'name' in value && typeof value.name === 'string' &&
    'birthdate' in value && typeof value.birthdate === 'string' &&
    'email' in value && typeof value.email === 'string' &&
    'phone' in value && typeof value.phone === 'string'
}

function isPasswordCredential(value: unknown): value is PasswordCredential {
  return typeof value === 'object' && value !== null &&
    'salt' in value && typeof value.salt === 'string' && /^[0-9a-f]{32}$/.test(value.salt) &&
    'hash' in value && typeof value.hash === 'string' && /^[0-9a-f]{64}$/.test(value.hash)
}

function readSavedAccounts(): { accounts: SavedAccount[]; error: string } {
  try {
    const saved = localStorage.getItem(profileStorageKey)
    if (!saved) return { accounts: [], error: '' }
    const parsed: unknown = JSON.parse(saved)
    if (typeof parsed !== 'object' || parsed === null) {
      return { accounts: [], error: 'Saved profiles are invalid. Please sign up again.' }
    }
    const records: unknown[] = 'accounts' in parsed && Array.isArray(parsed.accounts) ? parsed.accounts : [parsed]
    const accounts: SavedAccount[] = []
    for (const record of records) {
      if (typeof record !== 'object' || record === null) {
        return { accounts: [], error: 'A saved profile is invalid. Please sign up again.' }
      }
      const wrapped = 'profile' in record
      const profile = wrapped ? record.profile : record
      const credential = wrapped && 'credential' in record ? record.credential : null
      if (!isProfile(profile) || (credential !== null && !isPasswordCredential(credential))) {
        return { accounts: [], error: 'A saved profile is invalid. Please sign up again.' }
      }
      accounts.push({ profile: { ...profile, phone: formatPhoneNumber(profile.phone) }, credential })
    }
    if (new Set(accounts.map(({ profile }) => normalizeEmail(profile.email))).size !== accounts.length) {
      return { accounts: [], error: 'Saved profiles contain duplicate email addresses.' }
    }
    return { accounts, error: '' }
  } catch {
    return { accounts: [], error: 'Saved profiles could not be loaded from this browser.' }
  }
}

function toHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const saltBytes = Uint8Array.from(salt.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16))
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: passwordHashIterations, hash: 'SHA-256' },
    key,
    256,
  )
  return toHex(new Uint8Array(bits))
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

type HackathonEvent = {
  id: string
  name: string
  description?: string
  date: string
  endDate?: string
  location: string
  createdByEmail?: string
  joinCode: string
  memberEmails: string[]
  maxTeamMembers: number
  maxTeamsPerPerson: number
  teams: Team[]
  rooms: Room[]
  mentors: Mentor[]
}

type TeamMember = { email: string; name: string; role?: string }
type TeamMessage = { id: string; senderEmail: string; senderName: string; text: string; sentAt: string }
type TeamDirectChat = { participantEmails: [string, string]; messages: TeamMessage[] }
type Team = {
  id: string
  name: string
  description?: string
  teamCode: string
  members: TeamMember[]
  invitedEmails?: string[]
  createdByEmail?: string
  generalMessages?: TeamMessage[]
  directChats?: TeamDirectChat[]
}
type Room = { id: string; name: string; teamIds: string[] }
type Mentor = { id: string; name: string; email: string; specialty: string }

function isTeam(value: unknown): value is Team {
  if (typeof value !== 'object' || value === null) return false
  const team = value as Record<string, unknown>
  return typeof team.id === 'string' &&
    typeof team.name === 'string' &&
    (!('description' in team) || typeof team.description === 'string') &&
    (!('teamCode' in team) || typeof team.teamCode === 'string') &&
    (!('invitedEmails' in team) || (Array.isArray(team.invitedEmails) &&
      team.invitedEmails.every((email: unknown) => typeof email === 'string'))) &&
    (!('createdByEmail' in team) || typeof team.createdByEmail === 'string') &&
    Array.isArray(team.members) &&
    team.members.every((member: unknown) =>
      typeof member === 'string' ||
      (typeof member === 'object' && member !== null &&
        'email' in member && typeof member.email === 'string' &&
        'name' in member && typeof member.name === 'string' &&
        (!('role' in member) || typeof member.role === 'string')))
}

function isRoom(value: unknown): value is Room {
  if (typeof value !== 'object' || value === null) return false
  const room = value as Record<string, unknown>
  return typeof room.id === 'string' &&
    typeof room.name === 'string' &&
    Array.isArray(room.teamIds) &&
    room.teamIds.every((teamId: unknown) => typeof teamId === 'string')
}

function isMentor(value: unknown): value is Mentor {
  if (typeof value !== 'object' || value === null) return false
  const mentor = value as Record<string, unknown>
  return typeof mentor.id === 'string' &&
    typeof mentor.name === 'string' &&
    typeof mentor.email === 'string' &&
    typeof mentor.specialty === 'string'
}

const storageKey = 'mule-hacks-events'
const joinCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const sections = [
  { slug: 'teams', label: 'Teams', description: 'Create and manage teams for this event.' },
  { slug: 'rooms', label: 'Rooms', description: 'Set up rooms and assign teams for this event.' },
  { slug: 'mentors', label: 'Mentors', description: 'Track mentor locations and assignments for this event.' },
]

function createJoinCode(): string {
  const values = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(values, (value) => joinCodeAlphabet[value % joinCodeAlphabet.length]).join('')
}

function isValidEventDate(date: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(date)
  if (!match) return false
  const parsed = new Date(0)
  parsed.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  parsed.setUTCHours(0, 0, 0, 0)
  return parsed.toISOString().slice(0, 10) === date.slice(0, 10) &&
    (match[4] === undefined || (Number(match[4]) < 24 && Number(match[5]) < 60))
}

function toDateTimeInputValue(value: string): string {
  return value.length === 10 ? `${value}T00:00` : value
}

function formatEventDateTime(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00` : value)
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: value.length > 10 ? 'short' : undefined,
  })
}

function formatEventDates(event: Pick<HackathonEvent, 'date' | 'endDate'>): string {
  if (!event.date) return ''
  return event.endDate && event.endDate !== event.date
    ? `${formatEventDateTime(event.date)} – ${formatEventDateTime(event.endDate)}`
    : formatEventDateTime(event.date)
}

function loadEvents(currentEmail: string): { events: HackathonEvent[]; error: string } {
  try {
    const savedEvents: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(savedEvents)) {
      return { events: [], error: 'Saved events could not be loaded because the stored data is invalid.' }
    }
    const validEvents = savedEvents.filter(
      (event): event is Record<string, unknown> & { id: string; name: string; date: string; location: string } =>
        typeof event?.id === 'string' &&
        typeof event?.name === 'string' &&
        typeof event?.date === 'string' &&
        typeof event?.location === 'string',
    )
    const usedCodes = new Set<string>()
    const usedTeamCodes = new Set<string>()
    let needsStorageUpdate = false
    const events = validEvents.map((event): HackathonEvent => {
      const storedCode = typeof event.joinCode === 'string' ? event.joinCode.toUpperCase() : ''
      let joinCode = storedCode
      if (!/^[A-Z2-9]{8}$/.test(joinCode) || usedCodes.has(joinCode)) {
        do {
          joinCode = createJoinCode()
        } while (usedCodes.has(joinCode))
      }
      usedCodes.add(joinCode)
      if (joinCode !== event.joinCode || !Array.isArray(event.memberEmails)) {
        needsStorageUpdate = true
      }
      const teams = Array.isArray(event.teams)
        ? event.teams.filter(isTeam).map((team) => {
          let teamCode = typeof team.teamCode === 'string' ? team.teamCode.toUpperCase() : ''
          if (!/^[A-Z2-9]{8}$/.test(teamCode) || usedTeamCodes.has(teamCode)) {
            do {
              teamCode = createJoinCode()
            } while (usedTeamCodes.has(teamCode))
          }
          usedTeamCodes.add(teamCode)
          const invitedEmails = Array.isArray(team.invitedEmails)
            ? [...new Set(team.invitedEmails.filter((email): email is string => typeof email === 'string').map(normalizeEmail))]
            : []
          if (teamCode !== team.teamCode || team.members.some((member) =>
            typeof member === 'string' || !member.role?.trim()) ||
            JSON.stringify(invitedEmails) !== JSON.stringify(team.invitedEmails ?? [])) {
            needsStorageUpdate = true
          }
          return {
            ...team,
            teamCode,
            invitedEmails,
            members: team.members.map((member) =>
              typeof member === 'string'
                ? { email: '', name: member, role: 'Member' }
                : {
                  ...member,
                  email: normalizeEmail(member.email),
                  role: member.role?.trim() || (
                    normalizeEmail(member.email) === normalizeEmail(team.createdByEmail ?? '') ? 'Creator' : 'Member'
                  ),
                }),
          }
        })
        : []
      const rooms = Array.isArray(event.rooms)
        ? event.rooms.filter(isRoom).map((room) => {
          const teamIds = room.teamIds.filter((teamId) => teams.some((team) => team.id === teamId)).slice(0, 1)
          if (JSON.stringify(teamIds) !== JSON.stringify(room.teamIds)) needsStorageUpdate = true
          return { ...room, teamIds }
        })
        : []
      const memberEmails = Array.isArray(event.memberEmails)
        ? event.memberEmails.filter((email): email is string => typeof email === 'string').map(normalizeEmail)
        : [normalizeEmail(currentEmail)]
      const createdByEmail = typeof event.createdByEmail === 'string'
        ? normalizeEmail(event.createdByEmail)
        : memberEmails[0]
      if (event.createdByEmail !== createdByEmail) needsStorageUpdate = true
      const maxTeamMembers = typeof event.maxTeamMembers === 'number' && Number.isInteger(event.maxTeamMembers) && event.maxTeamMembers >= 1
        ? Number(event.maxTeamMembers)
        : 5
      const maxTeamsPerPerson = typeof event.maxTeamsPerPerson === 'number' && Number.isInteger(event.maxTeamsPerPerson) && event.maxTeamsPerPerson >= 1
        ? Number(event.maxTeamsPerPerson)
        : 1
      if (event.maxTeamMembers !== maxTeamMembers || event.maxTeamsPerPerson !== maxTeamsPerPerson) {
        needsStorageUpdate = true
      }
      return {
        id: event.id,
        name: event.name,
        description: typeof event.description === 'string' ? event.description : '',
        date: event.date,
        endDate: typeof event.endDate === 'string' && isValidEventDate(event.endDate) &&
          isValidEventDate(event.date) && event.endDate >= event.date
          ? event.endDate
          : undefined,
        location: event.location,
        createdByEmail,
        joinCode,
        memberEmails,
        maxTeamMembers,
        maxTeamsPerPerson,
        teams,
        rooms,
        mentors: Array.isArray(event.mentors) ? event.mentors.filter(isMentor) : [],
      }
    })
    if (needsStorageUpdate) {
      localStorage.setItem(storageKey, JSON.stringify(events))
    }
    return {
      events,
      error: events.length === savedEvents.length ? '' : 'Some saved events could not be loaded because their data is invalid.',
    }
  } catch {
    return { events: [], error: 'Saved events could not be loaded from this browser.' }
  }
}

type EventDetails = Pick<HackathonEvent, 'name' | 'description' | 'date' | 'endDate' | 'location'>
type EventSettings = EventDetails & Pick<HackathonEvent, 'maxTeamMembers' | 'maxTeamsPerPerson'>

function countMemberTeams(event: HackathonEvent, email: string): number {
  const normalizedEmail = normalizeEmail(email)
  return event.teams.filter((team) =>
    normalizeEmail(team.createdByEmail ?? '') === normalizedEmail ||
    team.members.some((member) => normalizeEmail(member.email) === normalizedEmail)).length
}

function countPendingTeamInvites(event: HackathonEvent, email: string): number {
  const normalizedEmail = normalizeEmail(email)
  return event.teams.filter((team) => team.invitedEmails?.includes(normalizedEmail)).length
}

function EventSidebarItem({
  event,
  isCreator,
  onSave,
  children,
  selectedContent,
}: {
  event: HackathonEvent
  isCreator: boolean
  onSave: (eventId: string, settings: EventSettings) => boolean
  children: ReactNode
  selectedContent: ReactNode
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [name, setName] = useState(event.name)
  const [description, setDescription] = useState(event.description ?? '')
  const [date, setDate] = useState(toDateTimeInputValue(event.date))
  const [endDate, setEndDate] = useState(event.endDate ? toDateTimeInputValue(event.endDate) : '')
  const [location, setLocation] = useState(event.location)
  const [maxTeamMembers, setMaxTeamMembers] = useState(String(event.maxTeamMembers))
  const [maxTeamsPerPerson, setMaxTeamsPerPerson] = useState(String(event.maxTeamsPerPerson))
  const [formError, setFormError] = useState('')

  function save(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault()
    if ((date && !isValidEventDate(date)) || (endDate && !isValidEventDate(endDate))) {
      setFormError('Enter valid event dates.')
      return
    }
    if (endDate && !date) {
      setFormError('Choose a start date before setting an end date.')
      return
    }
    if (endDate && endDate < date) {
      setFormError('The end date must be on or after the start date.')
      return
    }
    const memberLimit = Number(maxTeamMembers)
    const teamsLimit = Number(maxTeamsPerPerson)
    if (!Number.isInteger(memberLimit) || memberLimit < 1 || !Number.isInteger(teamsLimit) || teamsLimit < 1) {
      setFormError('Team limits must be whole numbers greater than zero.')
      return
    }
    const largestTeam = Math.max(0, ...event.teams.map((team) => team.members.length + (team.invitedEmails?.length ?? 0)))
    const participantEmails = new Set([
      ...event.memberEmails,
      ...event.teams.flatMap((team) => [
        team.createdByEmail ?? '',
        ...team.members.map((member) => member.email),
        ...(team.invitedEmails ?? []),
      ]),
    ].filter(Boolean))
    const mostTeamsPerPerson = Math.max(0, ...Array.from(participantEmails, (email) =>
      countMemberTeams(event, email) + countPendingTeamInvites(event, email)))
    if (memberLimit < largestTeam) {
      setFormError(`The member limit cannot be lower than a team's current members and pending invites (${largestTeam}).`)
      return
    }
    if (teamsLimit < mostTeamsPerPerson) {
      setFormError(`The teams-per-person limit cannot be lower than current memberships and pending invites (${mostTeamsPerPerson}).`)
      return
    }
    const saved = onSave(event.id, {
      name: name.trim(),
      description: description.trim(),
      date,
      endDate: endDate || undefined,
      location: location.trim(),
      maxTeamMembers: memberLimit,
      maxTeamsPerPerson: teamsLimit,
    })
    if (saved) {
      setFormError('')
      setSettingsOpen(false)
    } else {
      setFormError('Event settings could not be saved. Check the storage error and try again.')
    }
  }

  return (
    <>
    <div className="event-nav-group">
      <div className="event-nav-row">
        {children}
        {isCreator && (
          <button
            className="event-edit-button"
            type="button"
            aria-label={`${settingsOpen ? 'Close' : 'Open'} ${event.name} settings`}
            aria-expanded={settingsOpen}
            title="Event settings"
            onClick={() => {
              setName(event.name)
              setDescription(event.description ?? '')
              setDate(toDateTimeInputValue(event.date))
              setEndDate(event.endDate ? toDateTimeInputValue(event.endDate) : '')
              setLocation(event.location)
              setMaxTeamMembers(String(event.maxTeamMembers))
              setMaxTeamsPerPerson(String(event.maxTeamsPerPerson))
              setFormError('')
              setSettingsOpen(true)
            }}
          >
            ⚙
          </button>
        )}
      </div>
      {settingsOpen && isCreator && (
        <div className="event-settings-backdrop" role="presentation" onMouseDown={(mouseEvent) => {
          if (mouseEvent.target === mouseEvent.currentTarget) setSettingsOpen(false)
        }}>
          <form className="event-settings-menu" role="dialog" aria-modal="true" aria-labelledby={`event-settings-title-${event.id}`} onSubmit={save}>
            <div className="event-settings-heading">
              <div>
                <p className="eyebrow">EVENT OPTIONS</p>
                <h2 id={`event-settings-title-${event.id}`}>Event settings</h2>
              </div>
              <button className="event-settings-close" type="button" aria-label="Close event settings" onClick={() => setSettingsOpen(false)}>×</button>
            </div>
            <label>
              Event name
              <input required value={name} onChange={(input) => setName(input.target.value)} />
            </label>
            <label>
              Description
              <textarea maxLength={1000} rows={3} value={description} onChange={(input) => setDescription(input.target.value)} placeholder="Describe this event" />
            </label>
            <div className="event-settings-date-row">
              <label>
                Start date and time
                <input type="datetime-local" value={date} onChange={(input) => setDate(input.target.value)} />
              </label>
              <label>
                End date and time
                <input type="datetime-local" min={date || undefined} value={endDate} onChange={(input) => setEndDate(input.target.value)} />
              </label>
            </div>
            <label>
              Location
              <input value={location} onChange={(input) => setLocation(input.target.value)} />
            </label>
            <div className="event-settings-limit-row">
              <label>
                Members per team
                <input type="number" min="1" step="1" value={maxTeamMembers} onChange={(input) => setMaxTeamMembers(input.target.value)} />
              </label>
              <label>
                Teams per person
                <input type="number" min="1" step="1" value={maxTeamsPerPerson} onChange={(input) => setMaxTeamsPerPerson(input.target.value)} />
              </label>
            </div>
            <p className="event-sidebar-hint">Limits count the team creator and pending invitations.</p>
            {formError && <p className="field-error" role="alert">{formError}</p>}
            <div className="event-settings-actions">
              <button className="button button-secondary" type="button" onClick={() => {
                setName(event.name)
                setDescription(event.description ?? '')
                setDate(toDateTimeInputValue(event.date))
                setEndDate(event.endDate ? toDateTimeInputValue(event.endDate) : '')
                setLocation(event.location)
                setMaxTeamMembers(String(event.maxTeamMembers))
                setMaxTeamsPerPerson(String(event.maxTeamsPerPerson))
                setFormError('')
                setSettingsOpen(false)
              }}>Cancel</button>
              <button className="button button-primary" type="submit">Save settings</button>
            </div>
          </form>
        </div>
      )}
    </div>
    {selectedContent}
    </>
  )
}

function Dashboard({
  events,
  onCreateEvent,
  onJoinEvent,
}: {
  events: HackathonEvent[]
  onCreateEvent: (event: EventDetails) => void
  onJoinEvent: (code: string) => boolean
}) {
  const [formOpen, setFormOpen] = useState(false)
  const [joinFormOpen, setJoinFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [formError, setFormError] = useState('')
  const [location, setLocation] = useState('')
  const [joinCode, setJoinCode] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if ((date && !isValidEventDate(date)) || (endDate && !isValidEventDate(endDate))) {
      setFormError('Enter valid event dates.')
      return
    }
    if (endDate && !date) {
      setFormError('Choose a start date before setting an end date.')
      return
    }
    if (endDate && endDate < date) {
      setFormError('The end date must be on or after the start date.')
      return
    }
    onCreateEvent({ name: name.trim(), description: description.trim(), date, endDate: endDate || undefined, location: location.trim() })
    setName('')
    setDescription('')
    setDate('')
    setEndDate('')
    setFormError('')
    setLocation('')
    setFormOpen(false)
  }

  function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (onJoinEvent(joinCode)) {
      setJoinCode('')
      setJoinFormOpen(false)
    }
  }

  return (
    <section className="dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">EVENT HOSTING</p>
          <h1>Dashboard</h1>
          <p className="page-description">Create and manage your hackathon events.</p>
        </div>
        <div className="dashboard-actions">
          <button className="button button-secondary" type="button" onClick={() => setJoinFormOpen(!joinFormOpen)}>
            {joinFormOpen ? 'Cancel' : 'Join with code'}
          </button>
          <button className="button button-primary" type="button" onClick={() => setFormOpen(!formOpen)}>
            {formOpen ? 'Cancel' : '+ Add event'}
          </button>
        </div>
      </div>

      {joinFormOpen && (
        <form className="event-form join-event-form" onSubmit={handleJoin}>
          <h2>Join an existing event</h2>
          <label>
            Event code
            <input
              autoFocus
              required
              minLength={8}
              maxLength={8}
              autoCapitalize="characters"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))}
              placeholder="Enter the 8-character code"
            />
          </label>
          <button className="button button-primary" type="submit">Join event</button>
        </form>
      )}

      {formOpen && (
        <form className="event-form" onSubmit={handleSubmit}>
          <h2>New event</h2>
          <label>
            Event name
            <input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Mule Hacks 2026" />
          </label>
          <label>
            Description
            <textarea maxLength={1000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this event about?" />
          </label>
          <div className="form-row event-date-range">
            <label>
              Start date
              <input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label>
              End date
              <input
                type="datetime-local"
                min={date || undefined}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          </div>
          <label>
            Location
            <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Engineering Building" />
          </label>
          <p className="form-hint">Leave the end date blank for a one-day event.</p>
          {formError && <p className="field-error" role="alert">{formError}</p>}
          <button className="button button-primary" type="submit">Create event</button>
        </form>
      )}

      <div className="section-heading">
        <div>
          <h2>Your events</h2>
          <p>{events.length ? `${events.length} event${events.length === 1 ? '' : 's'}` : 'Your events will appear here.'}</p>
        </div>
      </div>
      {events.length ? (
        <div className="event-grid">
          {events.map((event) => (
            <Link className="event-card" key={event.id} to={`/events/${event.id}`}>
              <span className="event-card-icon" aria-hidden="true">✦</span>
              <span className="event-card-content">
                <strong>{event.name}</strong>
                <span>{[formatEventDates(event), event.location].filter(Boolean).join(' · ') || 'Event workspace'}</span>
                {event.description && <span className="event-card-description">{event.description}</span>}
                <span>Join code: <code>{event.joinCode}</code></span>
              </span>
              <span className="event-card-arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-state-icon" aria-hidden="true">✦</span>
          <h3>No events yet</h3>
          <p>Create an event to start organizing its teams, rooms, and mentors.</p>
          {!formOpen && <button className="button button-secondary" onClick={() => setFormOpen(true)}>Create your first event</button>}
        </div>
      )}
    </section>
  )
}

function CalendarPage({ events }: { events: HackathonEvent[] }) {
  const [today] = useState(() => new Date())
  const [visibleMonth, setVisibleMonth] = useState(() => {
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })
  const year = visibleMonth.getFullYear()
  const month = visibleMonth.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
  const monthEvents = events.filter((event) => {
    if (!isValidEventDate(event.date)) return false
    const eventEndDate = event.endDate && isValidEventDate(event.endDate) && event.endDate >= event.date
      ? event.endDate
      : event.date
    const startDay = event.date.slice(0, 10)
    const endDay = eventEndDate.slice(0, 10)
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
    return startDay <= monthEnd && endDay >= monthStart
  })

  function changeMonth(offset: number) {
    setVisibleMonth(new Date(year, month + offset, 1))
  }

  return (
    <section className="calendar-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR SCHEDULE</p>
          <h1>Calendar</h1>
          <p className="page-description">Event dates at a glance.</p>
        </div>
        <div className="calendar-controls">
          <button className="button button-secondary" type="button" onClick={() => changeMonth(-1)} aria-label="Previous month">←</button>
          <button className="button button-secondary" type="button" onClick={() => {
            setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1))
          }}>Today</button>
          <button className="button button-secondary" type="button" onClick={() => changeMonth(1)} aria-label="Next month">→</button>
        </div>
      </div>
      <div className="calendar-card">
        <h2>{visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
        <div className="calendar-grid" role="grid" aria-label={visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div className="calendar-weekday" role="columnheader" key={day}>{day}</div>
          ))}
          {Array.from({ length: cellCount }, (_, index) => {
            const day = index - firstWeekday + 1
            const inMonth = day >= 1 && day <= daysInMonth
            const dateKey = inMonth
              ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              : ''
            const dayEvents = inMonth ? monthEvents.filter((event) =>
              event.date.slice(0, 10) <= dateKey && ((event.endDate ?? event.date).slice(0, 10)) >= dateKey) : []
            const isToday = inMonth && today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
            return (
              <div
                className={`calendar-day${inMonth ? '' : ' outside'}${isToday ? ' today' : ''}${dayEvents.length ? ' has-events' : ''}`}
                role="gridcell"
                key={`${year}-${month}-${index}`}
                aria-label={inMonth
                  ? `${visibleMonth.toLocaleDateString(undefined, { month: 'long' })} ${day}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ''}`
                  : undefined}
              >
                {inMonth && <span className="calendar-day-number">{day}</span>}
                {dayEvents.slice(0, 2).map((event) => (
                  <Link className="calendar-event" key={event.id} to={`/events/${event.id}`} title={event.name}>
                    {event.name}
                  </Link>
                ))}
                {dayEvents.length > 2 && <span className="calendar-more">+{dayEvents.length - 2} more</span>}
              </div>
            )
          })}
        </div>
        <div className="calendar-month-summary">
          {monthEvents.length
            ? `${monthEvents.length} event${monthEvents.length === 1 ? '' : 's'} this month`
            : 'No event dates this month'}
        </div>
      </div>
    </section>
  )
}

function EventPage({
  event,
  profiles,
  currentEmail,
  usedTeamCodes,
  onUpdate,
  isEventCreator,
}: {
  event: HackathonEvent
  profiles: Profile[]
  currentEmail: string
  usedTeamCodes: string[]
  onUpdate: (update: (current: HackathonEvent) => HackathonEvent) => boolean
  isEventCreator: boolean
}) {
  const { section } = useParams()
  const activeSection = sections.find((item) => item.slug === section)

  return (
    <section>
      <div className="breadcrumbs"><Link to="/">Dashboard</Link><span>/</span><span>{event.name}</span></div>
      <div className="page-heading">
        <div>
          <p className="eyebrow">EVENT WORKSPACE</p>
          <h1>{activeSection?.label ?? event.name}</h1>
          <p className="page-description">
            {activeSection?.description ?? (event.description || [formatEventDates(event), event.location].filter(Boolean).join(' · ') || 'Manage this event and its resources.')}
          </p>
        </div>
        <div className="event-join-code" aria-label={`Event join code ${event.joinCode}`}>
          <span>Share this code to invite people to the event</span>
          <code>{event.joinCode}</code>
          <span>{event.memberEmails.length} member{event.memberEmails.length === 1 ? '' : 's'}</span>
        </div>
      </div>
      {activeSection ? (
        <EventResources event={event} profiles={profiles} currentEmail={currentEmail} usedTeamCodes={usedTeamCodes} section={activeSection.slug} onUpdate={onUpdate} isEventCreator={isEventCreator} />
      ) : (
        <div className="section-heading">
          <div>
            <h2>Event resources</h2>
            <p>Choose an area to organize for this event.</p>
          </div>
        </div>
      )}
      {!activeSection && (
        <div className="resource-grid">
          {sections.map((item) => (
            <Link className="resource-card" key={item.slug} to={`/events/${event.id}/${item.slug}`}>
              <span className="resource-icon" aria-hidden="true">{item.slug === 'teams' ? '◈' : item.slug === 'rooms' ? '⌂' : '◎'}</span>
              <strong>{item.label}</strong>
              <span>{item.description}</span>
              <span className="resource-card-link">Manage {item.label.toLowerCase()} <span aria-hidden="true">→</span></span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

function EventResources({
  event,
  profiles,
  currentEmail,
  usedTeamCodes,
  section,
  onUpdate,
  isEventCreator,
}: {
  event: HackathonEvent
  profiles: Profile[]
  currentEmail: string
  usedTeamCodes: string[]
  section: string
  onUpdate: (update: (current: HackathonEvent) => HackathonEvent) => boolean
  isEventCreator: boolean
}) {
  const [name, setName] = useState('')
  const [teamLimitError, setTeamLimitError] = useState('')
  const [assignedTeamCreatorEmail, setAssignedTeamCreatorEmail] = useState('')
  const [email, setEmail] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [managedTeamId, setManagedTeamId] = useState<string | null>(null)
  const [addTeamOpen, setAddTeamOpen] = useState(false)
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [teamNameDraft, setTeamNameDraft] = useState('')
  const [teamDescriptionDraft, setTeamDescriptionDraft] = useState('')
  const [inviteTeamId, setInviteTeamId] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [teamManagementFeedback, setTeamManagementFeedback] = useState('')
  const normalizedCurrentEmail = normalizeEmail(currentEmail)
  const claimableTeams = event.teams.filter((team) =>
    normalizeEmail(team.createdByEmail ?? '') === normalizedCurrentEmail ||
    team.members.some((member) => member.email && normalizeEmail(member.email) === normalizedCurrentEmail))
  const eligibleTeamCreators = profiles.filter((candidate) => {
    const candidateEmail = normalizeEmail(candidate.email)
    return candidateEmail !== normalizedCurrentEmail &&
      event.memberEmails.includes(candidateEmail) &&
      countMemberTeams(event, candidateEmail) + countPendingTeamInvites(event, candidateEmail) < event.maxTeamsPerPerson
  })

  function addTeam(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault()
    const teamName = name.trim()
    if (!teamName) return
    const creatorEmail = isEventCreator
      ? normalizeEmail(assignedTeamCreatorEmail)
      : normalizedCurrentEmail
    const creatorProfile = isEventCreator
      ? eligibleTeamCreators.find((candidate) => normalizeEmail(candidate.email) === creatorEmail)
      : profiles.find((candidate) => normalizeEmail(candidate.email) === creatorEmail)
    if (!creatorEmail || (isEventCreator && !creatorProfile)) {
      setTeamLimitError('Select an eligible event member to be the team creator.')
      return
    }
    if (countMemberTeams(event, creatorEmail) + countPendingTeamInvites(event, creatorEmail) >= event.maxTeamsPerPerson) {
      setTeamLimitError(`${creatorProfile?.name ?? creatorEmail} has reached the limit of ${event.maxTeamsPerPerson} team${event.maxTeamsPerPerson === 1 ? '' : 's'} per person for this event.`)
      return
    }
    const existingTeamCodes = new Set(usedTeamCodes)
    let teamCode: string
    do {
      teamCode = createJoinCode()
    } while (existingTeamCodes.has(teamCode))
    const saved = onUpdate((current) => ({
      ...current,
      teams: [...current.teams, {
        id: crypto.randomUUID(),
        name: teamName,
        teamCode,
        members: [{ email: creatorEmail, name: creatorProfile?.name ?? creatorEmail, role: 'Creator' }],
        createdByEmail: creatorEmail,
      }],
    }))
    if (!saved) {
      setTeamLimitError('Team could not be created. Please check storage and try again.')
      setTeamManagementFeedback('Team could not be created. Please try again.')
      return
    }
    setName('')
    setTeamLimitError('')
    setAssignedTeamCreatorEmail('')
    setAddTeamOpen(false)
    setTeamManagementFeedback('Team added.')
  }

  function removeMember(teamId: string, memberEmail: string) {
    const team = event.teams.find((candidate) => candidate.id === teamId)
    const isTeamCreator = team && normalizeEmail(team.createdByEmail ?? '') === normalizedCurrentEmail
    if (!team || (!isEventCreator && !isTeamCreator)) return
    onUpdate((current) => ({
      ...current,
      teams: current.teams.map((team) => team.id === teamId
        ? { ...team, members: team.members.filter((member) => normalizeEmail(member.email) !== normalizeEmail(memberEmail)) }
        : team),
    }))
  }

  function saveTeamDetails(eventForm: FormEvent<HTMLFormElement>, teamId: string) {
    eventForm.preventDefault()
    const teamName = teamNameDraft.trim()
    if (!teamName) {
      setTeamManagementFeedback('Enter a team name.')
      return
    }
    const saved = onUpdate((current) => ({
      ...current,
      teams: current.teams.map((team) => team.id === teamId
        ? { ...team, name: teamName, description: teamDescriptionDraft.trim() }
        : team),
    }))
    setTeamManagementFeedback(saved ? 'Team details saved.' : 'Team details could not be saved. Please try again.')
    if (saved) setEditingTeamId(null)
  }

  function deleteTeam(teamId: string) {
    if (!isEventCreator) return
    const saved = onUpdate((current) => ({
      ...current,
      teams: current.teams.filter((team) => team.id !== teamId),
      rooms: current.rooms.map((room) => ({
        ...room,
        teamIds: room.teamIds.filter((claimedTeamId) => claimedTeamId !== teamId),
      })),
    }))
    setTeamManagementFeedback(saved ? 'Team removed.' : 'Team could not be removed. Please try again.')
  }

  function inviteToTeam(eventForm: FormEvent<HTMLFormElement>, teamId: string) {
    eventForm.preventDefault()
    const normalizedInviteEmail = normalizeEmail(inviteEmail)
    const team = event.teams.find((candidate) => candidate.id === teamId)
    if (!isEventCreator || !team) return
    const invitedProfile = profiles.find((candidate) =>
      normalizeEmail(candidate.email) === normalizedInviteEmail)
    if (!invitedProfile) {
      setTeamManagementFeedback('No profile was found with that email address.')
      return
    }
    if (team.members.some((member) => normalizeEmail(member.email) === normalizedInviteEmail)) {
      setTeamManagementFeedback('This profile is already a member of this team.')
      return
    }
    if (team.invitedEmails?.includes(normalizedInviteEmail)) {
      setTeamManagementFeedback('This profile already has a pending invitation to this team.')
      return
    }
    if (event.teams.some((otherTeam) =>
      otherTeam.id !== teamId && (
        otherTeam.members.some((member) => normalizeEmail(member.email) === normalizedInviteEmail) ||
        otherTeam.invitedEmails?.includes(normalizedInviteEmail)))) {
      setTeamManagementFeedback('This profile is already in or invited to another team in this event.')
      return
    }
    if (countMemberTeams(event, normalizedInviteEmail) + countPendingTeamInvites(event, normalizedInviteEmail) >= event.maxTeamsPerPerson) {
      setTeamManagementFeedback(`This profile has reached the limit of ${event.maxTeamsPerPerson} team${event.maxTeamsPerPerson === 1 ? '' : 's'} per person for this event.`)
      return
    }
    if (team.members.length + (team.invitedEmails?.length ?? 0) >= event.maxTeamMembers) {
      setTeamManagementFeedback(`This team has reached its limit of ${event.maxTeamMembers} members, including pending invitations.`)
      return
    }
    const saved = onUpdate((current) => ({
      ...current,
      teams: current.teams.map((currentTeam) => currentTeam.id === teamId
        ? { ...currentTeam, invitedEmails: [...(currentTeam.invitedEmails ?? []), normalizedInviteEmail] }
        : currentTeam),
    }))
    if (!saved) {
      setTeamManagementFeedback('The invitation could not be saved. Please try again.')
      return
    }
    setInviteEmail('')
    setTeamManagementFeedback(`Invitation sent to ${invitedProfile.email}.`)
  }

  function cancelTeamInvite(teamId: string, invite: string) {
    if (!isEventCreator) return
    const normalizedInviteEmail = normalizeEmail(invite)
    const saved = onUpdate((current) => ({
      ...current,
      teams: current.teams.map((team) => team.id === teamId
        ? { ...team, invitedEmails: (team.invitedEmails ?? []).filter((email) => email !== normalizedInviteEmail) }
        : team),
    }))
    setTeamManagementFeedback(saved ? 'Invitation canceled.' : 'Invitation could not be canceled. Please try again.')
  }

  function addRoom(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault()
    const roomName = name.trim()
    if (!roomName || !isEventCreator) return
    onUpdate((current) => ({
      ...current,
      rooms: [...current.rooms, { id: crypto.randomUUID(), name: roomName, teamIds: [] }],
    }))
    setName('')
  }

  function removeRoom(roomId: string) {
    if (!isEventCreator) return
    onUpdate((current) => ({
      ...current,
      rooms: current.rooms.filter((room) => room.id !== roomId),
    }))
  }

  function updateRoomClaim(roomId: string, teamId: string, claim: boolean) {
    if (!claimableTeams.some((team) => team.id === teamId)) return
    onUpdate((current) => ({
      ...current,
      rooms: current.rooms.map((room) => {
        if (room.id !== roomId) return room
        if (claim) {
          return room.teamIds.length === 0 || room.teamIds.includes(teamId)
            ? { ...room, teamIds: [teamId] }
            : room
        }
        return { ...room, teamIds: room.teamIds.filter((claimedTeamId) => claimedTeamId !== teamId) }
      }),
    }))
  }

  function addMentor(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault()
    const mentorName = name.trim()
    if (!mentorName) return
    onUpdate((current) => ({
      ...current,
      mentors: [...current.mentors, { id: crypto.randomUUID(), name: mentorName, email: email.trim(), specialty: specialty.trim() }],
    }))
    setName('')
    setEmail('')
    setSpecialty('')
  }

  if (section === 'teams') {
    return (
      <div className="management-page">
        {isEventCreator ? (
          <div className="team-management-toolbar">
            <div>
              <h2>Teams</h2>
              <p className="form-hint">Manage a team using the button on its card, or add a new team.</p>
            </div>
            <button className="button button-primary" type="button" aria-expanded={addTeamOpen} onClick={() => setAddTeamOpen(!addTeamOpen)}>
              {addTeamOpen ? 'Close form' : 'Add team'}
            </button>
          </div>
        ) : (
          <form className="event-form inline-form" onSubmit={addTeam}>
            <h2>Add a team</h2>
            <p className="form-hint">Each team can have up to {event.maxTeamMembers} members; each person can belong to up to {event.maxTeamsPerPerson} team{event.maxTeamsPerPerson === 1 ? '' : 's'} in this event.</p>
            <label>Team name<input required value={name} onChange={(input) => setName(input.target.value)} placeholder="e.g. Team Comet" /></label>
            {teamLimitError && <p className="field-error" role="alert">{teamLimitError}</p>}
            <button className="button button-primary" type="submit">Add team</button>
          </form>
        )}
        {isEventCreator && addTeamOpen && (
          <div className="team-management-panel">
            <form className="event-form inline-form" onSubmit={addTeam}>
              <h3>Add a team</h3>
                <p className="form-hint">Assign another event member as the team creator. You will not be added to this team.</p>
                <p className="form-hint">Each team can have up to {event.maxTeamMembers} members; each person can belong to up to {event.maxTeamsPerPerson} team{event.maxTeamsPerPerson === 1 ? '' : 's'} in this event.</p>
                <label>Team name<input required value={name} onChange={(input) => setName(input.target.value)} placeholder="e.g. Team Comet" /></label>
                <label>Team creator
                  <select required value={assignedTeamCreatorEmail} onChange={(input) => setAssignedTeamCreatorEmail(input.target.value)} disabled={!eligibleTeamCreators.length}>
                    <option value="">Select an event member</option>
                    {eligibleTeamCreators.map((candidate) => (
                      <option key={candidate.email} value={normalizeEmail(candidate.email)}>{candidate.name} ({candidate.email})</option>
                    ))}
                  </select>
                </label>
                {!eligibleTeamCreators.length && <p className="form-hint">No other event members are currently eligible to create a team. Invite someone to the event or adjust the team limit.</p>}
                {teamLimitError && <p className="field-error" role="alert">{teamLimitError}</p>}
                <div className="management-actions">
                  <button className="button button-primary" type="submit" disabled={!eligibleTeamCreators.length}>Add team</button>
                <button className="button button-secondary" type="button" onClick={() => setAddTeamOpen(false)}>Cancel</button>
              </div>
            </form>
            {teamManagementFeedback && <p className="form-hint" role="status">{teamManagementFeedback}</p>}
          </div>
        )}
        <div className="section-heading"><div><h2>Teams</h2><p>{event.teams.length} team{event.teams.length === 1 ? '' : 's'}</p></div></div>
        {event.teams.length ? (
          <div className="management-grid">
            {event.teams.map((team) => (
              <article className="management-card" key={team.id}>
                {isEventCreator && (
                  <div className="team-card-management-toggle">
                    <button
                      className="button button-secondary"
                      type="button"
                      aria-expanded={managedTeamId === team.id}
                      onClick={() => {
                        setManagedTeamId(managedTeamId === team.id ? null : team.id)
                        setEditingTeamId(null)
                        setInviteTeamId(null)
                        setTeamManagementFeedback('')
                      }}
                    >
                      {managedTeamId === team.id ? 'Done' : 'Manage team'}
                    </button>
                  </div>
                )}
                <div className="management-card-heading"><span className="resource-icon" aria-hidden="true">◈</span><div><h3>{team.name}</h3><p>{team.members.length} member{team.members.length === 1 ? '' : 's'}</p></div></div>
                {team.description && <p className="team-description">{team.description}</p>}
                {isEventCreator && managedTeamId === team.id && (
                  <div className="team-management-controls">
                    {editingTeamId === team.id ? (
                      <form className="event-form team-edit-form" onSubmit={(eventForm) => saveTeamDetails(eventForm, team.id)}>
                        <label>Team name<input required value={teamNameDraft} onChange={(input) => setTeamNameDraft(input.target.value)} /></label>
                        <label>Team description<textarea maxLength={500} rows={3} value={teamDescriptionDraft} onChange={(input) => setTeamDescriptionDraft(input.target.value)} /></label>
                        <div className="management-actions">
                          <button className="button button-primary" type="submit">Save changes</button>
                          <button className="button button-secondary" type="button" onClick={() => setEditingTeamId(null)}>Cancel</button>
                        </div>
                      </form>
                    ) : (
                      <div className="management-actions">
                        <button className="button button-secondary" type="button" onClick={() => {
                          setTeamNameDraft(team.name)
                          setTeamDescriptionDraft(team.description ?? '')
                          setEditingTeamId(team.id)
                          setTeamManagementFeedback('')
                        }}>Edit team</button>
                        <button className="member-remove" type="button" onClick={() => deleteTeam(team.id)}>Remove team</button>
                      </div>
                    )}
                    {inviteTeamId === team.id ? (
                      <form className="team-manage-invite" onSubmit={(eventForm) => inviteToTeam(eventForm, team.id)}>
                        <label>Invite by profile email
                          <div className="input-action">
                            <input aria-label={`Email to invite to ${team.name}`} autoComplete="email" type="email" required value={inviteEmail} onChange={(input) => setInviteEmail(input.target.value)} placeholder="person@example.com" />
                            <button className="button button-primary" type="submit">Invite</button>
                          </div>
                        </label>
                        <button className="text-button" type="button" onClick={() => { setInviteTeamId(null); setInviteEmail('') }}>Cancel</button>
                      </form>
                    ) : (
                      <button className="button button-secondary" type="button" onClick={() => {
                        setInviteTeamId(team.id)
                        setInviteEmail('')
                        setTeamManagementFeedback('')
                      }}>Invite person</button>
                    )}
                    {(team.invitedEmails?.length ?? 0) > 0 && (
                      <div className="team-pending-invites">
                        <h3>Pending invitations</h3>
                        <ul className="member-list">{team.invitedEmails?.map((invitedEmail) => (
                          <li key={invitedEmail}>
                            <span>{profiles.find((candidate) => normalizeEmail(candidate.email) === invitedEmail)?.name ?? invitedEmail}<small>{invitedEmail}</small></span>
                            <button className="member-remove" type="button" onClick={() => cancelTeamInvite(team.id, invitedEmail)}>Cancel</button>
                          </li>
                        ))}</ul>
                      </div>
                    )}
                  </div>
                )}
                {team.members.length > 0 && (
                  <ul className="member-list">{team.members.map((member, index) => {
                    const currentProfile = profiles.find((savedProfile) =>
                      member.email && normalizeEmail(savedProfile.email) === normalizeEmail(member.email))
                    return (
                      <li key={`${team.id}-${member.email || index}`}>
                        <span>
                          {currentProfile?.name ?? member.name}
                          <span className="team-role-badge">{member.role || 'Member'}</span>
                        </span>
                        {((isEventCreator && managedTeamId === team.id) || (team.createdByEmail &&
                          normalizeEmail(team.createdByEmail) === normalizedCurrentEmail)) &&
                          member.email &&
                          (isEventCreator || normalizeEmail(member.email) !== normalizedCurrentEmail) && (
                          <button
                            className="member-remove"
                            type="button"
                            aria-label={`Remove ${currentProfile?.name ?? member.name} from ${team.name}`}
                            onClick={() => removeMember(team.id, member.email)}
                          >
                            Remove
                          </button>
                        )}
                      </li>
                    )
                  })}</ul>
                )}
              </article>
            ))}
          </div>
        ) : <div className="empty-state compact-empty"><h3>No teams yet</h3><p>{isEventCreator ? 'Use Add team above to create a team.' : 'Add a team above, then open its workspace to share the team code.'}</p></div>}
      </div>
    )
  }

  if (section === 'rooms') {
    return (
      <div className="management-page">
        {isEventCreator ? (
          <form className="event-form inline-form" onSubmit={addRoom}>
            <h2>List a room or workspace</h2>
            <p className="form-hint">Teams can claim available spaces here. Each space can be claimed by one team.</p>
            <label>Room or workspace name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Room 101 or Design Lab" /></label>
            <button className="button button-primary" type="submit">Add space</button>
          </form>
        ) : <p className="form-hint">Claim an available space for one of your teams.</p>}
        <div className="section-heading"><div><h2>Rooms</h2><p>{event.rooms.length} room{event.rooms.length === 1 ? '' : 's'}</p></div></div>
        {event.rooms.length ? (
          <div className="management-grid">
            {event.rooms.map((room) => {
              const claimedTeamId = room.teamIds[0]
              const claimedTeam = event.teams.find((team) => team.id === claimedTeamId)
              const userCanManageClaim = claimableTeams.some((team) => team.id === claimedTeamId)
              return (
                <article className="management-card" key={room.id}>
                  <div className="management-card-heading"><span className="resource-icon" aria-hidden="true">⌂</span><div><h3>{room.name}</h3><p>{claimedTeam ? `Claimed by ${claimedTeam.name}` : 'Available to claim'}</p></div></div>
                  {!claimedTeamId && claimableTeams.length > 0 && (
                    <div className="room-claim-actions">
                      {claimableTeams.map((team) => (
                        <button className="button button-primary" key={team.id} type="button" onClick={() => updateRoomClaim(room.id, team.id, true)}>Claim for {team.name}</button>
                      ))}
                    </div>
                  )}
                  {claimedTeamId && userCanManageClaim && (
                    <button className="button button-secondary" type="button" onClick={() => updateRoomClaim(room.id, claimedTeamId, false)}>Release space</button>
                  )}
                  {isEventCreator && <button className="member-remove" type="button" onClick={() => removeRoom(room.id)}>Remove space</button>}
                </article>
              )
            })}
          </div>
        ) : <div className="empty-state compact-empty"><h3>No rooms yet</h3><p>{isEventCreator ? 'Add spaces for teams to claim.' : 'The event creator has not listed any spaces yet.'}</p></div>}
        {event.rooms.length > 0 && claimableTeams.length === 0 && !isEventCreator && <p className="form-hint">Join a team in this event to claim a space for it.</p>}
      </div>
    )
  }

  return (
    <div className="management-page">
      <form className="event-form inline-form" onSubmit={addMentor}>
        <h2>Add a mentor</h2>
        <div className="form-row">
          <label>Name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Mentor name" /></label>
          <label>Email (optional)<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="mentor@example.com" /></label>
        </div>
        <label>Expertise (optional)<input value={specialty} onChange={(event) => setSpecialty(event.target.value)} placeholder="e.g. Product design" /></label>
        <button className="button button-primary" type="submit">Add mentor</button>
      </form>
      <div className="section-heading"><div><h2>Mentors</h2><p>{event.mentors.length} mentor{event.mentors.length === 1 ? '' : 's'}</p></div></div>
      {event.mentors.length ? (
        <div className="management-grid">
          {event.mentors.map((mentor) => (
            <article className="management-card mentor-card" key={mentor.id}>
              <span className="resource-icon" aria-hidden="true">◎</span>
              <h3>{mentor.name}</h3>
              {mentor.email && <p>{mentor.email}</p>}
              {mentor.specialty && <span className="mentor-specialty">{mentor.specialty}</span>}
            </article>
          ))}
        </div>
      ) : <div className="empty-state compact-empty"><h3>No mentors yet</h3><p>Add mentors for this event using the form above.</p></div>}
    </div>
  )
}

function NotificationBell({
  pendingInvites,
  onRespondToInvite,
}: {
  pendingInvites: { event: HackathonEvent; team: Team }[]
  onRespondToInvite: (eventId: string, teamId: string, accept: boolean) => boolean
}) {
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="profile-notifications">
      <button
        className="notification-bell"
        type="button"
        aria-label={`Notifications${pendingInvites.length ? `, ${pendingInvites.length} pending team invitation${pendingInvites.length === 1 ? '' : 's'}` : ''}`}
        aria-expanded={notificationsOpen}
        aria-controls="profile-notifications-panel"
        onClick={() => setNotificationsOpen(!notificationsOpen)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {pendingInvites.length > 0 && <span className="notification-count">{pendingInvites.length}</span>}
      </button>
      {notificationsOpen && (
        <div className="profile-notifications-panel" id="profile-notifications-panel">
          <h2>Notifications</h2>
          {pendingInvites.length ? (
            <div className="notification-list">
              {pendingInvites.map(({ event, team }) => (
                <article className="profile-notification" key={`${event.id}-${team.id}`}>
                  <p><strong>{team.name}</strong> invited you to join their team in {event.name}.</p>
                  <div className="notification-actions">
                    <button className="notification-accept" type="button" onClick={() => {
                      if (onRespondToInvite(event.id, team.id, true)) {
                        setNotificationsOpen(false)
                        navigate(`/my-teams/${event.id}/${team.id}`)
                      }
                    }}>Accept</button>
                    <button className="notification-decline" type="button" onClick={() => onRespondToInvite(event.id, team.id, false)}>Decline</button>
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="notifications-empty">You’re all caught up.</p>}
        </div>
      )}
    </div>
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
      <p className="eyebrow">YOUR ACCOUNT</p>
      <h1>Profile</h1>
      <p className="page-description">Manage your personal details and contact information.</p>
      <form className="profile-form" onSubmit={handleSubmit}>
        <label>
          Full name
          <input
            required
            autoComplete="name"
            value={formProfile.name}
            onChange={(event) => {
              setFormProfile({ ...formProfile, name: event.target.value })
              setSaved(false)
            }}
          />
        </label>
        <label>
          Birthdate
          <input
            required
            type="date"
            autoComplete="bday"
            max={getTodayDate()}
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
            required
            type="email"
            autoComplete="email"
            value={formProfile.email}
            onChange={(event) => {
              setFormProfile({ ...formProfile, email: event.target.value })
              setSaved(false)
            }}
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
        {error && <p className="profile-error" role="alert">{error}</p>}
        {saved && !error && <p className="profile-success" role="status">Profile saved.</p>}
        <button className="button button-primary" type="submit">Save changes</button>
      </form>
    </section>
  )
}

function AuthScreen({
  accounts,
  initialError,
  onAuthenticated,
}: {
  accounts: SavedAccount[]
  initialError: string
  onAuthenticated: (profile: Profile, credential: PasswordCredential, isSignUp: boolean) => boolean
}) {
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState(initialError)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const email = normalizeEmail(String(formData.get('email')))
    const password = String(formData.get('password'))
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
        const profile: Profile = {
          name: String(formData.get('name')).trim(),
          birthdate: String(formData.get('birthdate')),
          email,
          phone: String(formData.get('phone')),
        }
        if (!onAuthenticated(profile, await createPasswordCredential(password), true)) {
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
        setError('Your account could not be loaded. Please try again.')
      }
    } catch {
      setError('Authentication could not be completed. Make sure browser cryptography is available and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function switchMode(signUp: boolean) {
    setIsSignUp(signUp)
    setError('')
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <Link className="auth-brand" to="/" aria-label="Mule Hacks home">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span>Eventov </span>
        </Link>
        <div className="auth-intro">
          <p className="eyebrow">{isSignUp ? 'JOIN YOUR EVENT TEAM' : 'WELCOME BACK'}</p>
          <h1 id="auth-title">{isSignUp ? 'Create your account' : 'Sign in to your account'}</h1>
          <p className="auth-subtitle">
            {isSignUp ? 'Get started managing your Mule Hacks event.' : 'Manage your Mule Hacks event, all in one place.'}
          </p>
        </div>
        <div className="auth-tabs" role="tablist" aria-label="Account options">
          <button type="button" role="tab" aria-selected={!isSignUp} className={!isSignUp ? 'selected' : ''} onClick={() => switchMode(false)}>Sign in</button>
          <button type="button" role="tab" aria-selected={isSignUp} className={isSignUp ? 'selected' : ''} onClick={() => switchMode(true)}>Sign up</button>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignUp && (
            <>
              <label>Full name<input name="name" autoComplete="name" placeholder="Your name" required /></label>
              <label>Date of birth<input name="birthdate" type="date" autoComplete="bday" max={getTodayDate()} required /></label>
            </>
          )}
          <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
          {isSignUp && (
            <label>
              Phone number
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="numeric"
                placeholder="xxx-xxx-xxxx"
                pattern="[0-9]{3}-[0-9]{3}-[0-9]{4}"
                title="Enter a 10-digit phone number in xxx-xxx-xxxx format."
                onChange={(event) => {
                  event.currentTarget.value = formatPhoneNumber(event.currentTarget.value)
                }}
                required
              />
            </label>
          )}
          <label>Password<input name="password" type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} placeholder="At least 8 characters" minLength={8} required /></label>
          {isSignUp && (
            <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" placeholder="Enter your password again" minLength={8} required /></label>
          )}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="button button-primary auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <p className="auth-switch">
          {isSignUp ? 'Already have an account?' : 'New to Eventov?'}{' '}
          <button type="button" onClick={() => switchMode(!isSignUp)}>{isSignUp ? 'Sign in' : 'Create an account'}</button>
        </p>
        <p className="demo-notice">Demo mode · Accounts are saved in this browser only</p>
      </section>
    </main>
  )
}

function MyTeamsPage({
  events,
  email,
  onJoinTeam,
  onRespondToInvite,
}: {
  events: HackathonEvent[]
  email: string
  onJoinTeam: (code: string) => { eventId: string; teamId: string } | string
  onRespondToInvite: (eventId: string, teamId: string, accept: boolean) => boolean
}) {
  const navigate = useNavigate()
  const [teamCode, setTeamCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const normalizedEmail = normalizeEmail(email)
  const teams = events.flatMap((event) =>
    event.teams
      .filter((team) =>
        normalizeEmail(team.createdByEmail ?? '') === normalizedEmail ||
        team.members.some((member) => member.email && normalizeEmail(member.email) === normalizedEmail))
      .map((team) => ({
        team,
        event,
        createdByUser: normalizeEmail(team.createdByEmail ?? '') === normalizedEmail,
      })))
  const createdTeams = teams.filter((item) => item.createdByUser)
  const joinedTeams = teams.filter((item) => !item.createdByUser)
  const pendingInvites = events.flatMap((event) =>
    event.teams
      .filter((team) => team.invitedEmails?.includes(normalizedEmail))
      .map((team) => ({ team, event })))

  function joinTeam(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault()
    const result = onJoinTeam(teamCode)
    if (typeof result === 'string') {
      setJoinError(result)
      return
    }
    setJoinError('')
    setTeamCode('')
    navigate(`/my-teams/${result.eventId}/${result.teamId}`)
  }

  function renderTeams(items: typeof teams) {
    if (!items.length) {
      return <p className="teams-empty">No teams here yet.</p>
    }
    return (
      <div className="my-teams-list">
        {items.map(({ team, event }) => (
          <Link className="my-team-card" key={`${event.id}-${team.id}`} to={`/my-teams/${event.id}/${team.id}`}>
            <span className="my-team-icon" aria-hidden="true">◈</span>
            <span className="my-team-details">
              <strong>{team.name}</strong>
              {team.description && <span className="my-team-description">{team.description}</span>}
              <span>{event.name} · {team.members.length} member{team.members.length === 1 ? '' : 's'}</span>
            </span>
            <span className="my-team-arrow" aria-hidden="true">→</span>
          </Link>
        ))}
      </div>
    )
  }

  return (
    <section className="my-teams-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>My teams</h1>
          <p className="page-description">Teams you created and teams you are a member of.</p>
        </div>
      </div>
      <form className="event-form join-team-form" onSubmit={joinTeam}>
        <h2>Join a team</h2>
        <p>Enter the static team code shared by the team creator.</p>
        <div className="input-action">
          <input
            aria-label="Team code"
            autoComplete="off"
            inputMode="text"
            maxLength={8}
            minLength={8}
            onChange={(event) => setTeamCode(event.target.value.toUpperCase())}
            pattern="[A-Z2-9]{8}"
            placeholder="Enter team code"
            required
            title="Enter the 8-character team code."
            value={teamCode}
          />
          <button className="button button-primary" type="submit">Join team</button>
        </div>
        {joinError && <p className="field-error" role="alert">{joinError}</p>}
      </form>
      <section className="my-teams-section">
        <div className="section-heading">
          <div>
            <h2>Team invitations</h2>
            <p>{pendingInvites.length} pending invitation{pendingInvites.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        {pendingInvites.length ? (
          <div className="team-invitation-list">
            {pendingInvites.map(({ team, event }) => (
              <article className="team-invitation" key={`${event.id}-${team.id}`}>
                <div>
                  <strong>{team.name}</strong>
                  <span>{event.name}</span>
                  {team.description && <p>{team.description}</p>}
                </div>
                <div className="team-invitation-actions">
                  <button className="button button-primary" type="button" onClick={() => {
                    if (onRespondToInvite(event.id, team.id, true)) {
                      navigate(`/my-teams/${event.id}/${team.id}`)
                    }
                  }}>Accept</button>
                  <button className="button button-secondary" type="button" onClick={() => onRespondToInvite(event.id, team.id, false)}>Decline</button>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="teams-empty">No pending team invitations.</p>}
      </section>
      <section className="my-teams-section">
        <div className="section-heading">
          <div>
            <h2>Teams I created</h2>
            <p>{createdTeams.length} team{createdTeams.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        {renderTeams(createdTeams)}
      </section>
      <section className="my-teams-section">
        <div className="section-heading">
          <div>
            <h2>Teams I’m part of</h2>
            <p>{joinedTeams.length} team{joinedTeams.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        {renderTeams(joinedTeams)}
      </section>
    </section>
  )
}

function ChatsPage({ events, email }: { events: HackathonEvent[]; email: string }) {
  const normalizedEmail = normalizeEmail(email)
  const teamChats = events.flatMap((event) =>
    event.teams
      .filter((team) =>
        normalizeEmail(team.createdByEmail ?? '') === normalizedEmail ||
        team.members.some((member) => normalizeEmail(member.email) === normalizedEmail))
      .flatMap((team) => {
        const generalMessages = team.generalMessages ?? []
        const chats = [{
          key: 'general',
          label: 'General',
          conversation: 'general',
          message: generalMessages[generalMessages.length - 1],
        }]
        const directChats = team.members
          .filter((member) => member.email && normalizeEmail(member.email) !== normalizedEmail)
          .map((member) => {
            const participants = [normalizedEmail, normalizeEmail(member.email)].sort()
            const chat = team.directChats?.find((candidate) =>
              [normalizeEmail(candidate.participantEmails[0]), normalizeEmail(candidate.participantEmails[1])]
                .sort()
                .every((participant, index) => participant === participants[index]))
            const messages = chat?.messages ?? []
            return {
              key: normalizeEmail(member.email),
              label: member.name || member.email,
              conversation: normalizeEmail(member.email),
              message: messages[messages.length - 1],
            }
          })
        return [...chats, ...directChats].map((chat) => ({
          ...chat,
          event,
          team,
          href: `/my-teams/${event.id}/${team.id}?chat=${encodeURIComponent(chat.conversation)}`,
        }))
      }))

  const chatEvents = events.filter((event) =>
    teamChats.some((chat) => chat.event.id === event.id))
  const groupChats = teamChats.filter((chat) => chat.conversation === 'general')
  const personalChats = teamChats.filter((chat) => chat.conversation !== 'general')

  function renderChatLink(chat: typeof teamChats[number]) {
    return (
      <Link className="chat-list-item" key={`${chat.event.id}-${chat.team.id}-${chat.key}`} to={chat.href}>
        <span className="chat-list-icon" aria-hidden="true">{chat.conversation === 'general' ? '◈' : '○'}</span>
        <span className="chat-list-details">
          <strong>{chat.label}</strong>
          <span>{chat.team.name}</span>
          <span className="chat-list-preview">
            {chat.message ? `${chat.message.senderName}: ${chat.message.text}` : chat.conversation === 'general' ? 'No messages yet' : 'Direct message'}
          </span>
        </span>
        <span className="my-team-arrow" aria-hidden="true">→</span>
      </Link>
    )
  }

  return (
    <section className="chats-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>Chats</h1>
          <p className="page-description">Team conversations and direct messages.</p>
        </div>
      </div>
      {teamChats.length ? (
        <div className="chat-categories">
          <section className="chat-category">
            <h2>Group chats</h2>
            {groupChats.length ? chatEvents.map((event) => {
              const eventChats = groupChats.filter((chat) => chat.event.id === event.id)
              if (!eventChats.length) return null
              return (
                <details className="chat-event-group" key={event.id} open>
                  <summary>{event.name}<span>{eventChats.length} team chat{eventChats.length === 1 ? '' : 's'}</span></summary>
                  <div className="chat-event-teams">
                    {eventChats.map((chat) => (
                      <details className="chat-team-group" key={chat.team.id}>
                        <summary>{chat.team.name}<span>General</span></summary>
                        <div className="chat-team-conversations">{renderChatLink(chat)}</div>
                      </details>
                    ))}
                  </div>
                </details>
              )
            }) : <p className="teams-empty">No group chats yet.</p>}
          </section>
          <section className="chat-category">
            <h2>Personal chats</h2>
            {personalChats.length ? chatEvents.map((event) => {
              const eventChats = personalChats.filter((chat) => chat.event.id === event.id)
              if (!eventChats.length) return null
              return (
                <details className="chat-event-group personal-chat-event" key={event.id}>
                  <summary>{event.name}<span>{eventChats.length} personal chat{eventChats.length === 1 ? '' : 's'}</span></summary>
                  <div className="chat-event-teams">
                    {eventChats.map((chat) => (
                      <div className="personal-chat-team" key={`${chat.team.id}-${chat.key}`}>
                        <h3>{chat.team.name}</h3>
                        {renderChatLink(chat)}
                      </div>
                    ))}
                  </div>
                </details>
              )
            }) : <p className="teams-empty">No personal chats yet.</p>}
          </section>
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-state-icon" aria-hidden="true">◈</span>
          <h3>No team chats yet</h3>
          <p>Join or create a team to start chatting with teammates.</p>
          <Link className="button button-secondary" to="/my-teams">View my teams</Link>
        </div>
      )}
    </section>
  )
}

const standardTeamRoles = ['Creator', 'Manager', 'Leader', 'Member'] as const

function TeamRoleEditor({
  role,
  onSave,
}: {
  role: string
  onSave: (role: string) => void
}) {
  const isStandardRole = standardTeamRoles.some((standardRole) => standardRole === role)
  const [selectedRole, setSelectedRole] = useState(isStandardRole ? role : 'Custom')
  const [customRole, setCustomRole] = useState(isStandardRole ? '' : role)
  const [error, setError] = useState('')

  function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextRole = selectedRole === 'Custom' ? customRole.trim() : selectedRole
    if (!nextRole || nextRole.length > 30) {
      setError('Enter a custom role with 1-30 characters.')
      return
    }
    onSave(nextRole)
    setError('')
  }

  return (
    <form className="team-role-editor" onSubmit={saveRole}>
      <label>
        Role
        <select value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}>
          {standardTeamRoles.filter((option) => option !== 'Creator').map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
          <option value="Custom">Custom</option>
        </select>
      </label>
      {selectedRole === 'Custom' && (
        <label>
          Custom role
          <input
            maxLength={30}
            onChange={(event) => setCustomRole(event.target.value)}
            placeholder="e.g. Designer"
            required
            value={customRole}
          />
        </label>
      )}
      <button className="team-role-save" type="submit">Save role</button>
      {error && <span className="field-error" role="alert">{error}</span>}
    </form>
  )
}

function TeamChat({
  team,
  currentEmail,
  onUpdate,
}: {
  team: Team
  currentEmail: string
  onUpdate: (update: (current: HackathonEvent) => HackathonEvent) => void
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const requestedConversation = new URLSearchParams(location.search).get('chat') ?? 'general'
  const availableConversation = requestedConversation === 'general' ||
    team.members.some((member) => normalizeEmail(member.email) === normalizeEmail(requestedConversation))
    ? requestedConversation
    : 'general'
  const activeConversation = availableConversation
  const [draft, setDraft] = useState('')
  const directMember = team.members.find((member) => normalizeEmail(member.email) === activeConversation)
  const directKey = directMember
    ? [normalizeEmail(currentEmail), normalizeEmail(directMember.email)].sort().join(':')
    : ''
  const directChat = team.directChats?.find((chat) =>
    [normalizeEmail(chat.participantEmails[0]), normalizeEmail(chat.participantEmails[1])].sort().join(':') === directKey)
  const messages = activeConversation === 'general'
    ? team.generalMessages ?? []
    : directChat?.messages ?? []

  function selectConversation(conversation: string) {
    navigate(`${location.pathname}?chat=${encodeURIComponent(conversation)}`, { replace: true })
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || text.length > 2000) return
    const currentMember = team.members.find((member) => normalizeEmail(member.email) === normalizeEmail(currentEmail))
    const message: TeamMessage = {
      id: crypto.randomUUID(),
      senderEmail: normalizeEmail(currentEmail),
      senderName: currentMember?.name || currentEmail,
      text,
      sentAt: new Date().toISOString(),
    }
    onUpdate((current) => ({
      ...current,
      teams: current.teams.map((currentTeam) => {
        if (currentTeam.id !== team.id) return currentTeam
        if (activeConversation === 'general') {
          return { ...currentTeam, generalMessages: [...(currentTeam.generalMessages ?? []), message] }
        }
        if (!directMember) return currentTeam
        const participants: [string, string] = normalizeEmail(currentEmail) < normalizeEmail(directMember.email)
          ? [normalizeEmail(currentEmail), normalizeEmail(directMember.email)]
          : [normalizeEmail(directMember.email), normalizeEmail(currentEmail)]
        const chats = currentTeam.directChats ?? []
        const found = chats.find((chat) =>
          [normalizeEmail(chat.participantEmails[0]), normalizeEmail(chat.participantEmails[1])].sort().join(':') === directKey)
        return {
          ...currentTeam,
          directChats: found
            ? chats.map((chat) =>
              [normalizeEmail(chat.participantEmails[0]), normalizeEmail(chat.participantEmails[1])].sort().join(':') === directKey
                ? { ...chat, messages: [...chat.messages, message] }
                : chat)
            : [...chats, { participantEmails: participants, messages: [message] }],
        }
      }),
    }))
    setDraft('')
  }

  return (
    <section className="team-chat" aria-label={`${team.name} chat`}>
      <nav className="team-chat-sidebar" aria-label="Team conversations">
        <button
          className={`team-chat-conversation${activeConversation === 'general' ? ' active' : ''}`}
          type="button"
          onClick={() => selectConversation('general')}
        >
          <strong>General</strong>
          <span>Everyone in the team</span>
        </button>
        <h3>Direct messages</h3>
        {team.members.filter((member) =>
          member.email && normalizeEmail(member.email) !== normalizeEmail(currentEmail)).map((member) => (
          <button
            className={`team-chat-conversation${activeConversation === normalizeEmail(member.email) ? ' active' : ''}`}
            key={member.email}
            type="button"
            onClick={() => selectConversation(normalizeEmail(member.email))}
          >
            <strong>{member.name || member.email}</strong>
            <span>{member.role || 'Member'}</span>
          </button>
        ))}
        {team.members.length <= 1 && <p className="team-chat-empty-contact">No other team members yet.</p>}
      </nav>
      <div className="team-chat-main">
        <header className="team-chat-header">
          <h2>{activeConversation === 'general' ? 'General chat' : directMember?.name || 'Direct message'}</h2>
          <p>{activeConversation === 'general' ? 'Messages are visible to all team members.' : `Private conversation with ${directMember?.name || directMember?.email}.`}</p>
        </header>
        <div className="team-chat-messages" aria-live="polite">
          {messages.length ? messages.map((message) => (
            <article
              className={`team-chat-message${normalizeEmail(message.senderEmail) === normalizeEmail(currentEmail) ? ' own' : ''}`}
              key={message.id}
            >
              <div className="team-chat-message-meta">
                <strong>{normalizeEmail(message.senderEmail) === normalizeEmail(currentEmail) ? 'You' : message.senderName}</strong>
                <time dateTime={message.sentAt}>{new Date(message.sentAt).toLocaleString()}</time>
              </div>
              <p>{message.text}</p>
            </article>
          )) : <p className="team-chat-empty">No messages yet. Start the conversation.</p>}
        </div>
        <form className="team-chat-compose" onSubmit={sendMessage}>
          <textarea
            aria-label="Message"
            maxLength={2000}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Message ${activeConversation === 'general' ? 'the team' : directMember?.name || 'member'}...`}
            required
            rows={2}
            value={draft}
          />
          <button className="button button-primary" type="submit" disabled={!draft.trim()}>Send</button>
        </form>
      </div>
    </section>
  )
}

function MyTeamDetailPage({
  event,
  team,
  profiles,
  currentEmail,
  onUpdate,
}: {
  event: HackathonEvent
  team: Team
  profiles: Profile[]
  currentEmail: string
  onUpdate: (update: (current: HackathonEvent) => HackathonEvent) => boolean
}) {
  const isCreator = normalizeEmail(team.createdByEmail ?? '') === normalizeEmail(currentEmail)
  const [name, setName] = useState(team.name)
  const [description, setDescription] = useState(team.description ?? '')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteFeedback, setInviteFeedback] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function saveSettings(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault()
    const nextName = name.trim()
    if (!nextName) {
      setError('Enter a team name.')
      return
    }
    const nextDescription = description.trim()
    onUpdate((current) => ({
      ...current,
      teams: current.teams.map((currentTeam) =>
        currentTeam.id === team.id
          ? { ...currentTeam, name: nextName, description: nextDescription }
          : currentTeam),
    }))
    setError('')
    setNotice('Team settings saved.')
  }

  function removeMember(email: string) {
    const normalizedMemberEmail = normalizeEmail(email)
    onUpdate((current) => ({
      ...current,
      teams: current.teams.map((currentTeam) =>
        currentTeam.id === team.id
          ? { ...currentTeam, members: currentTeam.members.filter((member) => normalizeEmail(member.email) !== normalizedMemberEmail) }
          : currentTeam),
    }))
    setError('')
    setNotice('Team member removed.')
  }

  function assignRole(email: string, role: string) {
    const normalizedEmail = normalizeEmail(email)
    onUpdate((current) => ({
      ...current,
      teams: current.teams.map((currentTeam) =>
        currentTeam.id === team.id
          ? {
            ...currentTeam,
            members: currentTeam.members.map((member) =>
              normalizeEmail(member.email) === normalizedEmail ? { ...member, role } : member),
          }
          : currentTeam),
    }))
    setError('')
    setNotice('Team role updated.')
  }

  function inviteProfile(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault()
    const normalizedInviteEmail = normalizeEmail(inviteEmail)
    const invitedProfile = profiles.find((candidate) =>
      normalizeEmail(candidate.email) === normalizedInviteEmail)
    if (!invitedProfile) {
      setInviteFeedback('No profile was found with that email address.')
      return
    }
    if (event.teams.some((eventTeam) =>
      eventTeam.id !== team.id && eventTeam.members.some((member) =>
        normalizeEmail(member.email) === normalizedInviteEmail))) {
      setInviteFeedback('This profile is already a member of another team in this event.')
      return
    }
    if (event.teams.some((eventTeam) =>
      eventTeam.id !== team.id && eventTeam.invitedEmails?.includes(normalizedInviteEmail))) {
      setInviteFeedback('This profile already has a pending invitation to another team in this event.')
      return
    }
    if (countMemberTeams(event, normalizedInviteEmail) + countPendingTeamInvites(event, normalizedInviteEmail) >= event.maxTeamsPerPerson) {
      setInviteFeedback(`This profile has reached the limit of ${event.maxTeamsPerPerson} team${event.maxTeamsPerPerson === 1 ? '' : 's'} per person for this event.`)
      return
    }
    if (team.members.length + (team.invitedEmails?.length ?? 0) >= event.maxTeamMembers) {
      setInviteFeedback(`This team has reached its limit of ${event.maxTeamMembers} members, including pending invitations.`)
      return
    }
    if (team.members.some((member) => normalizeEmail(member.email) === normalizedInviteEmail)) {
      setInviteFeedback('This profile is already a team member.')
      return
    }
    if (team.invitedEmails?.includes(normalizedInviteEmail)) {
      setInviteFeedback('This profile already has a pending invitation.')
      return
    }
    const saved = onUpdate((current) => ({
      ...current,
      teams: current.teams.map((currentTeam) =>
        currentTeam.id === team.id
          ? { ...currentTeam, invitedEmails: [...(currentTeam.invitedEmails ?? []), normalizedInviteEmail] }
          : currentTeam),
    }))
    if (!saved) {
      setInviteFeedback('The invitation could not be saved. Please try again.')
      return
    }
    setInviteEmail('')
    setInviteFeedback(`Pending invitation created for ${invitedProfile.email}.`)
  }

  function cancelInvite(email: string) {
    const normalizedInviteEmail = normalizeEmail(email)
    const saved = onUpdate((current) => ({
      ...current,
      teams: current.teams.map((currentTeam) =>
        currentTeam.id === team.id
          ? { ...currentTeam, invitedEmails: (currentTeam.invitedEmails ?? []).filter((invitedEmail) => invitedEmail !== normalizedInviteEmail) }
          : currentTeam),
    }))
    setInviteFeedback(saved ? 'Invitation canceled.' : 'The invitation could not be canceled. Please try again.')
  }

  return (
    <section className="team-detail-page">
      <div className="breadcrumbs">
        <Link to="/my-teams">My teams</Link>
        <span>/</span>
        <span>{team.name}</span>
      </div>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TEAM WORKSPACE · {event.name}</p>
          <h1>{team.name}</h1>
          <p className="page-description">{team.description || `${team.members.length} member${team.members.length === 1 ? '' : 's'}`}</p>
        </div>
        <div className="team-page-actions">
          {isCreator && (
            <button
              className="button button-secondary"
              type="button"
              aria-expanded={settingsOpen}
              aria-controls="team-settings"
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              ⚙ Team settings
            </button>
          )}
          {!event.id.startsWith('shared-') && (
            <Link className="button button-secondary" to={`/events/${event.id}/teams`}>Event teams</Link>
          )}
        </div>
      </div>
      {isCreator && settingsOpen && (
        <form id="team-settings" className="event-form team-settings-form" onSubmit={saveSettings}>
          <h2>Team settings</h2>
          <label>
            Team name
            <input required value={name} onChange={(eventForm) => setName(eventForm.target.value)} />
          </label>
          <label>
            Team description
            <textarea maxLength={500} rows={4} value={description} onChange={(eventForm) => setDescription(eventForm.target.value)} placeholder="What is your team working on?" />
          </label>
          <p className="form-hint">Describe your team's focus or project (up to 500 characters).</p>
          {error && <p className="field-error" role="alert">{error}</p>}
          {notice && <p className="form-hint" role="status">{notice}</p>}
          <button className="button button-primary" type="submit">Save team settings</button>
        </form>
      )}
      <TeamChat key={team.id} team={team} currentEmail={currentEmail} onUpdate={onUpdate} />
      {isCreator && (
        <section className="team-invite-section">
          <form className="event-form team-invite-form" onSubmit={inviteProfile}>
            <h2>Invite by email</h2>
            <p>Create an in-app team invitation for a registered profile.</p>
            <div className="input-action">
              <input
                aria-label="Profile email to invite"
                autoComplete="email"
                onChange={(input) => setInviteEmail(input.target.value)}
                placeholder="Enter profile email"
                required
                type="email"
                value={inviteEmail}
              />
              <button className="button button-primary" type="submit">Invite</button>
            </div>
            {inviteFeedback && <p className="form-hint" role="status">{inviteFeedback}</p>}
          </form>
          {(team.invitedEmails?.length ?? 0) > 0 && (
            <div className="team-pending-invites">
              <h3>Pending invitations</h3>
              <ul className="member-list">
                {team.invitedEmails?.map((invitedEmail) => (
                  <li key={invitedEmail}>
                    <span>{profiles.find((candidate) => normalizeEmail(candidate.email) === invitedEmail)?.name ?? invitedEmail}<small>{invitedEmail}</small></span>
                    <button className="member-remove" type="button" onClick={() => cancelInvite(invitedEmail)}>Cancel</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      <section className="team-roster">
        <div className="section-heading">
          <div>
            <h2>Team members</h2>
            <p>People assigned to {team.name}.</p>
          </div>
        </div>
        {team.members.length ? (
          <ul className="member-list team-detail-members">
            {team.members.map((member, index) => {
              const savedProfile = profiles.find((candidate) =>
                member.email && normalizeEmail(candidate.email) === normalizeEmail(member.email))
              const displayName = savedProfile?.name ?? member.name
              const isTeamCreator = normalizeEmail(member.email) === normalizeEmail(team.createdByEmail ?? '')
              return (
                <li key={`${member.email || index}`}>
                  <span>
                    <strong>{displayName}</strong>
                    {member.email && <small>{member.email}</small>}
                    <span className="team-role-badge">{isTeamCreator ? 'Creator' : member.role || 'Member'}</span>
                  </span>
                  {isCreator && member.email && !isTeamCreator && (
                    <TeamRoleEditor
                      key={`${member.email}-${member.role}`}
                      role={member.role || 'Member'}
                      onSave={(role) => assignRole(member.email, role)}
                    />
                  )}
                  {isCreator && member.email && normalizeEmail(member.email) !== normalizeEmail(currentEmail) && (
                    <button className="member-remove" type="button" onClick={() => removeMember(member.email)}>
                      Remove
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        ) : <p className="teams-empty">No members have been added to this team yet.</p>}
        {error && <p className="field-error" role="alert">{error}</p>}
        {notice && !error && <p className="team-detail-notice" role="status">{notice}</p>}
      </section>
      <div className="event-join-code team-join-code" aria-label={`Static team code ${team.teamCode}`}>
        <span>Share this static code so others can join</span>
        <code>{team.teamCode}</code>
      </div>
    </section>
  )
}

function EventDashboard({
  profile,
  profiles,
  profileError,
  onProfileSave,
  onSignOut,
}: {
  profile: Profile
  profiles: Profile[]
  profileError: string
  onProfileSave: (profile: Profile) => boolean
  onSignOut: () => void
}) {
  const [initialState] = useState(() => loadEvents(profile.email))
  const [events, setEvents] = useState(initialState.events)
  const [storageError, setStorageError] = useState(initialState.error)
  const location = useLocation()
  const navigate = useNavigate()
  const visibleEvents = events.filter((event) => event.memberEmails.includes(normalizeEmail(profile.email)))
  const teamEvents = events
  const profileInvitations = events.flatMap((event) =>
    event.teams
      .filter((team) => team.invitedEmails?.includes(normalizeEmail(profile.email)))
      .map((team) => ({ event, team })))
  const activeEvent = visibleEvents.find((event) => location.pathname.startsWith(`/events/${event.id}`))
  const teamRouteParts = location.pathname.split('/')
  const teamRouteEvent = teamEvents.find((event) => event.id === teamRouteParts[2])
  const teamRouteTeam = teamRouteEvent?.teams.find((team) => team.id === teamRouteParts[3])
  const canViewTeamRoute = teamRouteTeam && (
    normalizeEmail(teamRouteTeam.createdByEmail ?? '') === normalizeEmail(profile.email) ||
    teamRouteTeam.members.some((member) =>
      member.email && normalizeEmail(member.email) === normalizeEmail(profile.email))
  )

  function createEvent(details: EventDetails) {
    const usedCodes = new Set(events.map((event) => event.joinCode))
    let joinCode: string
    do {
      joinCode = createJoinCode()
    } while (usedCodes.has(joinCode))
    const createdEvent: HackathonEvent = {
      ...details,
      id: crypto.randomUUID(),
      createdByEmail: normalizeEmail(profile.email),
      joinCode,
      memberEmails: [normalizeEmail(profile.email)],
      maxTeamMembers: 5,
      maxTeamsPerPerson: 1,
      teams: [],
      rooms: [],
      mentors: [],
    }
    const nextEvents = [...events, createdEvent]
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextEvents))
    } catch {
      setStorageError('This event could not be saved. Check your browser storage settings and try again.')
      return
    }
    setEvents(nextEvents)
    setStorageError('')
    navigate(`/events/${createdEvent.id}`)
  }

  function updateEvent(eventId: string, update: (current: HackathonEvent) => HackathonEvent): boolean {
    const nextEvents = events.map((event) => event.id === eventId ? update(event) : event)
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextEvents))
    } catch {
      setStorageError('Your changes could not be saved. Check your browser storage settings and try again.')
      return false
    }
    setEvents(nextEvents)
    setStorageError('')
    return true
  }

  function updateEventDetails(eventId: string, details: EventSettings): boolean {
    const event = events.find((savedEvent) => savedEvent.id === eventId)
    if (!event || normalizeEmail(event.createdByEmail ?? '') !== normalizeEmail(profile.email)) {
      return false
    }
    return updateEvent(eventId, (current) => ({ ...current, ...details }))
  }

  function respondToTeamInvite(eventId: string, teamId: string, accept: boolean): boolean {
    const event = events.find((savedEvent) => savedEvent.id === eventId)
    const team = event?.teams.find((savedTeam) => savedTeam.id === teamId)
    const email = normalizeEmail(profile.email)
    if (!event || !team || !team.invitedEmails?.includes(email)) {
      setStorageError('This team invitation is no longer available.')
      return false
    }
    if (accept && team.members.length >= event.maxTeamMembers) {
      setStorageError(`This team has reached its limit of ${event.maxTeamMembers} members.`)
      return false
    }
    if (accept && countMemberTeams(event, email) >= event.maxTeamsPerPerson) {
      setStorageError(`You have reached the limit of ${event.maxTeamsPerPerson} team${event.maxTeamsPerPerson === 1 ? '' : 's'} per person for this event.`)
      return false
    }
    if (accept && countMemberTeams(event, email) + countPendingTeamInvites(event, email) - 1 >= event.maxTeamsPerPerson) {
      setStorageError(`Accept or decline your other team invitations before joining another team.`)
      return false
    }
    const invitedProfile = profiles.find((savedProfile) => normalizeEmail(savedProfile.email) === email)
    return updateEvent(eventId, (current) => ({
      ...current,
      memberEmails: accept && !current.memberEmails.includes(email)
        ? [...current.memberEmails, email]
        : current.memberEmails,
      teams: current.teams.map((savedTeam) => savedTeam.id === teamId
        ? {
          ...savedTeam,
          invitedEmails: (savedTeam.invitedEmails ?? []).filter((invitedEmail) => invitedEmail !== email),
          members: accept && !savedTeam.members.some((member) => normalizeEmail(member.email) === email)
            ? [...savedTeam.members, {
              email,
              name: invitedProfile?.name ?? email,
              role: 'Member',
            }]
            : savedTeam.members,
        }
        : savedTeam),
    }))
  }

  function joinEvent(code: string): boolean {
    const normalizedCode = code.trim().toUpperCase()
    const event = events.find((savedEvent) => savedEvent.joinCode === normalizedCode)
    if (!event) {
      setStorageError('No event was found with that code. Check the code and try again.')
      return false
    }

    const email = normalizeEmail(profile.email)
    const nextEvents = events.map((savedEvent) =>
      savedEvent.id === event.id && !savedEvent.memberEmails.includes(email)
        ? { ...savedEvent, memberEmails: [...savedEvent.memberEmails, email] }
        : savedEvent)
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextEvents))
      setEvents(nextEvents)
      setStorageError('')
      navigate(`/events/${event.id}`)
      return true
    } catch {
      setStorageError('You could not join this event. Check your browser storage settings and try again.')
      return false
    }
  }

  function joinTeam(code: string): { eventId: string; teamId: string } | string {
    const normalizedCode = code.trim().toUpperCase()
    const matchingEvent = events.find((event) =>
      event.teams.some((team) => team.teamCode === normalizedCode))
    const matchingTeam = matchingEvent?.teams.find((team) => team.teamCode === normalizedCode)
    if (!matchingEvent || !matchingTeam) {
      return 'No team was found with that code. Check the code and try again.'
    }

    const email = normalizeEmail(profile.email)
    if (matchingTeam.members.some((member) => normalizeEmail(member.email) === email)) {
      return { eventId: matchingEvent.id, teamId: matchingTeam.id }
    }
    const reservedTeamInvite = matchingTeam.invitedEmails?.includes(email) ? 1 : 0
    if (countMemberTeams(matchingEvent, email) + countPendingTeamInvites(matchingEvent, email) - reservedTeamInvite >= matchingEvent.maxTeamsPerPerson) {
      return `You have reached the limit of ${matchingEvent.maxTeamsPerPerson} team${matchingEvent.maxTeamsPerPerson === 1 ? '' : 's'} per person for this event.`
    }
    const reservedSeat = reservedTeamInvite
    if (matchingTeam.members.length + (matchingTeam.invitedEmails?.length ?? 0) - reservedSeat >= matchingEvent.maxTeamMembers) {
      return `This team has reached its limit of ${matchingEvent.maxTeamMembers} members.`
    }

    const nextEvents = events.map((event) => event.id === matchingEvent.id
      ? {
        ...event,
        memberEmails: event.memberEmails.includes(email) ? event.memberEmails : [...event.memberEmails, email],
        teams: event.teams.map((team) => team.id === matchingTeam.id
          ? {
            ...team,
            invitedEmails: (team.invitedEmails ?? []).filter((invitedEmail) => invitedEmail !== email),
            members: [...team.members, { email, name: profile.name, role: 'Member' }],
          }
          : team),
      }
      : event)
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextEvents))
      setEvents(nextEvents)
      setStorageError('')
      return { eventId: matchingEvent.id, teamId: matchingTeam.id }
    } catch {
      setStorageError('You could not join this team. Check your browser storage settings and try again.')
      return 'Your team membership could not be saved. Check your browser storage settings and try again.'
    }
  }

  return (
    <div className="layout">
      <header className="topbar">
        <Link to="/" className="brand-mark" aria-label="Event Hosting dashboard">E</Link>
        <Link to="/" className="brand-name">Event Hosting</Link>
        <div className="account-actions">
          <span>{profile.name}</span>
          <button className="sign-out" type="button" onClick={onSignOut}>Sign out</button>
        </div>
      </header>
      <aside className="sidebar">
        <p className="nav-label">WORKSPACE</p>
        <NavLink to="/" end className="nav-link">
          <span aria-hidden="true">▦</span> Dashboard
        </NavLink>
        <NavLink to="/calendar" className="nav-link">
          <span aria-hidden="true">▦</span> Calendar
        </NavLink>
        <div className="profile-nav-row">
          <NavLink to="/profile" className="nav-link">
            <span aria-hidden="true">○</span> Profile
          </NavLink>
          <NotificationBell pendingInvites={profileInvitations} onRespondToInvite={respondToTeamInvite} />
        </div>
        <NavLink to="/my-teams" className="nav-link">
          <span aria-hidden="true">◈</span> My teams
        </NavLink>
        <NavLink to="/chats" className="nav-link">
          <span aria-hidden="true">▤</span> Chats
        </NavLink>
        <p className="nav-label events-label">EVENTS <span>{visibleEvents.length}</span></p>
        {visibleEvents.length === 0 && <p className="nav-empty">No events joined</p>}
        {visibleEvents.map((event) => {
          const selected = activeEvent?.id === event.id
          return (
            <EventSidebarItem
              key={event.id}
              event={event}
              isCreator={normalizeEmail(event.createdByEmail ?? '') === normalizeEmail(profile.email)}
              onSave={updateEventDetails}
              selectedContent={selected && (
                <div className="nested-nav">
                  {sections.map((item) => (
                    <NavLink key={item.slug} to={`/events/${event.id}/${item.slug}`} className={({ isActive }) => `nested-nav-link${isActive ? ' active' : ''}`}>
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            >
              <NavLink to={`/events/${event.id}`} className={({ isActive }) => `nav-link event-nav-link${isActive && !location.pathname.endsWith('/teams') && !location.pathname.endsWith('/rooms') && !location.pathname.endsWith('/mentors') ? ' active' : ''}`}>
                <span className="event-nav-dot" aria-hidden="true">✦</span>
                <span className="event-nav-name">{event.name}</span>
              </NavLink>
            </EventSidebarItem>
          )
        })}
        <button className="sidebar-add" onClick={() => navigate('/')}>+ Add event</button>
      </aside>
      <main className="content">
        {storageError && <p className="storage-error" role="alert">{storageError}</p>}
        <Routes>
          <Route path="/" element={<Dashboard events={visibleEvents} onCreateEvent={createEvent} onJoinEvent={joinEvent} />} />
          <Route path="/profile" element={<ProfilePage profile={profile} error={profileError} onSave={onProfileSave} />} />
          <Route path="/my-teams" element={<MyTeamsPage events={teamEvents} email={profile.email} onJoinTeam={joinTeam} onRespondToInvite={respondToTeamInvite} />} />
          <Route path="/calendar" element={<CalendarPage events={visibleEvents} />} />
          <Route path="/chats" element={<ChatsPage events={teamEvents} email={profile.email} />} />
          <Route
            path="/my-teams/:eventId/:teamId"
            element={teamRouteEvent && teamRouteTeam && canViewTeamRoute
              ? <MyTeamDetailPage
                event={teamRouteEvent}
                team={teamRouteTeam}
                profiles={profiles}
                currentEmail={profile.email}
                onUpdate={(update) => updateEvent(teamRouteEvent.id, update)}
              />
              : <Navigate to="/my-teams" replace />}
          />
          <Route
            path="/events/:eventId"
            element={activeEvent ? <EventPage event={activeEvent} profiles={profiles} currentEmail={profile.email} usedTeamCodes={teamEvents.flatMap((event) => event.teams.map((team) => team.teamCode))} onUpdate={(update) => updateEvent(activeEvent.id, update)} isEventCreator={normalizeEmail(activeEvent.createdByEmail ?? '') === normalizeEmail(profile.email)} /> : <Navigate to="/" replace />}
          />
          <Route
            path="/events/:eventId/:section"
            element={activeEvent && sections.some((item) => item.slug === location.pathname.split('/').pop()) ? <EventPage event={activeEvent} profiles={profiles} currentEmail={profile.email} usedTeamCodes={teamEvents.flatMap((event) => event.teams.map((team) => team.teamCode))} onUpdate={(update) => updateEvent(activeEvent.id, update)} isEventCreator={normalizeEmail(activeEvent.createdByEmail ?? '') === normalizeEmail(profile.email)} /> : <Navigate to="/" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  const [initialState] = useState(readSavedAccounts)
  const [accounts, setAccounts] = useState(initialState.accounts)
  const [storageError, setStorageError] = useState(initialState.error)
  const [profile, setProfile] = useState(emptyProfile)
  const [activeEmail, setActiveEmail] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  function authenticate(nextProfile: Profile, credential: PasswordCredential, isSignUp: boolean): boolean {
    if (!isSignUp) {
      setProfile(nextProfile)
      setActiveEmail(normalizeEmail(nextProfile.email))
      setStorageError('')
      setIsAuthenticated(true)
      return true
    }
    if (accounts.some(({ profile: saved }) => normalizeEmail(saved.email) === normalizeEmail(nextProfile.email))) {
      return false
    }
    const nextAccounts = [...accounts, { profile: nextProfile, credential }]
    try {
      localStorage.setItem(profileStorageKey, JSON.stringify({ accounts: nextAccounts }))
      setAccounts(nextAccounts)
      setProfile(nextProfile)
      setActiveEmail(normalizeEmail(nextProfile.email))
      setStorageError('')
      setIsAuthenticated(true)
      return true
    } catch {
      setStorageError('Your account could not be saved. Check your browser storage settings and try again.')
      return false
    }
  }

  function saveProfile(nextProfile: Profile): boolean {
    const accountIndex = accounts.findIndex(({ profile: saved }) => normalizeEmail(saved.email) === activeEmail)
    if (accountIndex < 0) {
      setStorageError('Your account could not be found. Please sign in again.')
      return false
    }
    if (accounts.some(({ profile: saved }, index) =>
      index !== accountIndex && normalizeEmail(saved.email) === normalizeEmail(nextProfile.email))) {
      setStorageError('Another account already uses this email address.')
      return false
    }
    const nextAccounts = accounts.map((account, index) =>
      index === accountIndex ? { ...account, profile: nextProfile } : account)
    try {
      localStorage.setItem(profileStorageKey, JSON.stringify({ accounts: nextAccounts }))
      setAccounts(nextAccounts)
      setProfile(nextProfile)
      setActiveEmail(normalizeEmail(nextProfile.email))
      setStorageError('')
      return true
    } catch {
      setStorageError('Your profile could not be saved. Check your browser storage settings and try again.')
      return false
    }
  }

  if (!isAuthenticated) {
    return <AuthScreen accounts={accounts} initialError={storageError} onAuthenticated={authenticate} />
  }

  return (
    <EventDashboard
      profile={profile}
      profiles={accounts.map(({ profile: savedProfile }) => savedProfile)}
      profileError={storageError}
      onProfileSave={saveProfile}
      onSignOut={() => {
        setIsAuthenticated(false)
        setProfile(emptyProfile)
        setActiveEmail('')
      }}
    />
  )
}

export default App
