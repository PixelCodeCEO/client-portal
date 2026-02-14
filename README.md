# Client Portal MVP (Spec Prototype)

Single-page MVP prototype implementing the requested Client Portal flows with a mock localStorage data layer.

## Run

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`.

## Demo credentials

- Admin: `admin@portal.dev` / `Admin123!`
- Client (after invite use): `owner@acme.com`

## Implemented highlights

- Invite-only auth with 24h token expiry + first-login password reset for clients.
- Role-based navigation and route separation.
- Client dashboard, project view, deliverable approvals/comments, uploads, messages, settings.
- Admin projects list with filters/search, admin project editing, audit log with CSV export, admin management.
- Frosted glass UI + rounded corners.
- Audit logs are written only by admin actions in the app logic.

## Notes

- This is an MVP prototype and uses browser localStorage rather than a production backend.
- Storage uploads are URL-based metadata entries in this prototype.
