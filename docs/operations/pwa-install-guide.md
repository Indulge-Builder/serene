# Serene on Your Phone: Install Guide

> **Purpose:** step-by-step guide to put Serene on your phone's home screen like a real app.
> **Audience:** everyone on the team, no technical knowledge needed (Parts 2 to 6). Part 1 is for whoever deploys the app.
> **Source-of-truth scope:** installing the app and picking its icon. How push works under the hood: `../modules/web-push.md`. The phone layout itself: `../modules/mobile-ops.md`.
> **Last verified:** 2026-09-26 against `src/app/manifest.ts`, `src/app/api/manifest/route.ts`, `src/lib/constants/app-icons.ts`, `public/sw.js`, `public/offline.html`, `public/icons/`, `src/components/profile/InstallPrompt.tsx` and `IconSelector.tsx`, the /profile page layout, `src/app/(dashboard)/dashboard/page.tsx` (the phone redirect), `src/proxy.ts`.

Serene is a PWA (Progressive Web App). The website itself can be installed on your phone. Same
app, same login, same data, just full screen, with its own icon, launched from your home screen.

No app store. Nothing to download from the Play Store or App Store. You install it straight from
the browser.

---

## Part 1: One-time check (for the person who deploys)

The install only works on the **deployed production app**, not on `localhost` (the service
worker registers in production only).

1. Deploy to Vercel as usual (push to `main`; Vercel builds automatically) and wait for the
   deployment to show Ready.
2. Open the production URL in a normal browser and check these links load without asking you to
   log in:
   - `https://<your-domain>/manifest.webmanifest` shows JSON text
   - `https://<your-domain>/sw.js` shows JavaScript text
   - `https://<your-domain>/icons/icon-192.png` shows the Serene mark on a white square
3. If all three open, you are done. Share the production URL with the team.

> **Important:** the app must be served over **https** (Vercel does this automatically). A PWA
> does not install over plain http.

---

## Part 2: Install on Android (Chrome)

You need an Android phone with Chrome.

1. Open **Chrome** on your phone (not the browser inside WhatsApp or Instagram; open the real
   Chrome app).
2. Open the Serene production URL and log in with your Serene email and password.
3. The easy way: go to **Profile** (your name in the sidebar), find the **Add to Home Screen**
   card and tap **Add to home screen**. It installs with the icon you picked (Part 6). (The
   button only shows when Chrome is ready to install and the app is not installed yet.)
4. Or the menu way: tap the **⋮ three-dot menu** at the top right, then **"Add to Home screen"**
   (newer Chrome may say **"Install app"**), then **Install** (or **Add**).
5. Go to your home screen. The **Serene icon** is there (it may land on the last page or in the
   app drawer).
6. Tap the icon. Serene opens **full screen**, with no address bar.

From now on, open Serene from this icon.

> **Tip:** if Chrome shows its own banner saying "Add Serene to Home screen", just tap that.

---

## Part 3: Install on iPhone (Safari)

You need an iPhone with Safari. **This only works in Safari**; Chrome on iPhone cannot install
apps.

1. Open **Safari** on your iPhone.
2. Open the Serene production URL and log in once so you know everything works.
3. Tap the **Share button** (the square with an arrow pointing up, bottom middle of the screen).
   The **Add to Home Screen** card on your Profile page shows the same steps.
4. Scroll **down** in the share menu and tap **"Add to Home Screen"**.
5. You will see the Serene icon and the name **"Serene"** already filled in. Tap **"Add"** at the
   top right.
6. The **Serene icon** appears on your home screen.
7. Tap the icon. Serene opens full screen, edge to edge, with no Safari bars.

> **Note for iPhone:** the first time you open the installed app you may need to log in again.
> That is normal: iOS gives the installed app its own login session. After that one login it
> stays signed in.

---

## Part 4: Check everything works (2 minutes)

Do this once after installing, on each phone:

