# STRIVE card system

Rules for every card surface. Read this before you change a card, a page selector, an owner control or a picture on a card.

The rules live in three places that must agree:

- This document: the rule and its reason.
- `site/design.css`: the tokens and the COMPONENT RULES block.
- `site/day-card.js`, `site/feed-card.js`, `site/run-photos.js`: the one function that draws each part.

`scripts/test-card-system.mjs` fails if a token or class named here is missing from the styles. `scripts/test-day-card.mjs` checks the rules themselves. Run both after any change:

```sh
node scripts/test-day-card.mjs && node scripts/test-card-system.mjs && node scripts/test-day-share.mjs
```

If a screen needs something these rules do not allow, change the rule here first, then the code. Do not style around it.

## 1. Card anatomy

Every page of every card has the same parts in the same order.

| # | Part | Rule | Drawn by |
|---|---|---|---|
| 1 | Identity and date | Author name and the day or days. One line. | `StriveDayCard.render` |
| 2 | Page selector | Only when the card has more than one page. See section 2. | `StriveDayCard.render` |
| 3 | Headline | A level 2 heading. One short sentence the author wrote. Never invented. A project headline is the first sentence of the result field. | `StriveDayCard.render` |
| 4 | Main visual | One selected project image, its measured share ring, and up to three project facts together on one compact screen. | `visual()` in `site/day-card.js` |
| 5 | Measured activity | Selected measured facts visible beside the share ring under the image. A missing value says "not recorded". Unknown is never zero. | `StriveDayCard.render` |
| 6 | Highlights | At most two short lines, each opens its run. Overview only. | `StriveDayCard.render` |
| 7 | Action row | XUDOS, Comment, Share. The approved look. Do not restyle it. | `GrinderFeed.actions` |

A card with one project and a card with many projects use the same renderer. One project has no selector. Multiple projects open directly on the selected project; right/left arrows change its image, chart and data together. No overview or turning-points page interrupts project navigation.

If saved sessions have no project names at all, show one "Runs without a project" card with their recorded facts and trace. Do not count that group as a project or invent a result. This fallback must not reveal projects the author explicitly hid.

Turning points and whole-day totals remain available in the expanded evidence below the card; they are not carousel pages.

Tokens:

| Token | Use |
|---|---|
| `--card-max` | Widest a card gets on the day page |
| `--card-pad` | Side padding inside a card |
| `--card-gap` | Space between a card and the action row, and under a card |
| `--card-headline` | Headline size |
| `--card-fact` | Size of a number |
| `--action-h` | Height of each action in the action row, feed card and day card alike |
| `--trace-h` | Height of a run's activity trace on the run page |
| `--hero-max` | Tallest a picture gets on a feed card |
| `--share-ring` | Size of the ring that shows how a run divides between projects |

## 2. Page selector

Classes: `.dc-pages`, `.dc-pos`, `.dc-dots`, `.dc-page`, `.dc-arrow`.

- Named project links inside a compact Choose chapter disclosure. The selected link carries `aria-current="page"`; names, not numbered circles, tell the reader where to go. There is no separate overview list in the carousel.
- Each link has an accessible name made of its number and its page: `1 Overview`, `2 STRIVE`. An agent or a screen reader asks for a page by that name.
- The page name stays visible in words beside the numbers: `STRIVE · 2 of 4`.
- Previous and Next buttons stay. They are disabled at the ends. Pages do not wrap around.
- The chapter list stays inside the card and wraps long project names. It never scrolls sideways and a target never gets smaller than `--page-dot`. The gap is `--page-gap`.
- Every link is a real `href`. A page is named in the address by its project token: `&page=<token>`. An absent `page` value opens the selected lead project. The older form `&card=<number>` is still read.
- A page change the reader makes adds one step to the browser history. Back, Forward and Reload keep the page.
- The day view does not turn chapters automatically. Optional playback remains available to explicit callers (`auto` in `wire`, action `auto` in `reduce()`). This is the only move that goes round from the last page to the first. Rules for it:
  - It adds no history step. It only keeps the address in step with `replaceState`.
  - It waits while the pointer is on the card, while focus is inside the card and while the tab is hidden.
  - It never starts for a reader who asked for reduced motion.
  - It stops for the rest of the visit as soon as the reader moves the card: a page link, an arrow, a key, a swipe.
  - The reader can stop and start it with one named button, `.dc-auto` ("Pause" and "Play"), beside the arrows.
  - The page name is not read out for an automatic turn. `.dc-pos` is `aria-live="off"` while the card rotates and `polite` once the reader takes over.
  - A card with one page never rotates. The preview on Edit card never rotates.
