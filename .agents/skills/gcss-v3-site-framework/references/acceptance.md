# Acceptance

## Automated Gate

- Skill and all references validate.
- Project contract rejects unsupported profiles, locales, feature combinations, and source choices.
- Initialization is deterministic and does not write without `--write`.
- Project readiness scan finds no unresolved generic placeholders in required delivery files.
- A1, A2, B, and C profile matrices build from local fixtures.
- Worker dry-run package validates without real deployment.

## UI Gate

- Navigation and routes match active profile and locales.
- B Studio exposes page operations but no product operations.
- C Studio exposes page and product operations.
- A does not require Studio.
- Module order and labels preserve the Sanity-to-Astro one-to-one model.

## Authorized Live Gate

- B/C production build reads the selected Sanity dataset.
- Contact sends one test email, honors Reply-To, rejects abuse, and stores no message body.
- C product picker reads Headless-published products.
- Sanity publish produces one permitted rebuild-request receipt and zero automatic deployments.
- Shopify structural change produces the permitted receipt; price/inventory/order changes do not produce a request.
- A maintainer separately authorizes one manual Deploy from `main`; the production Environment is armed and its plan-dependent remote protection is recorded before the run.

## Ownership And Handoff Gate

- The production repository was created from the public framework Template repository as an independent Private repository inside the client GitHub Organization; it is not a Fork, ZIP import, or copied working tree.
- The production repository has belonged to the client GitHub Organization since project initialization.
- Every enabled production platform is isolated as a client asset; disabled profile platforms were not provisioned.
- The client controls owner access, account recovery, MFA, billing, and at least one tested production deployment path; this does not claim framework-provided production backup or disaster recovery.
- Maintainer-owned temporary credentials are removed or rotated before handoff.
- The authorized client administrator receives the platform asset register separately from the daily operations manual.

Record validation evidence and remaining manual substitutions before customer handoff.