1. **Launch:** tap the icon. The app opens full screen. Most people land on the dashboard.
   Admins and founders on a phone land on the pocket layout (`/m`) instead; its drawer (open it
   with the round mark at the top) has **View desktop site** if you want the full dashboard.
2. **Login:** if you were signed out, the login page shows, and logging in takes you in.
3. **Do one real action:** add a note or change a task status. It should save normally.
4. **Look:** go to Profile, switch the theme (for example Earth to Water) or Light / Dark / Auto,
   close the app fully and reopen it. Your choice should still be there.
5. **Offline screen:** turn on Airplane Mode, close and reopen the app. You should see a dark page
   saying *"The thread has slipped."* with a **Retry** button, not a browser error. Turn Airplane
   Mode off and tap **Retry**.

If all five pass, the install is good.

---

## Part 5: What happens after new updates are deployed?

Nothing you need to do. The installed app is the live website:

- Every time you open it, it loads the **latest deployed version**.
- You never reinstall for updates.
- If something looks stale right after a deploy, close the app fully (swipe it away) and open it
  again.

The one exception is the **icon**: see Part 6.

---

## Part 6: Pick your home-screen icon

Serene ships with **four** home-screen icons. The default (Icon 1) is the Serene mark on a white
square (since 2026-09-26: a shortcut cannot be transparent, and an iPhone paints black behind a
transparent icon). The other three picks sit on a cream square.

1. Go to **Profile**.
2. In the **Appearance** card you will see the four icons. Tap the one you want; it saves to your
   account at once.
3. Install Serene (Part 2 or Part 3). The icon you picked is the one that goes on your home
   screen.

> **Already installed and want a different icon?** Change the pick on Profile, then **remove the
> icon from your home screen and add it again.** Once an icon is on your home screen your phone
> owns that picture, and Serene cannot swap it. Removing and re-adding is the only way to refresh
> it (your account and data are untouched; it is just the shortcut). The same applies after an
> icon redesign: a shortcut added before 2026-09-26 keeps the older cream or black icon until it
> is re-added. Android sometimes refreshes on its own within a few days; iPhone never does.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| No "Add to Home screen" / "Install" option on Android | You are probably inside an in-app browser (WhatsApp, Gmail, Instagram). Copy the link and open it in the **real Chrome app**. |
| No "Add to Home Screen" on iPhone | You must use **Safari**, not Chrome. Scroll further down in the share menu; it is below the first row. |
| The icon looks wrong or old | Remove the icon and add it again (Part 6). If a deploy was in progress, wait a minute and refresh once first. |
| App asks to log in every time (iPhone) | Log in **inside the installed app** once. If it keeps happening, check Settings → Safari → "Block All Cookies" is **off**. |
| Saving a note or changing a status fails inside the app | Check your internet. If it is fine, try the same action in the normal browser. If it fails there too, it is an app issue, not an install issue. Report it. |
| App shows old data after a deploy | Pull down to refresh, or close the app fully and reopen. |
| Want to remove the app | Long-press the icon, then Remove / Delete, like any app. Your account and data are untouched. |

---

## What this is NOT (so nobody is confused)

- It is **not** a Play Store or App Store app. There is nothing to publish or review.
- It does **not** work offline. Offline you only get the "you're offline" screen; all real data
  needs internet. This is on purpose: every page is private to the person looking at it and is
  never stored on the phone.
- It **does** send push notifications, even when the app is closed (iPhone on iOS 16.4 or later,
  Android and desktop). Anything that lands in your in-app **bell** can also arrive as a push:
  leads, tasks and reminders, tickets, and for founders Elaya's brief. The bell stays your main
  notification centre; push is a second way the same alert reaches you. Turn it on under
  **Profile → Notifications**, where you can also choose which kinds of alert you get.

> **iPhone note:** push on iOS only works when Serene is **installed to your home screen**
> (Part 3) and opened from that icon. Until then the Notifications card shows an "Add to Home
> Screen" hint instead of an Enable button. The in-app bell works either way.
