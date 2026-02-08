# LINE Chatbot Deployment Research: Vercel vs Render (Free Tier)

**Research Date:** February 7, 2026
**Use Case:** Node.js LINE chatbot without container isolation
**Requirements:** Webhooks, LLM API calls, SQLite, cron jobs, per-user memory files

---

## Research Status

**IMPORTANT:** Web search is unavailable in this environment. The information below is based on knowledge through January 2025. You MUST verify all limits and features with current 2026 documentation:

### Manual Research Required

Run these searches to get current 2026 information:

1. **Vercel 2026:**
   - "Vercel pricing 2026" + "free tier limits"
   - "Vercel serverless functions timeout 2026"
   - "Vercel Postgres free tier 2026"
   - "Vercel KV Redis pricing 2026"
   - "Vercel Cron free tier 2026"

2. **Render 2026:**
   - "Render free tier 2026" + "web service specs"
   - "Render persistent disk pricing 2026"
   - "Render sleep policy 2026 free tier"
   - "Render free PostgreSQL 2026"

3. **Alternatives:**
   - "Fly.io free tier 2026"
   - "Railway free tier 2026"
   - "Deno Deploy pricing 2026"
   - "Cloudflare Workers SQLite 2026"

---

## Vercel Free Tier Analysis (as of Jan 2025)

### 1. Serverless Function Limits

**Hobby (Free) Plan:**
- **Execution Time:** 10 seconds maximum
- **Memory:** 1024 MB
- **Payload Size:** 4.5 MB request body, 4.5 MB response body
- **Concurrent Executions:** 1000 per minute

**CRITICAL ISSUE:** 10-second timeout is TOO SHORT for LLM API calls that can take 30-60 seconds.

### 2. Express.js on Vercel

**Possible but Limited:**
```javascript
// vercel.json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/api" }]
}

// api/index.js
const app = require('../src/app'); // Your Express app
module.exports = app;
```

**Issues:**
- Not true Express server - each request is a separate serverless invocation
- No persistent state between requests
- Cold starts on every request after inactivity
- WebSocket support limited

### 3. SQLite on Vercel

**NOT POSSIBLE** (major blocker):
- Serverless functions have **read-only filesystem** (except `/tmp`)
- `/tmp` is ephemeral and wiped between cold starts
- SQLite database would be lost constantly
- **Must use external database:**
  - Vercel Postgres (free tier: 1 database, 256 MB, 60 hours compute/month)
  - Vercel KV (Redis, free tier: 30k commands/month, 256 MB storage)
  - External SQLite hosting (Turso, Cloudflare D1)

### 4. Cron Jobs on Vercel

**Vercel Cron - Available:**
```json
// vercel.json
{
  "crons": [{
    "path": "/api/cron",
    "schedule": "0 9 * * *"
  }]
}
```

**Limitations:**
- Free tier: Limited number of cron jobs (check current docs)
- Still subject to 10-second execution limit
- No guarantees on exact timing
- Cron endpoints must be defined in `vercel.json`

### 5. Persistent Storage

**Options on Vercel:**

| Storage Type | Free Tier | Use Case | Viability |
|--------------|-----------|----------|-----------|
| **Vercel KV** (Redis) | 256 MB, 30k ops/month | Simple key-value | Good for session data |
| **Vercel Postgres** | 256 MB, 60 hrs compute/month | Relational data | Better than SQLite, but limited |
| **Vercel Blob** | NOT free | File storage | Not viable |
| **External (Turso)** | 500 DBs, 9 GB storage | SQLite-compatible | Best SQLite alternative |

### 6. Webhook Handling (LINE)

**Possible but Problematic:**
- LINE webhook expects response within 1 minute (usually faster)
- Vercel cold starts: 1-3 seconds (acceptable)
- But 10-second timeout means you CANNOT wait for LLM response
- **Must use async pattern:**
  1. Acknowledge webhook immediately (200 OK)
  2. Process LLM call in background
  3. Use LINE Push API to send delayed response

**Issue:** No background processing in serverless - need external queue or worker.

### 7. Cold Start Times

**Typical Cold Starts:**
- First request after inactivity: 1-3 seconds
- Warm requests: <100ms
- LINE reply token expires in 1 minute - cold starts are acceptable
- But combined with 10s timeout, can't do synchronous LLM calls

### 8. Free Tier Bandwidth & Limits

