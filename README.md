# Client Portal MVP (Firebase-backed Prototype)

Single-page MVP prototype implementing the requested Client Portal flows with Firebase Firestore as the primary live data store.

## Run

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

## Firebase setup

1. Create a Firebase project.
2. Enable Firestore.
3. Copy `firebase-config.example.js` to `firebase-config.js` (or edit the existing `firebase-config.js`).
4. Fill in your Firebase web app config values.
5. Start the app.

The app uses Firestore document `portal/state` for shared, real-time data.

If Firebase config is invalid/unavailable, the app automatically falls back to localStorage mode.

## Demo credentials (seeded in app state)

- Admin: `admin@portal.dev` / `Admin123!`
- Client (after invite use): `owner@acme.com`

## Implemented highlights

- Invite-only auth flow (app-level logic), token expiry + first-login password reset for clients.
- Role-based navigation and route separation.
- Client dashboard, project view, deliverable approvals/comments, uploads, messages, settings.
- Admin projects list with filters/search, admin project editing, audit log with CSV export, admin management.
- Admin analytics HUD strip with live metric filters.
- Frosted glass UI + rounded corners.
- Firestore-backed live updates and persistence for shared portal state.

## Notes

- This remains an MVP prototype and currently keeps auth logic in-app while persisting data in Firestore.
- Storage uploads are URL-based metadata entries in this prototype.
