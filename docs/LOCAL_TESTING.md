# Local database testing

Ansyra can be tested using a local Supabase stack. This uses your computer, not another hosted project, and keeps test writes away from your hosted data.

## Existing setup on this Mac

A dedicated Colima profile named `ansyra-test` was created with 2 CPUs, 4 GB RAM and a 25 GB virtual disk. It does not mount your home directory or change the default Docker context. Its Supabase project ID is `ansyra-security-test`.

Use Node 22.12 or newer within the project's supported range. In the Ansyra repository:

```sh
export DOCKER_HOST="unix://$HOME/.colima/ansyra-test/docker.sock"
colima start ansyra-test --cpu 2 --memory 4 --disk 25 --activate=false --ssh-config=false --mount none
npx supabase start --exclude realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
npm run test:local:configure
npm run test:local:seed
npm run test:local:integration
npm run test:local:regression
npm run test:local:e2e
```

The local API uses port 54321; PostgreSQL uses 54322. The test configuration command reads the local CLI status, verifies loopback addresses, and saves `.env.test.local` with restricted permissions. It does not print credentials.

The seed creates fictional accounts and synthetic deal records. Local passwords are generated separately in `.env.seed.test.local`; hosted seed credentials in `.env.seed.local` are not reused. Both files are ignored by Git. Do not share either file or commit credentials.

The test runner refuses hosted database/API URLs, replaces live AI with marked mock output, removes AI/email credentials from its process, and prevents dotenv from loading the application's regular `.env`. The hosted database is not reset or seeded by these commands.

Browser tests use the same isolated environment and generated local passwords. Direct `npm run test:e2e` refuses to run without it. Playwright starts its own server on port 3000 with strict port selection and refuses to reuse an existing server. Stop any other application on that port before the run. The suite searches for retained fixture deals so pagination and accumulated scratch rows do not hide them; document workflows open the Documents chapter before interacting with it.

After pulling new migrations, apply them to this stack explicitly with `npx supabase migration up --local` before running the suites. Do not use the linked/hosted migration command for local testing.

`auth.enable_signup = false` closes registration. The local `auth.email.enable_signup = true` setting enables the email provider; the global setting still prevents registration. An integration test checks both email login and rejected signup.

Stop the local stack without deleting its data:

```sh
npx supabase stop --project-id ansyra-security-test
colima stop ansyra-test
```

Avoid `--no-backup`, database reset commands, and hosted seed commands for routine verification.
