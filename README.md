# Mule Hacks

Admin web app (PWA) for managing hackathon events: teams, rooms, mentors.

Stack: Vite + React + TypeScript, React Router, vite-plugin-pwa.

The Profile tab lets users edit their name, birthdate, email, and phone number. Profile details are saved in the browser's local storage; authentication and account syncing are not connected yet.

## Run locally
    cd web
    npm install
    npm run dev       # dev server
    npm run build && npm run preview   # test PWA/service worker
