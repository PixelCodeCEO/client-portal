# Client Portal MVP (Firebase-backed Prototype)

Single-page MVP prototype implementing the requested Client Portal flows with Firebase Firestore + Firebase Authentication.

## Run

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

## Firebase setup

1. Create a Firebase project.
2. Enable **Firestore**, **Authentication** (Email/Password provider), and **Storage**.
3. Copy `firebase-config.example.js` to `firebase-config.js` (or edit `firebase-config.js`).
4. Fill in your Firebase web app config values.
5. Set `publicAppUrl` in `firebase-config.js` to your deployed domain (e.g. `https://portal.keylinestudios.com`) so invite links always point to production.
6. Deploy Firestore rules from this repo:

```bash
firebase login
firebase use <your-project-id>
firebase deploy --only firestore:rules,storage:rules
```

7. Create at least one admin auth account in Firebase Authentication (Users tab), then ensure that same email exists in portal `users` data with `role: admin`.

The app uses Firestore document `portal/state` for shared, real-time data.

## Do I need to manually create collections/documents?
- **No** for Firestore state: if rules allow writes, the app auto-creates `portal/state`.
- **Yes** for auth users: login/password/delete account require real Firebase Auth users.

## Account settings that now actually work
- Change password: uses Firebase Auth `reauthenticateWithCredential` + `updatePassword`.
- Delete account: uses Firebase Auth `reauthenticateWithCredential` + `deleteUser`.

## Notes

- This remains an MVP and still stores role/profile metadata in Firestore state.
- Admin management currently adds/removes Firestore role metadata only; creating admin Auth users should be done in Firebase Console (or backend/admin SDK).
- `firestore.rules` currently allows full access for MVP bootstrap. Lock this down before production.


## Admin project onboarding
- Admin can create a client project and generate a single-use invite link from the Projects page.
- UI now provides a single copyable invite link field (no full list).
- When invitee opens link and activates invite, they are prompted for project onboarding details (scope summary, max budget, logo URL, image URLs) which are written to their pending project.

## File uploads (no URL required)
- Files page now supports direct file uploads to Firebase Storage (URL field is optional fallback).
- Invite onboarding also supports optional logo/image file uploads in addition to optional URLs.
- `Max budget` and project image uploads are optional during invite activation.
