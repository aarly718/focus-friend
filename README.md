# Focus Friend

A Chrome extension that turns studying into a game. Pick a session length and a cute floating animal buddy keeps you company on ordinary webpages, while Chrome's side panel holds the full dashboard. Wander onto a distracting site and your buddy gets nervous and loses health. Finish the timer to earn points, then spend them on accessories, colors, and new animals.

**Judge demo:** enable Demo mode and demo unlocks, choose **Prepare judge demo**, start a short session, visit one productive and one distracting site, then use **Demo: next mood** to show okay → sad → stressed → final warning → fainted. Rescue the buddy, show the nearly-complete streak, and briefly open the Shop to show pets and accessories.

## Install (developer mode)

1. Download or clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder (the one containing `manifest.json`).
4. Refresh any webpages that were already open so Chrome can add the floating buddy.
5. Click the Focus Friend icon in the toolbar. The side panel opens; the buddy also appears in the lower-left corner of ordinary webpages.

Requires Chrome 116 or newer (side panel support). After editing code, click the refresh icon on the extension's card, then refresh any already-open webpages so Chrome replaces their old content scripts. Stale widgets now shut themselves down safely if an extension reload invalidates their context.

### Demo mode

Real sessions are at least 15 minutes, which is slow for a live demo. In **Settings**, turn on **Demo mode**: session time runs 30x faster, health drains at 10x so each mood remains readable, and 1-minute sessions are allowed. The 10-second warning grace period stays in real time. **Prepare judge demo** seeds 100 points and 14 of 15 streak minutes; demo rescue is free, and **Demo: next mood** advances health one threshold at a time. Pause briefly after each click if you want judges to read every system notification.

## How it works

| Rule | Detail |
|---|---|
| Session length | 15 minutes minimum, health resets to 100 every session |
| Site categories | Productive, distracting, or neutral. Unlisted sites (including YouTube and Reddit by default) are neutral and do nothing. Edit the lists in Settings, or override one site for the current session from the Focus screen |
| Warning | Entering a distracting site shows "Your buddy is getting distracted!" and starts a 10-second grace period. Health only drops after that, and stops as soon as you leave |
| Health | `health = 100 - (distracted time / allowed distraction time) x 100`, where allowed distraction time is 20% of the session (25 min session: 5 min, 60 min: 12 min, 120 min: 24 min) |
| Moods | 76-100 happy, 51-75 okay, 26-50 sad, 1-25 panicking, 0 fainted. Paused and just-completed sessions use dedicated sleeping artwork and a resting animation |
| Points | `base = productive minutes`, `bonus = round(base x final health / 200)`, `total = base + bonus`. Only productive and neutral time counts. Points are awarded only when the timer finishes |
| Points are never lost | A failed session earns nothing, but nothing is taken away. Purchases are permanent |
| Fainting | The session pauses. Spend 20 points to rescue the buddy (restores 30 health, once per session) or end the session |
| Treat | 10 points, restores 20 health during a session |
| Daily streak | Secured the moment you reach 15 productive minutes in a calendar day, even across several or failed sessions. Missing a whole day ends it |
| Pausing | Allowed. Paused time never counts toward points or the streak |
| Closing Chrome | Pauses the session. Reopening the panel keeps the timer |
| Emergency exit | "End session" earns no points, and minutes already focused still count toward the streak |
| Notifications | On entering a distracting site and at mood thresholds: okay (75%), sad (50%), panicking (25%), final warning (10%), and fainted (0%). Each alert gets a fresh silent system banner. Fainting mutes notifications until rescue or a new session |
| Sounds | Muted by default, with a speaker button and volume slider in the side panel and a mute button on the floating buddy. Meaningful moods and events have synthesized sounds; routine clicks, pause, and resume stay quiet |
| Privacy | Only totals and settings are stored (`chrome.storage.local`). Browsing history is never saved |

### Shop

| Item | Cost |
|---|---|
| Treat (restore 20 health) | 10 |
| Bow or glasses | 50 |
| Top hat | 75 |
| Special color (mint, lavender, pink) | 100 |
| New animal (29 to unlock, golden retriever is free) | 200 |

## Project layout

```
manifest.json     Manifest V3, permissions, side panel
background.js     Service worker: the single source of truth for state, tab watching, notifications
shared.js         Game rules and pure logic (health, points, streak, site classification)
art.js            Approved artwork crop map, mood selection, and accessory overlays
assets/pets/      Six approved mood sheets plus six sleeping sheets (30 animals, 6 moods)
content.js        Floating, draggable webpage buddy (isolated in Shadow DOM)
sound.js          Synthesized sound effects (no audio files)
offscreen.html/js Hidden audio player used while the side panel is closed
sidepanel.html    Side panel page
sidepanel.css     Styling
sidepanel.js      UI: sends actions to the worker, renders the state it saves
tests/logic.test.js   Run with: node tests/logic.test.js
tests/sound.test.js   Run with: node tests/sound.test.js
icons/            Extension icons
```

How the pieces talk: the side panel sends small messages (`start`, `pause`, `treat`, ...) to `background.js`. The worker loads the state, moves the clock forward from stored timestamps (so it survives the service worker sleeping), applies the action, saves, and fires any notifications. The side panel re-renders whenever storage changes.

## Customizing

* **Game balance:** all numbers (grace period, 20% allowance, costs, rescue, streak minutes) are constants at the top of `shared.js`.
* **Site lists:** defaults are `DEFAULT_PRODUCTIVE` and `DEFAULT_DISTRACTING` in `shared.js`.
* **New animals:** add its approved five-mood artwork to a production contact sheet, map its sheet row in `ANIMALS` in `art.js`, and add its id to `ANIMAL_IDS` in `shared.js`. The test checks they match.
* **Sounds:** edit the note sequences in `SOUND_NOTES` in `sound.js`, event mappings in `shared.js`, and each animal's pitch in `ANIMAL_PITCH`.
* **Accessories and colors:** `ITEMS` in `shared.js`, drawn in `accessory()` in `art.js`.

## Known limits

* Chrome extensions can see which website you are on, but not other desktop apps, so app tracking is out of scope.
* The floating buddy cannot run on Chrome's internal pages (`chrome://...`) or the Chrome Web Store; those count as neutral. The toolbar icon still opens the dashboard.
* While the side panel is closed, time is checked every 30 seconds (Chrome's alarm limit). While it is open, it updates every second.
* Demo mode includes a judge shortcut that seeds 100 points and 14/15 daily streak minutes, a deterministic “next mood” button, free rescue, and optional shop unlocks.
* On Chrome 141+, the floating widget button closes an already-open side panel. Earlier supported Chrome versions keep the open action and use Chrome's own close control.

## Roadmap ideas

Streak freezes (50 points) and revives (100 points), a floating buddy on web pages, study groups and leaderboards, weekly stats, more accessories per animal.

## License

MIT
