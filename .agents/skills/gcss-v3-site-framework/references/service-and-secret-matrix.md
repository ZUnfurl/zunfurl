# Service And Secret Matrix

Do not place every credential in every environment. Configure only enabled modules.

| Value | Local `.env` | GitHub Actions | Worker secret/var | Browser-visible |
| --- | --- | --- | --- | --- |
| `SITE_PROFILE` | Yes | Export from project contract | Worker var | No |
| `CONTENT_SOURCE` | Yes | Export from project contract | No | No |
| Sanity project/dataset | Yes | Secret or variable | Webhook config only | Studio project/dataset are public config |
| `SANITY_API_READ_TOKEN` | Private dataset only | Secret | No | Never |
| Storefront domain/token | C only | Secret | No | Studio Storefront token may be public |
| Shopify webhook secret | C only | No | Secret | Never |
| Turnstile site key | Contact only | Secret/variable for build | No | Yes |
| Turnstile secret | Contact only | No | Secret | Never |
| Resend API key | Contact only | No | Secret | Never |
| Recipient/from email | Contact only | No | Secret | Never required in page HTML |
| GitHub dispatch token | Optional local admin | No | Secret | Never |
| `GCSS_COORDINATOR` Durable Object | A2/B/C | No | Generated Worker binding + SQLite migration | Never |
| Cloudflare account/token | Optional local deploy | Actions secret | No | Never |

Write tokens are temporary migration inputs. Do not add them to `.env.example`, Studio browser variables, or normal customer instructions.

Before live setup, record token owner, minimum scope, storage location, rotation owner, and revocation path without recording the token value.

Proxy registration does not make the maintainer the production owner. Every production credential must belong to a client-specific platform resource. Read `platform-ownership-and-handoff.md` before creating accounts or secrets.
