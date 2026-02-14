# Client Portal MVP (Firebase-backed Prototype)

Single-page MVP prototype implementing the requested Client Portal flows with Firebase Firestore + Firebase Authentication.

## Run

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

## Firebase setup

1. Create a Firebase project.
2. Enable **Firestore** and **Authentication** (Email/Password provider).
3. Copy `firebase-config.example.js` to `firebase-config.js` (or edit `firebase-config.js`).
4. Fill in your Firebase web app config values.
5. Deploy Firestore rules from this repo:

```bash
firebase login
firebase use <your-project-id>
firebase deploy --only firestore:rules
```

6. Create at least one admin auth account in Firebase Authentication (Users tab), then ensure that same email exists in portal `users` data with `role: admin`.

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