**Hobby Plan (as of Jan 2025):**
- **Bandwidth:** 100 GB/month
- **Function Invocations:** Unlimited (but 1000/min concurrency)
- **Build Minutes:** 6000 minutes/year
- **Deployments:** Unlimited
- **Projects:** Unlimited

**Sufficient for personal use (1-5 users).**

### 9. Long-Running API Calls

**CRITICAL BLOCKER:**
- 10-second timeout means NO synchronous LLM calls
- Claude API can take 20-60 seconds for complex responses
- Streaming responses might help but still hit timeout
- **Workaround:** Use Vercel Queue + Background Functions (paid feature)

### 10. Persistent File Storage (Memory Files)

**NOT VIABLE:**
- No persistent filesystem
- Must store in database (Postgres, KV) or external storage (S3, Cloudflare R2)
- Per-user memory files would need to be in database as BLOBs or external storage

---

## Render Free Tier Analysis (as of Jan 2025)

### 1. Free Web Service Specs

**Free Tier:**
- **RAM:** 512 MB
- **CPU:** Shared
- **Storage:** Ephemeral (no persistent disk on free tier)
- **Build Time:** 300 minutes/month
- **Bandwidth:** 100 GB/month

### 2. Sleep Behavior

**CRITICAL LIMITATION:**
- **Spins down after 15 minutes of inactivity**
- **Wake-up time:** 30-60 seconds (cold start)
- LINE webhook might timeout during wake-up
- **Not suitable for webhook-based chatbot** unless you keep it warm (external ping service)

### 3. SQLite Persistence

**NOT AVAILABLE on free tier:**
- Free tier has **ephemeral storage** - wiped on restart
- Persistent disk is **paid feature only** ($0.25/GB/month)
- **Must use external database:**
  - Render PostgreSQL (free tier: 1 instance, 90 days expiry)
  - External SQLite hosting (Turso)

### 4. Node-Cron Support

**YES - Full Support:**
- Render runs persistent Node.js process
- `node-cron` works perfectly
- Cron jobs run reliably (when service is awake)
- **But:** Service sleeps after 15 minutes, cron stops

**Workaround:** Use external cron service (cron-job.org) to ping endpoint and trigger tasks.

### 5. HTTPS & Custom Domain