- One function changes the page: `reduce()` in `site/day-card.js`. Links, arrows, the keyboard, a swipe and the browser's Back all send it an action. Do not add a second way to move.
- Arrow keys are left alone when focus is in a field, a menu, a radio group, a slider or a media control, and when a modifier key is held. The list is `GUARDED` in `site/day-card.js`.
- Numbering comes only from the pages this reader can see. A private or hidden project takes no number and its name is in no label.

Reason for tokens in the address: the owner has more pages than a reader. A position would open a different project for each of them. A token opens the same project for both, and a token does not reveal a name.

## 3. Owner menu and saving

Class: `.dc-menu`. Drawn only by `StriveDayCard.ownerMenu`.

One button, named "Card options", with four entries in this order:

| Entry | Address | What it does |
|---|---|---|
| Edit card | `&setup=1` | Headline, project order, numbers, highlights, main visual |
| Choose visual | `&setup=visual` | The same screen, opened at the main visual |
| Preview as reader | `&p=<own profile id>` | The card as anyone else gets it |
| Sharing | `&share=1` | Choose what readers see, with the owner and reader numbers side by side |

- The same menu is on the card, on Edit card and on Sharing. Do not add loose owner links around a card.
- Only the owner gets the menu. `render` does not draw it when `mine` is false, even if links are passed in.
- The owner's Share button in the action row opens Sharing, so the comparison of owner and reader numbers is one press from the card.

Saving on Edit card:

- Nothing is written until Save is pressed. The preview is the real card with the unsaved choices.
- The state is always one of four, shown in words beside the buttons: `saved`, `unsaved`, `saving`, `error`.
- Cancel puts the last saved choices back.
- A failed save keeps every choice on the screen and says how to try again.
- Leaving the page with unsaved choices asks first.
- A save writes display choices to the owner-only day-card table. It never touches a run and never changes who can see one. Audience changes only on Sharing.

## 4. Main visual

Class: `.dc-visual`. One of three modes. The author chooses the mode. Nothing guesses it.

| Mode | What it is | How it is shown |
|---|---|---|
| Data | The split between projects, then the measured trace: captured sessions and commits on one clock | Default everywhere. Needs no upload. |
| Screenshot | A capture of a screen the author picked from their own runs | Shown whole, never cropped. `object-fit: contain`, at most `--visual-shot-max` high, on `--visual-wash`. |
| Photo | A photograph the author picked from their own runs | Fills a `--visual-photo-ratio` frame. `object-fit: cover`. The author picks the part to keep in the frame and checks the crop in the preview. |

The split (`.dc-share`, drawn only by `share()` in `site/day-card.js`) stays visible with the selected image. It is one ring.

- It divides the run by ONE measured quantity and names it under the ring: captured tool calls when at least two projects have complete positive tool-call measurements; otherwise commits, then captured session time. A partial project total is excluded and named, never filled with zero.
- A project with no recorded value is not drawn. It is counted in words: "2 projects not counted: no commit count recorded." Unknown is never a zero slice.
- At most five projects are named. The rest are one grey slice, "N more".
- Project selection goes through `reduce()` like every other move.
- On a project page the ring is small and shows that project's share in words: "7% of the run's commits: 24 of 366".
- Session time is first message to last, summed across runs. It is not one person's hours and the ring's note says where the number comes from.
- With fewer than two measured projects there is no ring.
- A page with a picture also shows the measured share ring and project facts.

Rules:

- One image per project screen, followed by one compact ring-and-data band. The measured trace is the image fallback, not a second mandatory panel.
- No image is ever stretched.
- Legacy overview choices are preserved for compatibility but do not add a second copy of the picture to the project carousel.
- A picture leads the page of the project whose run holds it. It shows nowhere else.
- A photo is atmosphere. Its caption says so: "Atmosphere, not a measurement." It is never evidence that work happened.
- A picture is only ever one the author already added to one of their runs and then picked here. No stock image, no generated image, no camera roll scan, no automatic publish.
- A picture marked "Personal photo" on its run starts in Photo mode when picked. Any other picture starts in Screenshot mode. Both are the author's own earlier words and both can be changed.
- No picture is ever required. Data is enough. A mode with no picture picked saves as Data.
- Fallback order: chosen picture, then the measured trace, then one plain sentence: "No measured trace and no picture on this page yet." The owner also gets a link to choose a visual.

