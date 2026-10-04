import { useState, type FormEvent } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'

type HackathonEvent = {
  id: string
  name: string
  date: string
  location: string
  teams: Team[]
  rooms: Room[]
  mentors: Mentor[]
}

type Team = { id: string; name: string; members: string[] }
type Room = { id: string; name: string; teamIds: string[] }
type Mentor = { id: string; name: string; email: string; specialty: string }

function isTeam(value: unknown): value is Team {
  if (typeof value !== 'object' || value === null) return false
  const team = value as Record<string, unknown>
  return typeof team.id === 'string' &&
    typeof team.name === 'string' &&
    Array.isArray(team.members) &&
    team.members.every((member: unknown) => typeof member === 'string')
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
const sections = [
  { slug: 'teams', label: 'Teams', description: 'Create and manage teams for this event.' },
  { slug: 'rooms', label: 'Rooms', description: 'Set up rooms and assign teams for this event.' },
  { slug: 'mentors', label: 'Mentors', description: 'Track mentor locations and assignments for this event.' },
]

function loadEvents(): { events: HackathonEvent[]; error: string } {
  try {
    const savedEvents: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(savedEvents)) {
      return { events: [], error: 'Saved events could not be loaded because the stored data is invalid.' }
    }
    const events = savedEvents.filter(
      (event): event is Record<string, unknown> & { id: string; name: string; date: string; location: string } =>
        typeof event?.id === 'string' &&
        typeof event?.name === 'string' &&
        typeof event?.date === 'string' &&
        typeof event?.location === 'string',
    ).map((event): HackathonEvent => ({
      id: event.id,
      name: event.name,
      date: event.date,
      location: event.location,
      teams: Array.isArray(event.teams) ? event.teams.filter(isTeam) : [],
      rooms: Array.isArray(event.rooms) ? event.rooms.filter(isRoom) : [],
      mentors: Array.isArray(event.mentors) ? event.mentors.filter(isMentor) : [],
    }))
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
}: {
  events: HackathonEvent[]
  onCreateEvent: (event: Omit<HackathonEvent, 'id' | 'teams' | 'rooms' | 'mentors'>) => void
}) {
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onCreateEvent({ name: name.trim(), date, location: location.trim() })
    setName('')
    setDate('')
    setLocation('')
    setFormOpen(false)
  }

  return (
    <section className="dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">EVENT HOSTING</p>
          <h1>Dashboard</h1>
          <p className="page-description">Create and manage your hackathon events.</p>
        </div>
        <button className="button button-primary" onClick={() => setFormOpen(!formOpen)}>
          {formOpen ? 'Cancel' : '+ Add event'}
        </button>
      </div>

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
  onUpdate,
}: {
  event: HackathonEvent
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
      </div>
      {activeSection ? (
        <EventResources event={event} section={activeSection.slug} onUpdate={onUpdate} />
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
  section,
  onUpdate,
}: {
  event: HackathonEvent
  section: string
  onUpdate: (update: (current: HackathonEvent) => HackathonEvent) => void
}) {
  const [name, setName] = useState('')
  const [memberNames, setMemberNames] = useState<Record<string, string>>({})
  const [memberErrors, setMemberErrors] = useState<Record<string, string>>({})
  const [roomTeams, setRoomTeams] = useState<string[]>([])
  const [email, setEmail] = useState('')
  const [specialty, setSpecialty] = useState('')

  function addTeam(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault()
    const teamName = name.trim()
    if (!teamName) return
    onUpdate((current) => ({
      ...current,
      teams: [...current.teams, { id: crypto.randomUUID(), name: teamName, members: [] }],
    }))
    setName('')
  }

  function addMember(eventForm: FormEvent<HTMLFormElement>, teamId: string) {
    eventForm.preventDefault()
    const memberName = (memberNames[teamId] ?? '').trim()
    if (!memberName) {
      setMemberErrors((current) => ({ ...current, [teamId]: 'Enter a member name.' }))
      return
    }
    onUpdate((current) => ({
      ...current,
      teams: current.teams.map((team) => team.id === teamId ? { ...team, members: [...team.members, memberName] } : team),
    }))
    setMemberNames((current) => ({ ...current, [teamId]: '' }))
    setMemberErrors((current) => ({ ...current, [teamId]: '' }))
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
                {team.members.length > 0 && <ul className="member-list">{team.members.map((member, index) => <li key={`${team.id}-${index}`}>{member}</li>)}</ul>}
                <form className="member-form" onSubmit={(eventForm) => addMember(eventForm, team.id)}>
                  <label htmlFor={`member-${team.id}`}>Add a member</label>
                  <div className="input-action">
                    <input id={`member-${team.id}`} value={memberNames[team.id] ?? ''} onChange={(event) => setMemberNames((current) => ({ ...current, [team.id]: event.target.value }))} placeholder="Member name" />
                    <button className="button button-secondary" type="submit">Add</button>
                  </div>
                  {memberErrors[team.id] && <p className="field-error" role="alert">{memberErrors[team.id]}</p>}
                </form>
              </article>
            ))}
          </div>
        ) : <div className="empty-state compact-empty"><h3>No teams yet</h3><p>Add a team above, then add its members.</p></div>}
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

function App() {
  const [initialState] = useState(loadEvents)
  const [events, setEvents] = useState(initialState.events)
  const [storageError, setStorageError] = useState(initialState.error)
  const location = useLocation()
  const navigate = useNavigate()
  const activeEvent = events.find((event) => location.pathname.startsWith(`/events/${event.id}`))

  function createEvent(details: Omit<HackathonEvent, 'id' | 'teams' | 'rooms' | 'mentors'>) {
    const createdEvent: HackathonEvent = { ...details, id: crypto.randomUUID(), teams: [], rooms: [], mentors: [] }
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

  return (
    <div className="layout">
      <header className="topbar">
        <Link to="/" className="brand-mark" aria-label="Event Hosting dashboard">E</Link>
        <Link to="/" className="brand-name">Event Hosting</Link>
      </header>
      <aside className="sidebar">
        <p className="nav-label">WORKSPACE</p>
        <NavLink to="/" end className="nav-link">
          <span aria-hidden="true">▦</span> Dashboard
        </NavLink>
        <p className="nav-label events-label">EVENTS <span>{events.length}</span></p>
        {events.length === 0 && <p className="nav-empty">No events created</p>}
        {events.map((event) => {
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
          <Route path="/" element={<Dashboard events={events} onCreateEvent={createEvent} />} />
          <Route
            path="/events/:eventId"
            element={activeEvent ? <EventPage event={activeEvent} onUpdate={(update) => updateEvent(activeEvent.id, update)} /> : <Navigate to="/" replace />}
          />
          <Route
            path="/events/:eventId/:section"
            element={activeEvent && sections.some((item) => item.slug === location.pathname.split('/').pop()) ? <EventPage event={activeEvent} onUpdate={(update) => updateEvent(activeEvent.id, update)} /> : <Navigate to="/" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