**YES - Included:**
- Free automatic HTTPS (Let's Encrypt)
- Free `.onrender.com` subdomain
- Custom domain supported (free)

### 6. Free Tier Limits (as of Jan 2025)

- **Web Services:** Unlimited
- **Build Minutes:** 300 minutes/month
- **Bandwidth:** 100 GB/month
- **PostgreSQL:** 1 free database (expires after 90 days)
- **Cron Jobs:** Not officially supported on free tier (use external trigger)

### 7. Deployment

**Easy GitHub Integration:**
```yaml
# render.yaml
services:
  - type: web
    name: line-chatbot
    env: node
    buildCommand: npm install && npm run build
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
```

Auto-deploys on git push.

### 8. Reliability for Webhooks

**POOR for free tier:**
- 30-60 second cold start is too slow for LINE webhooks
- LINE expects response within a few seconds
- Need to keep service warm with external ping (every 10 minutes)
- Even then, might miss webhooks during restarts

### 9. Persistent Disk

**NOT AVAILABLE on free tier:**
- Ephemeral storage only
- Must upgrade to paid plan for persistent disk
- Cheapest: $7/month for web service + $0.25/GB storage

### 10. Auto-Deploy

**YES - Excellent:**
- Connect GitHub repository
- Auto-deploy on push to main branch
- Build logs in dashboard
- Easy rollbacks

---

## Head-to-Head Comparison

| Feature | Vercel Free | Render Free | Winner |
|---------|-------------|-------------|--------|
| **Architecture** | Serverless (stateless) | Always-on (persistent process) | **Render** (better for webhooks) |
| **Execution Time** | 10 seconds | Unlimited | **Render** |
| **SQLite Support** | No (read-only FS) | No (ephemeral storage) | **Tie** (both need external DB) |
| **Cron Jobs** | Yes (Vercel Cron) | Yes (but sleeps) | **Vercel** |
| **Cold Start** | 1-3 seconds | 30-60 seconds | **Vercel** |
| **Sleep Behavior** | No sleep (always ready) | Sleeps after 15 min | **Vercel** |
| **RAM** | 1024 MB | 512 MB | **Vercel** |
| **Persistent Storage** | Vercel KV/Postgres | Must use external | **Vercel** |
| **Long LLM Calls** | 10s timeout (blocker) | No timeout | **Render** |
| **Free HTTPS** | Yes | Yes | **Tie** |
| **Bandwidth** | 100 GB/month | 100 GB/month | **Tie** |
| **Custom Domain** | Yes | Yes | **Tie** |
| **Deploy Ease** | Excellent | Excellent | **Tie** |
| **Webhook Reliability** | Good (if async) | Poor (cold starts) | **Vercel** |
| **Cost After Free** | Starts at $20/month | Starts at $7/month | **Render** |

---

## Critical Analysis

### Vercel Free Tier

#### 1. Can LINE webhooks work reliably?

**PARTIAL YES:**
- Fast cold starts (1-3s) - acceptable for LINE
- Must use **async reply pattern:**
  1. Receive webhook → acknowledge immediately (200 OK)
  2. Process in background (separate invocation or queue)
  3. Use LINE Push API for delayed response
- Cannot use synchronous reply (LINE reply token) due to 10s timeout

**Architecture required:**
```javascript
// Webhook endpoint - immediate response
app.post('/webhook', async (req, res) => {
  res.status(200).end(); // Acknowledge immediately

  // Trigger background processing
  await fetch('https://your-app.vercel.app/api/process', {
    method: 'POST',
    body: JSON.stringify(req.body)
  });
});

// Background processing - separate invocation
app.post('/api/process', async (req, res) => {
  const response = await callLLM(req.body.message); // Can take 30-60s
  await linePushMessage(req.body.userId, response);
  res.status(200).end();
});
```

**Problem:** Background invocation still has 10s timeout. Need external queue or long-running worker.

#### 2. Can SQLite persist data?

**NO - Major Blocker:**
- Read-only filesystem
- Must use:
  - **Vercel Postgres** (free: 256 MB, 60 hrs/month) - better for structured data
  - **Vercel KV** (free: 256 MB, 30k ops/month) - better for simple key-value
  - **Turso** (free: 500 DBs, 9 GB) - SQLite-compatible, best option
  - Rewrite to use Postgres with `pg` or `postgres.js`

**Migration effort:** Moderate to high (need to rewrite DB layer).

#### 3. Can scheduled tasks run reliably?

**YES:**
- Vercel Cron available on free tier
- Still subject to 10s timeout
- Good for quick tasks (cleanup, notifications)
- Not good for long-running tasks (need external scheduler)

#### 4. Is free tier sufficient for 1-5 users?

**MAYBE:**
- Bandwidth: 100 GB/month - plenty
- Invocations: Unlimited - good
- But architectural changes required (async webhooks, external DB)
- Free Postgres: 60 hours compute/month might be tight

#### 5. What happens when limits exceeded?

- Functions stop executing
- Must upgrade to Pro ($20/month)
- No automatic billing - hard cutoff

### Render Free Tier

#### 1. Can LINE webhooks work reliably?

**NO - Critical Failure:**
- 30-60 second cold start after 15 min sleep
- LINE webhook will timeout
- Even with external ping service (every 10 min), might miss webhooks during:
  - Deploys
  - Crashes/restarts
  - Platform maintenance

**Not suitable for webhook-based chatbot.**

#### 2. Can SQLite persist data?

**NO - Major Blocker:**
- Ephemeral storage on free tier
- Persistent disk is paid only ($7/month + $0.25/GB)
- Must use external database:
  - Render PostgreSQL (free, expires after 90 days)
  - Turso (better long-term)

#### 3. Can scheduled tasks run reliably?

**NO on free tier:**
- Service sleeps after 15 min inactivity
- Cron stops when asleep
- Need external cron service to wake service and trigger tasks
- Unreliable for time-sensitive tasks

#### 4. Is free tier sufficient for 1-5 users?

**NO:**
- Sleep behavior makes it unsuitable for webhooks
- 512 MB RAM might be tight
- Need to keep awake with external ping (hacky)
- Better to use paid tier ($7/month)

#### 5. What happens when limits exceeded?

- Service throttled or stopped
- 300 build minutes/month is low (10 min/deploy = 30 deploys)
- Must upgrade to paid plan

---

## Recommendation

### Winner: NEITHER (for your requirements)

**Both free tiers have critical blockers:**

1. **Vercel:** 10-second timeout prevents synchronous LLM calls
2. **Render:** Sleep behavior breaks webhook reliability

### Alternative Approaches

#### Option A: Vercel + Architecture Changes (Recommended for Free)

**Use Vercel with architectural modifications:**

1. **Replace SQLite with Turso (free SQLite-compatible):**
   ```bash
   npm install @libsql/client
   ```
   - 500 databases free
   - 9 GB storage
   - 1 billion row reads/month
   - No timeout issues

2. **Use async webhook pattern:**
   - Acknowledge LINE webhook immediately
   - Store message in queue (Vercel KV or Turso)
   - Separate endpoint processes queue
   - Use LINE Push API for delayed response

3. **Deploy to Vercel:**
   ```bash
   npm install -g vercel
   vercel login
   vercel
   ```

**Pros:**
- Actually free
- No sleep behavior
- Fast cold starts
- Reliable webhooks (with async pattern)

**Cons:**
- Requires code refactoring
- More complex architecture
- Background processing still hits 10s limit (need creative workarounds)

**Viability:** 6/10 - Requires significant changes but doable.

#### Option B: Render Paid ($7/month)

**Upgrade to Render Starter plan:**
- Always-on (no sleep)
- Persistent disk
- Full Express.js support
- SQLite works perfectly
- Cron jobs work reliably
- No timeout on LLM calls

**Pros:**
- Minimal code changes
- True always-on server
- Reliable webhooks
- Simple architecture

**Cons:**
- Not free ($7/month + storage)

**Viability:** 10/10 - Best option if budget allows.

#### Option C: Fly.io Free Tier (Alternative)

**Check current 2026 Fly.io allowances:**
- Historically: 3 VMs with 256 MB RAM free
- Persistent volumes (1 GB free)
- No sleep behavior
- True Docker containers
- **Research:** "Fly.io free tier 2026"

**Pros:**
- Always-on
- Persistent storage
- Docker support
- Better for Node.js apps

**Cons:**
- More complex deployment
- Free tier might be limited in 2026

**Viability:** 8/10 - Strong alternative, verify current limits.

#### Option D: Railway Free Tier (Alternative)

**Check current 2026 Railway allowances:**
- Historically: $5 free credit/month
- Persistent storage
- No sleep behavior
- Easy deployment

**Research:** "Railway free tier 2026"

**Viability:** 7/10 - Good middle ground.

#### Option E: Cloudflare Workers + D1 (Advanced)

**Cloudflare Workers (free tier):**
- 100k requests/day
- 10ms CPU time per request (very limited)
- Cloudflare D1 (SQLite): 100k reads/day free
- Durable Objects for state

**Pros:**
- Generous free tier
- Global edge network
- Native SQLite (D1)

**Cons:**
- 10ms CPU limit even more restrictive than Vercel
- Steep learning curve
- Different API from Node.js

**Viability:** 5/10 - Too restrictive for LLM calls.

---

## Final Recommendation: Hybrid Approach

### Best Solution for Free Deployment

**Use Vercel + Turso + External Worker:**

1. **Frontend (Vercel):**
   - Receive LINE webhooks
   - Acknowledge immediately
   - Write to job queue (Turso or Vercel KV)

2. **Database (Turso):**
   - Free SQLite-compatible database
   - Store user memory, messages, job queue

3. **Worker (GitHub Actions or external):**
   - Poll job queue every 1-5 minutes
   - Process LLM calls (no timeout)
   - Send LINE Push API responses
   - Update database

**Alternative Worker Options:**
- **GitHub Actions:** Free 2000 minutes/month, can run Node.js script every 5 min
- **Modal.com:** Free tier for serverless Python/Node (check 2026 limits)
- **Render Background Worker:** Separate free service just for processing

**Deployment Steps:**

1. **Setup Turso:**
   ```bash
   npm install @libsql/client
   turso db create line-chatbot
   turso db tokens create line-chatbot
   ```

2. **Modify Code:**
   - Replace better-sqlite3 with @libsql/client
   - Add job queue table
   - Split webhook receiver from processor

3. **Deploy to Vercel:**
   ```bash
   vercel
   ```

4. **Setup Worker (GitHub Actions):**
   ```yaml
   # .github/workflows/process-queue.yml
   name: Process LINE Messages
   on:
     schedule:
       - cron: '*/5 * * * *' # Every 5 minutes
     workflow_dispatch:

   jobs:
     process:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - uses: actions/setup-node@v3
         - run: npm ci
         - run: node scripts/process-queue.js
           env:
             TURSO_URL: ${{ secrets.TURSO_URL }}
             TURSO_TOKEN: ${{ secrets.TURSO_TOKEN }}
             LINE_TOKEN: ${{ secrets.LINE_TOKEN }}
             CLAUDE_API_KEY: ${{ secrets.CLAUDE_API_KEY }}
   ```

**Pros:**
- Actually free (Vercel + Turso + GitHub Actions)
- Reliable webhook handling
- No timeouts on LLM calls
- SQLite-compatible database
- Scheduled tasks via GitHub Actions

**Cons:**
- More complex architecture
- 5-minute delay for responses (GitHub Actions interval)
- Requires code refactoring

**Viability:** 9/10 - Most realistic free option.

---

## Step-by-Step Deployment Plan

### Recommended: Vercel + Turso + GitHub Actions

#### Phase 1: Database Migration (Turso)

1. **Create Turso database:**
   ```bash
   curl -L https://turso.tech/install.sh | sh
   turso auth signup
   turso db create line-chatbot
   turso db show line-chatbot
   turso db tokens create line-chatbot
   ```

2. **Update package.json:**
   ```json
   {
     "dependencies": {
       "@libsql/client": "^0.4.0"
     }
   }
   ```

3. **Replace SQLite code:**
   ```javascript
   // Before
   const Database = require('better-sqlite3');
   const db = new Database('chatbot.db');

   // After
   const { createClient } = require('@libsql/client');
   const db = createClient({
     url: process.env.TURSO_URL,
     authToken: process.env.TURSO_TOKEN
   });
   ```

4. **Test locally:**
   ```bash
   export TURSO_URL="libsql://..."
   export TURSO_TOKEN="..."
   npm start
   ```

#### Phase 2: Add Job Queue

1. **Create queue table:**
   ```sql
   CREATE TABLE job_queue (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id TEXT NOT NULL,
     message TEXT NOT NULL,
     reply_token TEXT,
     status TEXT DEFAULT 'pending',
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     processed_at DATETIME
   );
   ```

2. **Modify webhook handler:**
   ```javascript
   app.post('/webhook', async (req, res) => {
     const event = req.body.events[0];

     // Queue job instead of processing immediately
     await db.execute({
       sql: 'INSERT INTO job_queue (user_id, message, reply_token) VALUES (?, ?, ?)',
       args: [event.source.userId, event.message.text, event.replyToken]
     });

     res.status(200).end(); // Acknowledge within 1 second
   });
   ```

3. **Create processor script:**
   ```javascript
   // scripts/process-queue.js
   const { createClient } = require('@libsql/client');
   const Anthropic = require('@anthropic-ai/sdk');
   const line = require('@line/bot-sdk');

   const db = createClient({
     url: process.env.TURSO_URL,
     authToken: process.env.TURSO_TOKEN
   });

   const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
   const lineClient = new line.Client({ channelAccessToken: process.env.LINE_TOKEN });

   async function processQueue() {
     // Get pending jobs
     const jobs = await db.execute({
       sql: 'SELECT * FROM job_queue WHERE status = ? LIMIT 10',
       args: ['pending']
     });

     for (const job of jobs.rows) {
       try {
         // Call LLM (no timeout!)
         const response = await anthropic.messages.create({
           model: 'claude-3-5-sonnet-20241022',
           max_tokens: 1024,
           messages: [{ role: 'user', content: job.message }]
         });

         // Send via LINE Push API (not reply token - it expired)
         await lineClient.pushMessage(job.user_id, {
           type: 'text',
           text: response.content[0].text
         });

         // Mark as processed
         await db.execute({
           sql: 'UPDATE job_queue SET status = ?, processed_at = ? WHERE id = ?',
           args: ['completed', new Date().toISOString(), job.id]
         });
       } catch (error) {
         console.error(`Failed to process job ${job.id}:`, error);
         await db.execute({
           sql: 'UPDATE job_queue SET status = ? WHERE id = ?',
           args: ['failed', job.id]
         });
       }
     }
   }

   processQueue().catch(console.error);
   ```

#### Phase 3: Deploy to Vercel

1. **Create vercel.json:**
   ```json
   {
     "version": 2,
     "builds": [
       {
         "src": "src/index.ts",
         "use": "@vercel/node"
       }
     ],
     "routes": [
       {
         "src": "/(.*)",
         "dest": "src/index.ts"
       }
     ],
     "env": {
       "TURSO_URL": "@turso-url",
       "TURSO_TOKEN": "@turso-token",
       "LINE_CHANNEL_SECRET": "@line-channel-secret",
       "LINE_CHANNEL_TOKEN": "@line-channel-token"
     }
   }
   ```

2. **Deploy:**
   ```bash
   npm install -g vercel
   vercel login
   vercel env add TURSO_URL
   vercel env add TURSO_TOKEN
   vercel env add LINE_CHANNEL_SECRET
   vercel env add LINE_CHANNEL_TOKEN
   vercel --prod
   ```

3. **Configure LINE webhook:**
   - LINE Developers Console → Webhook URL
   - Set to: `https://your-app.vercel.app/webhook`
   - Enable webhook

#### Phase 4: Setup GitHub Actions Worker

1. **Add secrets to GitHub:**
   - Repository → Settings → Secrets
   - Add: TURSO_URL, TURSO_TOKEN, LINE_TOKEN, CLAUDE_API_KEY

2. **Create workflow file:**
   ```bash
   mkdir -p .github/workflows
   ```

3. **Add workflow (see YAML above):**
   ```yaml
   # .github/workflows/process-queue.yml
   name: Process LINE Messages
   on:
     schedule:
       - cron: '*/5 * * * *'
     workflow_dispatch:
   jobs:
     process:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - uses: actions/setup-node@v3
           with:
             node-version: '18'
         - run: npm ci
         - run: node scripts/process-queue.js
           env:
             TURSO_URL: ${{ secrets.TURSO_URL }}
             TURSO_TOKEN: ${{ secrets.TURSO_TOKEN }}
             LINE_TOKEN: ${{ secrets.LINE_TOKEN }}
             CLAUDE_API_KEY: ${{ secrets.CLAUDE_API_KEY }}
   ```

4. **Enable workflow:**
   - Push to main branch
   - GitHub → Actions → Enable workflows
   - Manually trigger first run

#### Phase 5: Testing

1. **Test webhook:**
   ```bash
   curl -X POST https://your-app.vercel.app/webhook \
     -H "Content-Type: application/json" \
     -d '{"events":[{"type":"message","replyToken":"xxx","source":{"userId":"U123"},"message":{"type":"text","text":"Hello"}}]}'
   ```

2. **Check database:**
   ```bash
   turso db shell line-chatbot
   SELECT * FROM job_queue;
   ```

3. **Manually trigger processor:**
   - GitHub → Actions → Process LINE Messages → Run workflow

4. **Monitor logs:**
   - Vercel dashboard for webhook logs
   - GitHub Actions for processor logs

---

## Summary

### Can You Deploy on Free Tier? YES, with caveats

**Vercel + Turso + GitHub Actions = Actually Free**

| Requirement | Solution | Status |
|-------------|----------|--------|
| Webhooks | Vercel serverless | ✅ Works (async pattern) |
| LLM API calls | GitHub Actions worker | ✅ No timeout |
| SQLite | Turso (libSQL) | ✅ Compatible, persistent |
| Cron jobs | GitHub Actions schedule | ✅ Works (5 min interval) |
| Memory files | Turso database | ✅ Store as BLOBs or JSON |
| Free tier | All components free | ✅ $0/month |

**Tradeoffs:**
- 5-minute response delay (GitHub Actions interval)
- More complex architecture
- Need to refactor code

**If you need faster responses (<30 seconds):**
- Pay for Render ($7/month) or Fly.io
- Use modal.com or similar for worker (check 2026 free tier)

**Alternative if you want simpler architecture:**
- Railway ($5 credit/month) - verify 2026 limits
- Fly.io (3 free VMs) - verify 2026 limits
- Render paid ($7/month)

---

## Next Steps

1. **Verify 2026 limits manually:**
   - Visit vercel.com/pricing
   - Visit render.com/pricing
   - Check fly.io, railway.app pricing pages

2. **Choose deployment strategy:**
   - Free complex: Vercel + Turso + GitHub Actions
   - Paid simple: Render Starter ($7/month)

3. **Prototype migration:**
   - Test Turso locally
   - Test job queue pattern
   - Measure response delays

4. **Deploy and monitor:**
   - Start with Vercel free
   - Monitor GitHub Actions usage (2000 min/month)
   - Upgrade if needed

---

**Research completed based on January 2025 knowledge. Please verify all limits and pricing with official 2026 documentation before proceeding.**
