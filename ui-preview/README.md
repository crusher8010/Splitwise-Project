# Tally — UI preview

A single self-contained page: the web (1440) and mobile (390) prototypes for this
backend, plus the design system, the edge-case states, and the screen-to-endpoint map.

Nothing to build, no dependencies. `index.html` is the whole site.

## Deploy to Vercel — CLI

From inside this folder:

    npx vercel        # first run: log in, then accept the defaults
    npx vercel --prod # promote to the production URL

When it asks, the answers are:

    Set up and deploy?            yes
    Which scope?                  your account
    Link to existing project?     no
    Project name?                 tally-ui-preview
    In which directory ...?       ./
    Modify build settings?        no      (Framework Preset: Other)

## Deploy to Vercel — from GitHub

1. Push this folder: `git add ui-preview && git commit -m "add UI preview" && git push`
2. vercel.com/new -> import `crusher8010/Splitwise-Project`
3. **Root Directory:** `ui-preview`  ·  **Framework Preset:** Other
4. Leave build and output commands empty, then Deploy.

Every later push to `main` redeploys it.

## Updating it

The page is generated, not hand-edited. Ask Claude to re-publish the canvas and
drop a fresh `index.html` here, then push (or `npx vercel --prod`) again.
