# Preview authentication preparation

No remote users or settings were changed. After new-project approval, configure Supabase Auth with
public signup and anonymous sign-in disabled. Provision only explicitly approved test identities
through secure administration, with confirmed email and a securely supplied password. Do not copy
Production users or sessions and do not dispatch invitations/recovery emails as part of setup.

Run the prepared `scripts/preview/bind-test-user.sql` only on that new project, after migration and
runtime-role approval. Supply the approved UUID and normalized email in secure session settings
`preview.approved_auth_user_id` and `preview.approved_email`. The transaction checks auth.users for
that exact confirmed nonanonymous identity, inserts a SALES_USER profile, and adds a row-specific
SELECT RLS policy. A duplicate or conflict aborts; it never silently rebinds an existing identity.
The script must not be put into application startup, migrations, build or seed hooks. The shared
runtime role can read only explicitly approved profiles; it has no access to auth.users.

The deployed application validates the session using the dedicated project's server-side getUser,
then requires an exact pre-bound profile, normalized matching email and a supported application role.
Preview does not autobind by email. Cookies for another project cannot initiate its session lookup.
Missing/wrong project configuration, invalid/expired sessions and unknown roles fail closed. Vercel
local-login bypasses and resource APIs remain denied. Authenticated synthetic review is the supported
screen; external research and integration APIs stay unavailable.

Once the exact branch hostname is assigned, set Auth Site URL to its **exact HTTPS origin** and
allow only `https://<exact-branch-host>/auth/callback` (and the exact deployment callback if the
operator explicitly tests that deployment hostname). No wildcard domain/path callbacks. Password
login requires no Google OAuth change. Recovery emails remain disabled in Preview; if separately
enabled later, review the exact `/auth/reset-password` destination before adding it. Request-origin
handling accepts only Vercel's actual branch/deployment host, not another lookalike project hostname.

Before allowing access: independently verify Vercel Deployment Protection, public unauthenticated
denial, approved password sign-in, denied unapproved account, stale/foreign session denial and
synthetic review rendering. Mocked local tests do not prove live Auth configuration or email delivery.
Rollback by disabling the test identity and removing its row policy/profile under explicit approval;
never change Production Auth. No service-role credential belongs in the runtime deployment.
