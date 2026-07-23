# Trinity Netball — Fixtures & Results

Live fixtures, scores and ladder for Trinity Netball Club.  
Hosted on GitHub Pages. Data fetched automatically via GitHub Actions.

## How it works

```
GitHub Actions (runs on schedule)
  └── scripts/fetch-fixtures.js  → public/fixtures.json
  └── scripts/fetch-ladder.js   → public/ladder.json
        ↓ (committed to repo)
GitHub Pages serves public/ as a static website
        ↓
Browser loads index.html → fetches fixtures.json + ladder.json
```

**No server needed. No cloud costs. Completely free.**

## Schedule

| Time | What happens |
|------|-------------|
| Saturday 7:50am–6:10pm AEST | Fixtures refresh every **2 minutes** |
| All other times | Fixtures refresh every **6 hours** |
| After each match completes | Ladder refreshes automatically |
| Manual | Click ↻ buttons on the page, or trigger via GitHub UI |

## Setup

### 1. Create a GitHub repository

1. Go to [github.com](https://github.com) → **New repository**
2. Name it `trinity-netball` (or anything you like)
3. Set it to **Public** (required for free GitHub Pages)
4. Click **Create repository**

### 2. Upload these files

Upload all files maintaining this structure:
```
.github/
  workflows/
    fetch-data.yml
scripts/
  fetch-fixtures.js
  fetch-ladder.js
  package.json
public/
  index.html
  fixtures.json
  ladder.json
README.md
```

The easiest way on Windows:
1. Download [GitHub Desktop](https://desktop.github.com)
2. Clone your new repository
3. Copy all these files into the cloned folder
4. Commit and push

### 3. Add the API key as a secret

1. In your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `SQUADI_API_KEY`
4. Value: `f68a1ffd26dd50c0fafa1f496a92e7b674e07fb0cfab5c778c2cf47cf6f61f785f569274a7a4467b1000b706cb1c830c31bed8ee64c069df2c65667228af22ce4db75452a28ced3ab03a1292b0784691f316b48a2795c208853fc0152b50d14347c468501857a1beb34f86698fbe1118314e414cf1a38af223e707076736a1897554716e4fafd9bb23b8d1939bafc0b92a2f978645916fbf4982b942941b5231b6807a9e5696fd55cd1bd998bcbdf6ab1036ae9a2640764f382e8e1c55123a1685faf3ff4b54a09c6f1a7e5d59962b52d3e6159383914d51d4553de4efd14278be1f2f515303937f85e67e0cd0db650c426984674ebed755f6bcbf97c30a0dba`
5. Click **Add secret**

### 4. Enable GitHub Pages

1. In your repo → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / folder: `/public`
4. Click **Save**
5. Your site will be live at `https://YOUR-USERNAME.github.io/trinity-netball`

### 5. Set your repo name in index.html

Open `public/index.html` and find this line near the bottom:
```js
const GITHUB_REPO = '';  // e.g. 'yourname/trinity-netball'
```
Change it to your actual repo, e.g.:
```js
const GITHUB_REPO = 'smithfamily/trinity-netball';
```
This enables the ↻ manual refresh buttons to trigger the workflow remotely.

### 6. Run the workflow manually to get live data

1. Go to your repo → **Actions** → **Fetch Trinity Fixtures & Ladder**
2. Click **Run workflow** → **Run workflow**
3. Wait ~30 seconds for it to complete
4. Refresh your GitHub Pages site — live data will appear

## Manual refresh

**From the page:** Click ↻ Scores, ↻ Ladder, or ↻ All buttons in the status bar.

**From GitHub:** Actions tab → Fetch Trinity Fixtures & Ladder → Run workflow

**From anywhere (curl):**
```bash
curl -X POST \
  -H "Authorization: token YOUR_GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/YOUR-USERNAME/trinity-netball/actions/workflows/fetch-data.yml/dispatches \
  -d '{"ref":"main","inputs":{"target":"all"}}'
```

## Updating for new seasons

When new fixture data is published on NetballConnect, just run the workflow manually — it will pick up all new rounds automatically. No code changes needed.