Privacy:

- A picture follows the audience of its run. The card adds no second switch.
- A reader's card is built from the runs that reader can see. If the picture's run is not among them, the card carries no trace of the picture: not its id and not its run id. The page shows the measured trace.
- If a picture cannot be fetched for any other reason, the trace behind it is shown. A page never has an empty frame.
- The owner is told when their picture sits on a run that is Only you.

Old saved choices: before version 2 a card could hold one picture under the heading "Screenshot". Those choices are read as Screenshot mode, overview on Data. `clean()` in `site/day-card.js` does this on read. Nothing is rewritten until the owner saves.

## 5. Reading and acting, for people and agents

| Who | Can | Cannot |
|---|---|---|
| Anyone, signed out | Read a shared card at its address. Open every page and every public run. | See private runs, private pictures, or any owner control. |
| Signed in, any account | Send XUDOS and comment on a public run. | Edit another person's card. |
| Owner | Everything in the owner menu. | Change audience from Edit card. That is Sharing only. |

- Controls are real links and buttons with names. An agent finds them by role and name, with no knowledge of class names.
- An agent that reviews a card reads it. It sends no XUDOS and no comment unless its owner asked for that in so many words.
- A review says which addresses it opened and what it did there.
- The served guide is `/agents.md`, built by `scripts/build-agent-frontdoor.mjs`. The kit copy is `templates/grokbot/post-agent-run/references/REVIEW.md`.

## 6. What follows these rules today, and what does not

Follows the rules:

- Day card: project screens (`/?day=`), with whole-day evidence below.
- Edit card (`&setup=1`) and its live preview.
- Sharing (`&share=1`): owner menu and the reader link.
- Action row on the feed card, the run page and the day card: one function, one height token.
- A picture on a feed card, a run card and a day card page: only one the author chose (the run's selected cover, the picture marked Result when the layout asks for it, or the only picture on the run). Shown whole, on the wash, under `--hero-max` on the feed and `--visual-shot-max` on the run page. The first upload is never assumed. One function decides: `lead()` in `site/run-photos.js`.
- A project page of the day card: with no picture picked for the card, it leads with the cover chosen on that project's own run, and with the measured data when there is none.
- Photo reads: one function, `get()` in `site/run-photos.js`. Every read is checked by the server. Nothing is shown from memory without that check.
- Run page: the description is shown once. The trace height is `--trace-h`. Owner links are quiet text links.

Not yet moved over. These still differ and are listed here so nobody mistakes them for the pattern:

- Feed card body (`site/feed-card.js`): shares the action row and the picture rule. Its headline, numbers and trace follow older rules.
- Run page (`/?run=`): its owner controls are separate links and buttons, with no owner menu.
- Public run page (`/r/<id>`, `server/public-run.mjs`): server drawn, older layout, its own action row markup in `page` mode.
- Run share page (`/?share=1&run=`): older layout. A reader's Share on a day card still goes here, for the lead run only.
- Profile page and "My runs" list: no card anatomy.
- Everything under "Everything in this run" on the day page: older sheet layout.
- Per-project photo, screenshot and data choices now persist independently in owner-only storage. Reader choices are filtered by public run membership in the requested local date window.
- The overview headline "One run across N projects" is a counted draft, shown to the owner as a draft.

## 7. Project chapters · approved direction, 7 October

A project chapter names the project, uses only its author-written result as its outcome, leads with the selected visual, and offers the actual output link or project continuation. Missing outcomes stay quiet and honest; owner links open the existing run story editor. Still-open text remains an author declaration. The card opens directly on its lead project and moves between projects with arrows. Project following stores only the viewer’s own subscriptions; subsequent views always re-read public runs. Following never grants access to private work.

## 8. Oscar review correction · 7 October night build

This correction supersedes older overview and collapsed-data descriptions above: one project screen contains one selected image, a measured-share pie and useful project data. Right-side arrows advance all three together. No overview list or extra turning-points slide interrupts the projects. The same renderer draws day cards and Edit card previews; feed day collections open this exact project card. The chart names its denominator and missing data stays unknown. Existing saved picture choices and run audiences remain authoritative.
