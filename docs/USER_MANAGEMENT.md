# User management

DGC donor: deployed v61 `03_Auth.js`, `manageCreateUser`, `manageUpdateUserStatus`, `manageResetUserPassword`; management is restricted to BOD and inactive users cannot log in. ERP Core uses the existing tenant-scoped USER/ROLE permissions and email login rather than introducing a second identity system.

- Lists are paginated at 10 users, searchable by name/email and filtered by status.
- USER_CREATE creates an account; USER_EDIT edits the profile/role assignments and resets passwords; USER_DISABLE activates/deactivates; USER_VIEW reads profiles and effective role definitions. ROLE_CREATE creates a reusable permission bundle.
- A role may contain only permissions held by its creator; assignments cannot grant permissions beyond those held by the actor. Existing role definitions are not changed by editing a user.
- Self-deactivation and self-role replacement are blocked. A tenant must retain an active ADMIN. Tenant-level transaction locking protects concurrent changes.
- Mutations require session, permission, origin and CSRF checks; existing records require updatedAt concurrency checks. No hard user deletion is implemented, preserving financial references.
- Passwords retain ERP Core's 15-character minimum and salted scrypt storage rather than DGC's older SHA-256/6-character policy. Passwords/hashes never appear in list responses or audit events. Reset/deactivation revokes sessions; modifying another user's profile/roles also revokes their sessions.
- No users, passwords or permissions were changed in staging as part of verification. `apps/api/tests/users-workflow.mjs` exercises real routes with isolated delegates.
