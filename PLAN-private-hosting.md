# Private Hosting — Contingency Plan

Move the study hub off public GitHub Pages and behind an authentication gate, so the
question banks stop being served to the open internet.

> **Status: NOT SCHEDULED.** Deliberately out of scope for the practice-tests merge
> (see [PLAN-practice-tests.md](PLAN-practice-tests.md)). Written up so the decision
> and its costs survive; pick it up only if one of the triggers below fires.
>
> Drafted 2026-08-10.

## Why this is parked

The exam horizon is roughly one month, after which the whole thing gets dismantled.
Against that, this plan costs a progress migration across two devices, an auth smoke
test on both phones, and a PWA re-install — to close a low-probability risk.

The cheap mitigation shipped instead: `<meta name="robots" content="noindex">` on
every page (Phase 4 of the main plan). That removes discoverability. It does **not**
change the legal position — the site still serves both banks publicly to anyone
holding the URL.

## Triggers — pick this up if

- A takedown notice or any contact from either source site arrives.
- The timeline slips well past the exam and the repo becomes long-lived.
- The app gets shared beyond the two of you.
- You decide the residual risk isn't worth carrying after all.

## Hard prerequisite

**Phase 1 of the main plan (export / import) must be shipped and tested first.**

Every option here changes the origin. `localStorage` is origin-scoped, so the moment
you move hosts, all progress becomes invisible — not deleted, just stranded on an
origin nobody visits again. Export/import is the only bridge across. Do not start
this plan until a real export → wipe → import restore has been done on a device.

---

## Option A — Azure Static Web Apps *(preferred if she has a Microsoft account)*

Free tier. Deploys from a **private** GitHub repo, so the repo goes private at no
cost — cheaper than GitHub Pro, which would have left the site public anyway.

Confirmed against the
[SWA auth docs](https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-authorization):
*"All features listed in this article are available in all Static Web Apps plans"* —
roles, invitations and route guards all work on Free.

### Shape

1. Create the SWA resource, point it at the private repo. Azure writes the GitHub
   Actions workflow itself. App location `/`, no API, no build step.
2. Add `staticwebapp.config.json` at the repo root:

   ```json
   {
     "routes": [{ "route": "/*", "allowedRoles": ["study"] }],
     "responseOverrides": {
       "401": {
         "redirect": "/.auth/login/aad?post_login_redirect_uri=.referrer",
         "statusCode": 302
       }
     }
   }
   ```

3. Invite both email addresses to the custom `study` role from the portal.
4. Flip the GitHub repo to private and disable GitHub Pages.

### The trap

The preconfigured Entra ID provider **lets any Microsoft account sign in**. The
`allowedRoles` gate is the only thing restricting it to the two of you. Ship the
config file in the same commit as the migration, or you have published a login page
that admits the entire internet — strictly worse than where you started.

### Cost

Your wife needs a Microsoft or GitHub account. Any Outlook, Hotmail, Live, Xbox or
Skype address already is one.

## Option B — Cloudflare Access *(preferred if she has neither)*

Cloudflare Pages serves the private repo; Cloudflare Access gates it with one-time
PINs emailed to an allowlist. No account of any kind — she receives a code and enters
it. Free tier covers up to 50 users.

Strictly less friction than Option A at the sign-in step; one more vendor to
configure.

## Option C — GitHub Pro

**Rejected.** ~$4/month makes the *repo* private but leaves the published site fully
public — GitHub's own docs: *"GitHub Pages sites are publicly available on the
internet, even if the repository for the site is private."* Access-controlled Pages
requires Enterprise Cloud and an organization. Pays for the smaller half of the
problem.

---

## Migration checklist

The origin change is the dangerous part. Order matters.

1. **Export progress on every device** — yours and hers are separate `localStorage`
   stores on separate phones. Two exports, two files, both saved somewhere off-device.
2. Deploy to the new origin with the auth gate **already configured**.
3. Verify the gate: sign in as each user; confirm a third, uninvited account is
   refused.
4. Import on each device, then verify test bests, drill streak, open mistakes and SR
   due-count against the pre-migration numbers.
5. Re-install the PWA to the home screen on both phones — a new origin is a new
   install.
6. **Delete the old home-screen install.** It still points at the old origin, and its
   `localStorage` and service-worker cache are still live there. Tapping the stale
   icon out of habit means studying into a copy whose progress goes nowhere.
7. Leave GitHub Pages up for a few days as a fallback, then disable it.

## Known risks

| Risk | Notes |
| --- | --- |
| Progress stranded on the old origin | Mitigated only by export/import. The single most likely way to lose everything. |
| Stale home-screen icon after migration | Step 6. Easy to skip, silently splits your progress across two origins. |
| PWA behind an auth gate | An expired session mid-drill can land an installed PWA on a blank screen. The service worker's `res.type === "basic"` guard stops it caching login redirects, but this needs a real test on both phones — budget an hour, not five minutes. |
| Offline use after auth | Cached content still serves offline, but first load after a session expiry needs connectivity. |
| Uninvited-user lockout | Confirm the invitation flow works for her *before* disabling GitHub Pages. |
