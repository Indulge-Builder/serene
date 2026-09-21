# Use Serene inside Claude or ChatGPT

Written for the Indulge team. Two minutes to set up, then you can ask about your leads, your
tasks, your members and your tickets from inside the AI app you already use.

## What it is

Serene can be added to Claude or ChatGPT as a "connector". Once connected, the AI can look things
up in Serene for you, as you. It sees exactly what you see when you log in to Serene, nothing more.
Phone numbers and emails are hidden from it on purpose. Everything it looks up is logged under
your name.

It can only read. It cannot change a lead, close a ticket or send a message. That comes later.

## What you need

- A Serene account that works.
- Claude Pro or Max (the connector is under Settings), or ChatGPT Plus or Team with Developer
  mode turned on. Free plans cannot add connectors.

## Claude Desktop or claude.ai

1. Settings, then Connectors, then Add custom connector.
2. Name: `Serene`. URL:

   ```text
   https://indulge-serene.vercel.app/api/mcp
   ```

3. Click Connect. A browser tab opens on Serene's login page. Sign in as usual.
4. A screen says which app is asking to use Serene as you. Click Allow.
5. Back in Claude, start a chat and make sure the Serene connector is switched on for it.

## Claude on the phone

Connectors added on claude.ai show up in the Claude app automatically. Sign in to claude.ai on
your phone once and follow the same steps.

## ChatGPT

1. Settings, then Connectors, then Advanced, and turn on Developer mode.
2. Create, paste the same URL, save.
3. Click Connect and follow the same login and Allow screens.

## Claude Code (for the tech team)

```bash
claude mcp add --transport http serene https://indulge-serene.vercel.app/api/mcp
```

Then type `/mcp` in a session to sign in.

## Three things to try first

- "What is on my plate today?" It reads your tasks.
- "Show me my leads that have gone quiet." It reads your leads.
- "Brief me on the member Riya Kapoor before I call her." Concierge team only; it reads the
  member's dossier and last chat.

If a question needs something your role cannot see, the AI will say the tool is not available.
That is correct, not a bug.

## Disconnect

In Serene, open Profile. Under Connected AI apps, click Disconnect next to the app. It loses
access at once. You can connect again any time.

## When it does not work

| What you see | What to do |
| --- | --- |
| No login page opens | Sign out of the connector and connect again. If it repeats, tell the tech team. |
| "No tools" or "not open to your role" | The connector is not switched on for your role yet. Ask a founder. |
| The AI says a tool is not available | Your role does not have that data. Ask a manager. |
| It worked yesterday and asks to sign in again | Normal after a while. Sign in again. |

Questions: the tech team, or ask Elaya inside Serene.
