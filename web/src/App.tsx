import { useState, type FormEvent } from 'react'
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

    const records: unknown[] = 'accounts' in parsed && Array.isArray(parsed.accounts)
      ? parsed.accounts
      : [parsed]
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
  date: string
  location: string
  joinCode: string
  memberEmails: string[]
  teams: Team[]
  rooms: Room[]
  mentors: Mentor[]
}

type TeamMember = { email: string; name: string }
type Team = { id: string; name: string; teamCode: string; members: TeamMember[]; createdByEmail?: string }
type Room = { id: string; name: string; teamIds: string[] }
type Mentor = { id: string; name: string; email: string; specialty: string }

function isTeam(value: unknown): value is Team {
  if (typeof value !== 'object' || value === null) return false
  const team = value as Record<string, unknown>
  return typeof team.id === 'string' &&
    typeof team.name === 'string' &&
    (!('teamCode' in team) || typeof team.teamCode === 'string') &&
    (!('createdByEmail' in team) || typeof team.createdByEmail === 'string') &&
    Array.isArray(team.members) &&
    team.members.every((member: unknown) =>
      typeof member === 'string' ||
      (typeof member === 'object' && member !== null &&
        'email' in member && typeof member.email === 'string' &&
        'name' in member && typeof member.name === 'string'))
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
          if (teamCode !== team.teamCode || team.members.some((member) => typeof member === 'string')) {
            needsStorageUpdate = true
          }
          return {
            ...team,
            teamCode,
            members: team.members.map((member) =>
              typeof member === 'string'
                ? { email: '', name: member }
                : { ...member, email: normalizeEmail(member.email) }),
          }
        })
        : []
      return {
        id: event.id,
        name: event.name,
        date: event.date,
        location: event.location,
        joinCode,
        memberEmails: Array.isArray(event.memberEmails)
          ? event.memberEmails.filter((email): email is string => typeof email === 'string').map(normalizeEmail)
          : [normalizeEmail(currentEmail)],
        teams,
        rooms: Array.isArray(event.rooms) ? event.rooms.filter(isRoom) : [],
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

function Dashboard({
  events,
  onCreateEvent,
  onJoinEvent,
}: {
  events: HackathonEvent[]
  onCreateEvent: (event: Omit<HackathonEvent, 'id' | 'joinCode' | 'memberEmails' | 'teams' | 'rooms' | 'mentors'>) => void
  onJoinEvent: (code: string) => boolean
}) {
  const [formOpen, setFormOpen] = useState(false)
  const [joinFormOpen, setJoinFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')
  const [joinCode, setJoinCode] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onCreateEvent({ name: name.trim(), date, location: location.trim() })
    setName('')
    setDate('')
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
          <div className="form-row">
            <label>
              Date
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label>
              Location
              <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Engineering Building" />
            </label>
          </div>
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
                <span>{[event.date, event.location].filter(Boolean).join(' · ') || 'Event workspace'}</span>
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

function EventPage({
  event,
  profiles,
  currentEmail,
  usedTeamCodes,
  onUpdate,
}: {
  event: HackathonEvent
  profiles: Profile[]
  currentEmail: string
  usedTeamCodes: string[]
  onUpdate: (update: (current: HackathonEvent) => HackathonEvent) => void
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
            {activeSection?.description ?? ([event.date, event.location].filter(Boolean).join(' · ') || 'Manage this event and its resources.')}
          </p>
        </div>
        <div className="event-join-code" aria-label={`Event join code ${event.joinCode}`}>
          <span>Share this code to invite people to the event</span>
          <code>{event.joinCode}</code>
          <span>{event.memberEmails.length} member{event.memberEmails.length === 1 ? '' : 's'}</span>
        </div>
      </div>
      {activeSection ? (
        <EventResources event={event} profiles={profiles} currentEmail={currentEmail} usedTeamCodes={usedTeamCodes} section={activeSection.slug} onUpdate={onUpdate} />
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
}: {
  event: HackathonEvent
  profiles: Profile[]
  currentEmail: string
  usedTeamCodes: string[]
  section: string
  onUpdate: (update: (current: HackathonEvent) => HackathonEvent) => void
}) {
  const [name, setName] = useState('')
  const [roomTeams, setRoomTeams] = useState<string[]>([])
  const [email, setEmail] = useState('')
  const [specialty, setSpecialty] = useState('')

  function addTeam(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault()
    const teamName = name.trim()
    if (!teamName) return
    const creatorEmail = normalizeEmail(currentEmail)
    const creatorProfile = profiles.find((savedProfile) =>
      normalizeEmail(savedProfile.email) === creatorEmail)
    const existingTeamCodes = new Set(usedTeamCodes)
    let teamCode: string
    do {
      teamCode = createJoinCode()
    } while (existingTeamCodes.has(teamCode))
    onUpdate((current) => ({
      ...current,
      teams: [...current.teams, {
        id: crypto.randomUUID(),
        name: teamName,
        teamCode,
        members: [{ email: creatorEmail, name: creatorProfile?.name ?? creatorEmail }],
        createdByEmail: creatorEmail,
      }],
    }))
    setName('')
  }

  function removeMember(teamId: string, memberEmail: string) {
    onUpdate((current) => ({
      ...current,
      teams: current.teams.map((team) => team.id === teamId
        ? { ...team, members: team.members.filter((member) => member.email !== memberEmail) }
        : team),
    }))
  }

  function addRoom(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault()
    const roomName = name.trim()
    if (!roomName) return
    onUpdate((current) => ({
      ...current,
      rooms: [...current.rooms, { id: crypto.randomUUID(), name: roomName, teamIds: roomTeams }],
    }))
    setName('')
    setRoomTeams([])
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
        <form className="event-form inline-form" onSubmit={addTeam}>
          <h2>Add a team</h2>
          <label>Team name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Team Comet" /></label>
          <button className="button button-primary" type="submit">Add team</button>
        </form>
        <div className="section-heading"><div><h2>Teams</h2><p>{event.teams.length} team{event.teams.length === 1 ? '' : 's'}</p></div></div>
        {event.teams.length ? (
          <div className="management-grid">
            {event.teams.map((team) => (
              <article className="management-card" key={team.id}>
                <div className="management-card-heading"><span className="resource-icon" aria-hidden="true">◈</span><div><h3>{team.name}</h3><p>{team.members.length} member{team.members.length === 1 ? '' : 's'}</p></div></div>
                <div className="team-code-display">
                  <span>Static team code · share to invite</span>
                  <code>{team.teamCode}</code>
                </div>
                {team.members.length > 0 && (
                  <ul className="member-list">{team.members.map((member, index) => {
                    const currentProfile = profiles.find((savedProfile) =>
                      member.email && normalizeEmail(savedProfile.email) === normalizeEmail(member.email))
                    return (
                      <li key={`${team.id}-${member.email || index}`}>
                        <span>{currentProfile?.name ?? member.name}</span>
                        {team.createdByEmail &&
                          normalizeEmail(team.createdByEmail) === normalizeEmail(currentEmail) &&
                          member.email &&
                          normalizeEmail(member.email) !== normalizeEmail(currentEmail) && (
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
        ) : <div className="empty-state compact-empty"><h3>No teams yet</h3><p>Add a team above, then share its code to invite members.</p></div>}
      </div>
    )
  }

  if (section === 'rooms') {
    return (
      <div className="management-page">
        <form className="event-form inline-form" onSubmit={addRoom}>
          <h2>Add a room</h2>
          <label>Room name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Room 101" /></label>
          <fieldset className="team-assignment">
            <legend>Assign teams (optional)</legend>
            {event.teams.length ? event.teams.map((team) => (
              <label className="checkbox-label" key={team.id}>
                <input type="checkbox" checked={roomTeams.includes(team.id)} onChange={(change) => setRoomTeams((current) => change.target.checked ? [...current, team.id] : current.filter((id) => id !== team.id))} />
                {team.name}
              </label>
            )) : <p className="form-hint">Create a team first to assign teams to rooms.</p>}
          </fieldset>
          <button className="button button-primary" type="submit">Add room</button>
        </form>
        <div className="section-heading"><div><h2>Rooms</h2><p>{event.rooms.length} room{event.rooms.length === 1 ? '' : 's'}</p></div></div>
        {event.rooms.length ? (
          <div className="management-grid">
            {event.rooms.map((room) => (
              <article className="management-card" key={room.id}>
                <div className="management-card-heading"><span className="resource-icon" aria-hidden="true">⌂</span><div><h3>{room.name}</h3><p>{room.teamIds.length} team{room.teamIds.length === 1 ? '' : 's'} assigned</p></div></div>
                <fieldset className="team-assignment room-assignment">
                  <legend>Assigned teams</legend>
                  {event.teams.length ? event.teams.map((team) => (
                    <label className="checkbox-label" key={team.id}>
                      <input type="checkbox" checked={room.teamIds.includes(team.id)} onChange={(change) => onUpdate((current) => ({
                        ...current,
                        rooms: current.rooms.map((currentRoom) => currentRoom.id === room.id ? {
                          ...currentRoom,
                          teamIds: change.target.checked ? [...currentRoom.teamIds, team.id] : currentRoom.teamIds.filter((id) => id !== team.id),
                        } : currentRoom),
                      }))} />
                      {team.name}
                    </label>
                  )) : <p className="form-hint">Create teams to assign them to this room.</p>}
                </fieldset>
              </article>
            ))}
          </div>
        ) : <div className="empty-state compact-empty"><h3>No rooms yet</h3><p>Add rooms and assign teams to them.</p></div>}
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
          {isSignUp ? 'Already have an account?' : 'New to Mule Hacks?'}{' '}
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
}: {
  events: HackathonEvent[]
  email: string
  onJoinTeam: (code: string) => { eventId: string; teamId: string } | string
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
  onUpdate: (update: (current: HackathonEvent) => HackathonEvent) => void
}) {
  const isCreator = normalizeEmail(team.createdByEmail ?? '') === normalizeEmail(currentEmail)
  const [name, setName] = useState(team.name)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function saveName(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault()
    const nextName = name.trim()
    if (!nextName) {
      setError('Enter a team name.')
      return
    }
    onUpdate((current) => ({
      ...current,
      teams: current.teams.map((currentTeam) =>
        currentTeam.id === team.id ? { ...currentTeam, name: nextName } : currentTeam),
    }))
    setError('')
    setNotice('Team name saved.')
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
          <p className="page-description">{team.members.length} member{team.members.length === 1 ? '' : 's'}</p>
        </div>
        <Link className="button button-secondary" to={`/events/${event.id}/teams`}>Event teams</Link>
      </div>
      <div className="event-join-code team-join-code" aria-label={`Static team code ${team.teamCode}`}>
        <span>Share this static code so others can join</span>
        <code>{team.teamCode}</code>
      </div>
      {isCreator && (
        <form className="event-form team-edit-form" onSubmit={saveName}>
          <h2>Edit team</h2>
          <label>
            Team name
            <input required value={name} onChange={(eventForm) => setName(eventForm.target.value)} />
          </label>
          <button className="button button-primary" type="submit">Save team</button>
        </form>
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
              return (
                <li key={`${member.email || index}`}>
                  <span>
                    <strong>{displayName}</strong>
                    {member.email && <small>{member.email}</small>}
                  </span>
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
  const activeEvent = visibleEvents.find((event) => location.pathname.startsWith(`/events/${event.id}`))
  const teamRouteParts = location.pathname.split('/')
  const teamRouteEvent = visibleEvents.find((event) => event.id === teamRouteParts[2])
  const teamRouteTeam = teamRouteEvent?.teams.find((team) => team.id === teamRouteParts[3])
  const canViewTeamRoute = teamRouteTeam && (
    normalizeEmail(teamRouteTeam.createdByEmail ?? '') === normalizeEmail(profile.email) ||
    teamRouteTeam.members.some((member) =>
      member.email && normalizeEmail(member.email) === normalizeEmail(profile.email))
  )

  function createEvent(details: Omit<HackathonEvent, 'id' | 'joinCode' | 'memberEmails' | 'teams' | 'rooms' | 'mentors'>) {
    const usedCodes = new Set(events.map((event) => event.joinCode))
    let joinCode: string
    do {
      joinCode = createJoinCode()
    } while (usedCodes.has(joinCode))
    const createdEvent: HackathonEvent = {
      ...details,
      id: crypto.randomUUID(),
      joinCode,
      memberEmails: [normalizeEmail(profile.email)],
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

  function updateEvent(eventId: string, update: (current: HackathonEvent) => HackathonEvent) {
    const nextEvents = events.map((event) => event.id === eventId ? update(event) : event)
    try {
      localStorage.setItem(storageKey, JSON.stringify(nextEvents))
    } catch {
      setStorageError('Your changes could not be saved. Check your browser storage settings and try again.')
      return
    }
    setEvents(nextEvents)
    setStorageError('')
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
    if (matchingEvent.teams.some((team) =>
      team.members.some((member) => member.email && normalizeEmail(member.email) === email))) {
      return 'You are already a member of another team in this event.'
    }

    const nextEvents = events.map((event) => event.id === matchingEvent.id
      ? {
        ...event,
        memberEmails: event.memberEmails.includes(email) ? event.memberEmails : [...event.memberEmails, email],
        teams: event.teams.map((team) => team.id === matchingTeam.id
          ? { ...team, members: [...team.members, { email, name: profile.name }] }
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
        <NavLink to="/profile" className="nav-link">
          <span aria-hidden="true">○</span> Profile
        </NavLink>
        <NavLink to="/my-teams" className="nav-link">
          <span aria-hidden="true">◈</span> My teams
        </NavLink>
        <p className="nav-label events-label">EVENTS <span>{visibleEvents.length}</span></p>
        {visibleEvents.length === 0 && <p className="nav-empty">No events joined</p>}
        {visibleEvents.map((event) => {
          const selected = activeEvent?.id === event.id
          return (
            <div className="event-nav-group" key={event.id}>
              <NavLink to={`/events/${event.id}`} className={({ isActive }) => `nav-link event-nav-link${isActive && !location.pathname.endsWith('/teams') && !location.pathname.endsWith('/rooms') && !location.pathname.endsWith('/mentors') ? ' active' : ''}`}>
                <span className="event-nav-dot" aria-hidden="true">✦</span>
                <span className="event-nav-name">{event.name}</span>
              </NavLink>
              {selected && (
                <div className="nested-nav">
                  {sections.map((item) => (
                    <NavLink key={item.slug} to={`/events/${event.id}/${item.slug}`} className={({ isActive }) => `nested-nav-link${isActive ? ' active' : ''}`}>
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <button className="sidebar-add" onClick={() => navigate('/')}>+ Add event</button>
      </aside>
      <main className="content">
        {storageError && <p className="storage-error" role="alert">{storageError}</p>}
        <Routes>
          <Route path="/" element={<Dashboard events={visibleEvents} onCreateEvent={createEvent} onJoinEvent={joinEvent} />} />
          <Route path="/profile" element={<ProfilePage profile={profile} error={profileError} onSave={onProfileSave} />} />
          <Route path="/my-teams" element={<MyTeamsPage events={visibleEvents} email={profile.email} onJoinTeam={joinTeam} />} />
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
            element={activeEvent ? <EventPage event={activeEvent} profiles={profiles} currentEmail={profile.email} usedTeamCodes={events.flatMap((event) => event.teams.map((team) => team.teamCode))} onUpdate={(update) => updateEvent(activeEvent.id, update)} /> : <Navigate to="/" replace />}
          />
          <Route
            path="/events/:eventId/:section"
            element={activeEvent && sections.some((item) => item.slug === location.pathname.split('/').pop()) ? <EventPage event={activeEvent} profiles={profiles} currentEmail={profile.email} usedTeamCodes={events.flatMap((event) => event.teams.map((team) => team.teamCode))} onUpdate={(update) => updateEvent(activeEvent.id, update)} /> : <Navigate to="/" replace />}
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

  function authenticate(
    nextProfile: Profile,
    credential: PasswordCredential,
    isSignUp: boolean,
  ): boolean {
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
