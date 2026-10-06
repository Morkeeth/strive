# Reading and reviewing a STRIVE card

Use this when the owner gives you a STRIVE card address and asks you to look at it, review it, or change how it looks. It is a separate job from capture. It needs a browser you were actually given. If you have none, say so and stop.

## Three levels of access. Know which one you have.

| Level | What you can do | What it needs |
|---|---|---|
| Public read | Open a shared card, every page of it, and every public run it links to | Nothing. No account. |
| Authorized XUDOS and comment | Send one XUDOS or post one comment on a public run | A signed-in account, and the owner's explicit request for that exact act |
| Owner edit | Edit card, Choose visual, Preview as reader, Sharing | The owner's own signed-in session |

Never sign up, never use an account you were not given, and never ask for a password or a token in chat.

## Addresses

A card for a day or a span of days:

    <site>/?day=YYYY-MM-DD&p=<profile id>
    <site>/?day=YYYY-MM-DD&through=YYYY-MM-DD&p=<profile id>

- With `&p=` you get what any reader gets: public runs only.
- Without `&p=` the page shows the signed-in owner their own day, private runs included.
- One page of the card: add `&page=<token>`. Take the token from the numbered link on the card. Do not build one.
- A single run: `<site>/?run=<run id>`, or the share page `<site>/r/<run id>`.

The address in the browser after any step is the exact return address. Report that one.

## How to move on a card

Find controls by role and accessible name. Do not rely on class names.

- Pages: a navigation region named "Pages of this card" holds links named by number and page, for example `1 Overview`, `2 STRIVE`. The selected link has `aria-current="page"`. Buttons "Previous page" and "Next page" are beside them.
- The visible text beside the numbers names the page in words, for example `STRIVE · 2 of 4`.
- "Open the run: timeline, evidence, pictures" opens the run behind the page in view.
- The action row has three controls in this order: XUDOS, Comment, Share.
- Owner only: a button named "Card options" opens a menu with "Edit card", "Choose visual", "Preview as reader" and "Sharing". If that button is absent, you are a reader.

## What the main visual is

Each page has one main visual. Read its caption before you describe it.

- A graph with the labels "captured sessions" and "commits landed" is measured data.
- "Screenshot chosen by the author, shown whole." is a screen capture the author picked.
- "Photo chosen by the author. Atmosphere, not a measurement." is a photograph. It proves nothing about the work. Do not cite it as evidence.
- "No measured trace and no picture on this page yet." means there is nothing to show. Say that. Do not fill the gap.

A number shown as "not recorded" is unknown. It is not zero.

## Boundaries when you edit for the owner

- Edit card changes what the card shows. Nothing is written until "Save" is pressed. The state beside the buttons reads "Unsaved changes.", "Saving…", "All changes saved." or "Not saved: ...". Report the state you saw last.
- "Cancel" puts the saved choices back.
- Saving never changes who can see a run. Audience changes only on Sharing, with its own button that names how many runs become public.
- Do not press the Sharing button unless the owner asked you to share those exact runs.
- A picture can only be chosen from pictures the owner already added to their own runs. Do not upload, generate or fetch one.
- Do not write a headline for the owner. Offer words in chat and let them type or approve.

## A review must say what it did

End every review with these lines, filled from what you actually did:

    Opened: <each address you loaded>
    Pages viewed: <the page names>
    Signed in: yes or no
    XUDOS sent: 0
    Comments posted: 0
    Changes saved: none

A review sends no XUDOS and no comment by default. Engagement from an agent the owner did not ask for is noise in someone else's inbox. If the owner asked for one, do exactly that one, then report it with the address it was sent from.

Never paste a transcript, a prompt, a token or a private run title into a comment.
