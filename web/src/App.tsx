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

export default function App() {
  return (
    <div className="layout">
      <header className="topbar">Mule Hacks Admin</header>
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
