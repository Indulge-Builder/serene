# Serene on Your Phone — Install Guide

> **Purpose:** step-by-step guide to put Serene on your phone's home screen like a real app.
> **Audience:** everyone on the team — no technical knowledge needed (Part 2 and 3).
> Part 1 is for whoever deploys the app.
> **Last updated:** 2026-06-15

Serene is now a PWA (Progressive Web App). That means the website itself can be
installed on your phone. Same app, same login, same data — just full-screen,
with its own icon, launched from your home screen.

No app store. No download from Play Store or App Store. You install it straight
from the browser.

---

## Part 1 — One-time setup (for the person who deploys)

The install feature only works on the **deployed production app**, not on
`localhost` dev mode. Do this once:

1. Make sure the latest code is on the `main` branch (it includes
   `src/app/manifest.ts`, `public/sw.js`, the icons, and the proxy change).
2. Deploy to Vercel as usual (push to `main` → Vercel builds automatically).
3. Wait for the deploy to finish (green check in Vercel).
4. Open the production URL in a normal browser and check these three links
   load without being asked to log in:
   - `https://<your-domain>/manifest.webmanifest` → should show JSON text
   - `https://<your-domain>/sw.js` → should show JavaScript text
   - `https://<your-domain>/icons/icon-192.png` → should show the gold flower icon
5. If all three open fine, you are done. Share the production URL with the team.

> **Important:** the app must be served over **https** (Vercel does this
> automatically). PWAs do not install over plain http.

---

## Part 2 — Install on Android (Chrome)

You need: an Android phone with Chrome.

1. Open **Chrome** on your phone (not inside WhatsApp or Instagram's built-in
   browser — open the real Chrome app).
2. Type the Serene production URL in the address bar and open it.
3. Log in with your Serene email and password (so you know the site works first).
4. Tap the **⋮ three-dot menu** in the top-right corner of Chrome.
5. Tap **"Add to Home screen"** (on newer Chrome it may say **"Install app"**).
6. A small card pops up showing the gold Serene icon and the name **"Serene"**.
   Tap **"Install"** (or **"Add"**).
7. Press your phone's home button. You will see the **Serene icon** on your home
   screen (it may land on the last page — swipe to find it, or check the app
   drawer).
8. Tap the icon. Serene opens **full screen** — no browser address bar, no Chrome
   buttons. It opens straight to the dashboard (or the login page if you are
   signed out).

That's it. From now on, always open Serene from this icon.

> **Tip:** if Chrome shows a banner at the bottom saying "Add Serene to Home
> screen" on its own — even easier, just tap that.

---

## Part 3 — Install on iPhone (Safari)

You need: an iPhone with Safari. **This only works in Safari** — Chrome on
iPhone cannot install apps.

1. Open **Safari** on your iPhone.
2. Type the Serene production URL and open it.
3. Log in once so you know everything works.
4. Tap the **Share button** — the square with an arrow pointing up, at the
   bottom-middle of the screen.
5. Scroll **down** in the share menu until you see **"Add to Home Screen"**.
   Tap it.
6. You'll see the gold Serene icon and the name **"Serene"** already filled in.
   Tap **"Add"** in the top-right corner.
7. Safari closes the menu and the **Serene icon** appears on your home screen.
8. Tap the icon. Serene opens full screen with the dark theme running edge to
   edge — no Safari bars.

> **Note for iPhone:** the very first time you open the installed app you may
> need to log in again — that is normal. iOS gives the installed app its own
> separate login session. After that one login, it stays signed in.

---

## Part 4 — Check everything works (2 minutes)

Do this once after installing, on each phone:

1. **Launch:** tap the icon → app opens full screen to the dashboard. ✅
2. **Login:** if you were signed out, the login page shows, and logging in
   lands you on the dashboard. ✅
3. **Do one real action:** open a lead and add a note, or change a task
   status. It should save normally. ✅
4. **Theme:** go to Profile, switch the theme (e.g. Earth → Water), close the
   app fully, reopen it. The new theme should still be there. ✅
5. **Offline screen:** turn on Airplane Mode, close and reopen the app. You
   should see a dark page saying *"The thread has slipped"* with a Retry
   button — not a browser error. Turn Airplane Mode off, tap **Retry**. ✅

If all five pass, the install is perfect.

---

## Part 5 — What happens after new updates are deployed?

Nothing you need to do. The installed app is still the live website:

- Every time you open it, it loads the **latest deployed version** from the
  internet — same as the browser.
- You never reinstall it for updates. The icon stays, the app updates itself.
- If something ever looks stale right after a deploy, close the app fully
  (swipe it away from recent apps) and open it again.

---

## Part 6 — Pick your home-screen icon

Serene ships with **four** home-screen icons. You choose which one lands on your
phone, both when you first install and any time later.

1. Go to **Profile** (your name in the sidebar → Profile).
2. In the **Appearance** card you'll see the four Serene icons. Tap the one you
   want — your choice saves to your account instantly.
3. Install Serene (Part 2 or Part 3). The icon you picked is the one that goes
   onto your home screen.

> **Already installed and want a different icon?** Change the pick on Profile,
> then **remove the icon from your home screen and add it again.** Once an icon
> is on your home screen, your phone's operating system owns that picture —
> Serene cannot reach in and swap it. Removing and re-adding is the only way to
> refresh it (your account and data are untouched — it's just the shortcut).

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| No "Add to Home screen" / "Install" option on Android | You're probably inside an in-app browser (WhatsApp, Gmail, Instagram). Copy the link and open it in the **real Chrome app**. |
| No "Add to Home Screen" on iPhone | You must use **Safari**, not Chrome. Also scroll further down in the share menu — it's below the first row of options. |
| Install option exists but the icon looks wrong / generic | The deploy may have been mid-way. Wait a minute, refresh the page once, remove the icon, and add it again. |
| App opens but asks to log in every time (iPhone) | Make sure you tap **"Add to Home Screen"** in Safari while logged in, and log in **inside the installed app** once. If it still happens, check that cookies aren't blocked: Settings → Safari → "Block All Cookies" must be **off**. |
| Saving a note / changing a status fails inside the app | Check your internet. If internet is fine, try the same action in the normal browser — if it fails there too, it's an app issue, not an install issue. Report it. |
| App shows old data after a deploy | Pull down to refresh, or close the app fully and reopen. |
| Want to remove the app | Long-press the icon → Remove/Delete, same as any app. Your account and data are untouched — it only removes the shortcut. |

---

## What this is NOT (so nobody is confused)

- It is **not** a Play Store / App Store app. There is nothing to publish or
  review. It's our own web app, installed directly.
- It does **not** work fully offline. Offline you only get the "you're
  offline" screen — all real data needs internet. This is intentional: lead
  data is private per person and is never stored on the phone.
- It **does** send push notifications. Serene now pushes alerts for **lead
  assignment, status changes, SLA alerts, and task reminders** straight to your
  phone — even when the app is closed (iPhone on iOS 16.4+, Android, and
  desktop). The in-app **bell** stays your main notification center; push is
  simply a second way the same alert reaches you. Turn it on under **Profile →
  Notifications**.

> **iPhone note:** Web Push on iOS only works when Serene is **installed to your
> home screen** (Part 3) and opened from that icon. Until you install it, the
> phone cannot send you push notifications — the in-app bell still works either
> way.
