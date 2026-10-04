# Mule Hacks

Admin web app (PWA) for managing hackathon events: teams, rooms, mentors.

Stack: Vite + React + TypeScript, React Router, vite-plugin-pwa.

Sign-up collects a name, date of birth, email, phone number, and password. In demo mode, multiple accounts and their salted PBKDF2 password verifiers are saved in this browser's local storage; sign-in checks the email and password against the matching account. Each email can be used once, and the Profile tab edits the currently signed-in account. This is not server-backed authentication and should not be used to protect real accounts.

## Run locally
    cd web
    npm install
    npm run dev       # dev server
    npm run build && npm run preview   # test PWA/service worker
