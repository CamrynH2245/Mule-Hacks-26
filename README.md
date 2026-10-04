# Mule Hacks

Event management web app (PWA) for creating hackathon events and managing their teams, rooms, and mentors.

Stack: Vite + React + TypeScript, React Router, vite-plugin-pwa.

Sign-up collects a name, date of birth, email, phone number, and password. In demo mode, multiple accounts and their salted PBKDF2 password verifiers are saved in this browser's local storage under `mule-hacks-profile`. The Profile tab edits the currently signed-in account. The My teams tab lists teams the signed-in user created and teams they belong to; users can join a team by entering its static team code, which is displayed in the team workspace for sharing. Team creators are automatically added to their team roster and can remove other profiles. Team creators can edit the team name, and members can view the roster. Event creators can share the event's join code, and other accounts in this browser can join from the dashboard; event workspaces appear only for accounts that created or joined them. Event data is stored separately under `mule-hacks-events`; existing events and teams are assigned codes when loaded. Since this demo uses browser-local storage rather than a server, event and team codes do not share data across different browsers or devices. This is not server-backed authentication and should not be used to protect real accounts.

## Run locally
    cd web
    npm install
    npm run dev       # dev server
    npm run build && npm run preview   # test PWA/service worker
