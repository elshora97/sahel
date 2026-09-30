# Deploying for free

| Piece | Where | Free-plan catch |
|---|---|---|
| Web (Next.js) | Vercel Hobby | Non-commercial use only by Vercel's terms |
| API (Go) | Render free web service | Sleeps after 15 min idle; first request then takes ~1 min |
| Database | Supabase Postgres | 500 MB; project pauses after 7 days with no activity |
| Images, receipts | Supabase Storage | 1 GB |

Keep all three in Frankfurt (`eu-central-1` / `frankfurt` / `fra1`): the web
app calls the API, and the API calls the database, on every page.

Deploys after the first one are just `git push` to `master`.

## 1. Supabase

1. Create a project in **Central EU (Frankfurt)**. Save the database password.
2. **Database URL.** Click **Connect**, choose **Session pooler**, copy the URI
   and put the password in. It looks like
   `postgresql://postgres.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`.
   Do not use the *Direct connection*: it is IPv6-only, and Render can't reach it.
3. **Buckets.** Storage → New bucket:
   - `sahel-uploads` with **Public bucket ON** (unit photos)
   - `sahel-uploads-private` with **Public bucket OFF** (payment receipts)
4. **S3 keys.** Project Settings → Storage → *S3 Connection*. Note the
   **Endpoint** (`https://<ref>.supabase.co/storage/v1/s3`) and **Region**
   (`eu-central-1`), then **New access key** and save both halves.

You don't run migrations by hand: the API image applies them every time it starts.

## 2. Render (API)

1. New → **Blueprint** → pick this repo. Render reads `render.yaml`.
2. Fill in the values it asks for:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | Session pooler URI from step 1.2 |
   | `ADMIN_PASSWORD` | Dashboard password, long and random |
   | `S3_ENDPOINT` | `https://<ref>.supabase.co/storage/v1/s3` |
   | `S3_REGION` | `eu-central-1` |
   | `S3_ACCESS_KEY` / `S3_SECRET_KEY` | From step 1.4 |
   | `S3_PUBLIC_URL` | `https://<ref>.supabase.co/storage/v1/object/public/sahel-uploads` |
   | `SMTP_*`, `MAIL_FROM`, `ALERT_EMAIL_TO` | Optional. Leave empty and alerts are only logged |

   `GUEST_SESSION_SECRET` is generated for you.
3. Deploy. The log should show `goose: successfully migrated database`, then
   `api listening`. Open `https://<service>.onrender.com/readyz`; it should
   return `{"status":"ready"}`.

## 3. Vercel (web)

1. Add New → Project → pick this repo. Set **Root Directory** to `web`.
2. Environment variables:

   | Key | Value |
   |---|---|
   | `API_URL` | `https://<service>.onrender.com` |
   | `NEXT_PUBLIC_API_URL` | same |
   | `ADMIN_USERNAME` | `admin`, or whatever you like |
   | `ADMIN_PASSWORD` | same as on Render |

3. Deploy, then open `https://<project>.vercel.app/ar`.

## Keeping it awake (optional)

Point a free monitor (UptimeRobot, cron-job.org) at
`https://<service>.onrender.com/readyz` every 10 minutes. That stops Render
sleeping, and the database query behind `/readyz` stops Supabase pausing.
It also keeps unpaid holds expiring on time: the API expires them once a
minute, but only while it is awake.

## Backups

The free Supabase plan has no downloadable backups. Once a week, from a
machine with Postgres 16 client tools:

```bash
pg_dump "<session pooler URI>" --no-owner | gzip > sahel-$(date +%F).sql.gz
```
