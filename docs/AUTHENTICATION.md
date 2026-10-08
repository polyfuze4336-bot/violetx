# Authentication and authorization (prototype)

Deliberately small: database-backed credentials with NextAuth (JWT sessions), no external identity provider. Authentication (who you are) and authorization (what you may do) are separate.

## Personas

| Persona | How you get in | Read | Write | Private areas (nutrition, notes) |
|---|---|---|---|---|
| `OWNER` (Patient X) | Email + password on `/signin` | yes | **yes** | yes |
| `DEMO_VIEWER` | **View Demo** button, or `demo` / `violetx` | yes (own fictional athlete) | no | yes |
| `COACH_SHARE` | No login: `/share/coach/{random-token}` | yes, limited | no | no |
| `COACH` (legacy signed-in coach) | Email + password | yes | no | no |

The table lives in one place: `CAPABILITIES` in `src/lib/rbac.ts`. `COACH_SHARE` is not a session role; it is the token-authorised page (see the share link code), and share routes also refuse every non-GET method in middleware.

## Authorization (server side, central)

* Every mutation goes through `requireOwner()` / `requireOwnerAthlete()`, which allow only `OWNER`. The demo viewer gets `403 "Demo mode is read only."`, a coach gets a generic 403, and an anonymous caller gets 401.
* Read-only owner-style features the demo may use (asking Violet a question) use `requireOwnerOrDemo()`.
* The UI hides or shows controls from the same table, but nothing relies on that.
* Tests call every exported server action as the demo viewer, a coach, an anonymous/expired session and a demo session after demo mode is switched off, and assert each fails with no database write.

## Sign-in

* `/signin` is a server page: it sends already-signed-in visitors on to their destination, shows a **View Demo** button when `DEMO_MODE_ENABLED=true`, and always renders the form (never a blank screen).
* **View Demo** uses a second NextAuth provider (`demo`) that carries no credentials and can only produce the read-only `DEMO_VIEWER`. The typed `demo` / `violetx` login also works and is compared directly (no slow bcrypt) because the password is public.
* After a successful sign-in the browser does a full navigation to the destination, which avoids stale router caches and redirect loops.
* `?callbackUrl=` is validated by `safeCallbackUrl` (same-site absolute paths only; never `/signin` or other auth pages). Deep links keep their query string.
* Sessions last 8 hours. Expired sessions look like signed-out ones: middleware and the dashboard layout redirect to `/signin?callbackUrl=...`.
* Turning demo mode off (`DEMO_MODE_ENABLED` not `true`) ends demo sessions immediately; they are rejected server-side, not just hidden.
* Unexpected errors show a friendly page (`error.tsx`, `global-error.tsx`, `not-found.tsx`) with a way back.
* Failed owner sign-ins are throttled (5 attempts, 15-minute lock). The shared demo account is never locked.

## Demo and coach share links

See [DEMO-MODE](./DEMO-MODE.md) and the share-link code in `src/lib/services/shareLink.ts`.
