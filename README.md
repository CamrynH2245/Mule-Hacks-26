# Mule Hacks

Event management web app (PWA) for creating hackathon events and managing their teams, rooms, and mentors.

Stack: Vite + React + TypeScript, React Router, vite-plugin-pwa.

Sign-up collects a name, date of birth, email, phone number, and password. In demo mode, multiple accounts and their salted PBKDF2 password verifiers are saved in this browser's local storage under `mule-hacks-profile`. The Profile tab edits the currently signed-in account. Event data is stored separately under `mule-hacks-events`, so merging account/profile changes with event management does not replace either data set. Existing saved account/profile records remain readable. This is not server-backed authentication and should not be used to protect real accounts.

## Run locally
    cd web
    npm install
    npm run dev       # dev server
    npm run build && npm run preview   # test PWA/service worker
