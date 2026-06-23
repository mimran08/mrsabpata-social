// Single source of truth for the recurring cast (Ahmed, Fatima, Bilal) and
// the story-format rules shared by every Groq prompt in scheduler/daily.ts.
// Keeping this here means a tone/voice tweak is one edit, not three.

export const CAST = `━━━ RECURRING CAST ━━━
**Ahmed** — 28, Pakistani guy, arrived in Stockholm 4 months ago on a work permit. Junior software developer. Anxious newcomer energy, still figuring out Sweden. Wears a navy hoodie, glasses. Lives in a temporary sublet with Fatima in Vällingby.
**Fatima** — 27, Ahmed's wife. Was an accountant in Karachi. Doing SFI free classes, looking for first job. Practical, optimistic, the planner. Wears modest dress with a draped scarf (no head covering).
**Bilal** — 35, Ahmed's older cousin. 10 years in Sweden, has personnummer, citizenship in progress. Senior engineer at a Stockholm tech company. Married to a Swedish woman (Linnea — only mentioned, not on screen). The mentor — direct, warm, "I've seen this all before."

ONE character per post is OK. Two is good (dialogue). Three is rare. Pick whoever fits the topic. The audience follows them like a soap opera — episodes connect over time but each post stands alone.`;

export const STORY_RULES = `━━━ STORY MODE — THIS IS NOT INFO POSTING ━━━
Every post is a 2:30 NARRATIVE EPISODE about Ahmed/Fatima/Bilal — a complete problem-to-solution arc, not an info dump or a cliffhanger.

Arc structure (THIS IS REQUIRED — the video has 10 scenes mapped to these 6 beats):

1. HOOK (1 scene, ~8s)
   A moment of tension, surprise, or a small disaster. NOT a bullet list. Starts mid-action.

2. SETUP (2 scenes, ~25s)
   What's the situation? Who's affected? What's at stake? Briefly establish the character's normal world before the problem hits.

3. ESCALATION (2 scenes, ~35s)
   The problem gets worse. The character realizes how serious this is. Maybe they panic, call someone, hit a wall, get bad news. This is the emotional low.

4. TURNING POINT (2 scenes, ~25s)
   Someone helps OR the character decides to act. Bilal explaining the rule, Fatima reading the Migrationsverket page, Ahmed deciding to call Skatteverket. The moment the story shifts from problem to solution.

5. SOLUTION (2 scenes, ~35s)
   THE ACTUAL SWEDEN FACT, EXPLAINED. Not a rushed one-liner — the character walks the audience through what to actually do. Specific steps, specific website URLs, specific deadlines, specific phrases. This is where the audience GETS the value.

6. RESOLUTION + CTA (1 scene, ~20s)
   What does the character do next? End on a small win or an open question. Cast invites the viewer to comment/follow.

Tone:
- Conversational Karachi Urdu mixed with English. "Yaar Bilal bhai", "actually", "kya scene hai"
- Use specific Sweden vocab (Migrationsverket, Skatteverket, personnummer, SFI, vårdcentral, ICA, Pressbyrån, T-bana, Hemnet, bostadskö, samordningsnummer, A-kassa)
- Specific > generic — "the SL card stopped working" beats "transport problem"

BANNED:
❌ Bullet lists ("Here are 5 things you need to know...")
❌ Lecture voice ("If you are an immigrant, you must...")
❌ Made-up institutional details (don't invent Swedish agencies, IDs, programs that don't exist — if unsure, just keep it vague rather than wrong)
❌ Generic motivation ("believe in yourself")

━━━ FACT GUARDRAIL ━━━
Only mention real Swedish institutions/processes:
✓ Migrationsverket (immigration), Skatteverket (tax/personnummer), Försäkringskassan (insurance), Arbetsförmedlingen (job centre), SFI (Swedish for Immigrants), samordningsnummer (coordination number for those without personnummer), vårdcentral (health centre), 1177 (healthcare info line), BankID, A-kassa, Hemnet (housing), Blocket, ICA/Coop (grocery), Pressbyrån (kiosk), SL (Stockholm transport), bostadskö (housing queue).
❌ Do NOT invent Swedish IDs/programs/agencies. If a real one doesn't fit, write around it.`;

export const IG_ENGAGEMENT_RULES = `━━━ INSTAGRAM ENGAGEMENT (CRITICAL) ━━━
The IG caption MUST follow this exact structure:

0. **HOOK first line** — the FIRST line of the IG caption is the make-or-break. IG shows only the first ~80 characters before "...more"; viewers decide "show or hide" based on that. Open with a SHOCK or a DIRECT QUESTION, not narration. Examples:

   ✅ "Sweden mein 4 mahine, aur ek galti = visa cancel. Aap jaante ho?"
   ✅ "Personnummer nahi? Healthcare bhul jao. Yaha tak ke pregnancy bhi."
   ✅ "Ahmed ne kal raat ek mistake ki — har Pakistani karta hai. Aap?"
   ❌ "Ahmed was sitting on his sofa when..." (story narration — buried)
   ❌ "It was a normal evening for Ahmed..." (boring opener)

   Then BLANK LINE, then start the actual episode in paragraph 2.

1. **Direct question to viewers** at end — phrased as if Ahmed/Fatima/Bilal is asking THEM personally. Examples:
   "Tum hote toh kya karte? Comment mein batao 👇"
   "Aap ne aisa kuch face kiya hai? Apni story share karo 👇"
   "Kya Ahmed ko Bilal ki advice lena chahiye? Vote karo 👇"
   Not generic ("What do you think?"). Specific to the episode beat.

2. **Hashtag block** — exactly these 4 community hashtags MUST appear (at the end, after your topic hashtags):
   #PakistaniInSweden #PakistaniInSverige #SwedenMeinPakistani #Stockholm

   Pillar-specific hashtags go BEFORE these (3-5 of them). Total = 7-9 hashtags.

The first-line hook is what gets the algorithm to show the post. The end question + hashtags are what get engagement once it's seen. Both matter.`;

export const PANEL_SPEC = `━━━ COMIC PANELS (REQUIRED) ━━━
Generate a "panels" array with EXACTLY 10 panels matching the 6-beat arc:

Panel 1   → HOOK              (problem appears / tension moment)
Panel 2   → SETUP             (normal world before the problem)
Panel 3   → SETUP             (stakes established)
Panel 4   → ESCALATION        (problem gets worse)
Panel 5   → ESCALATION        (emotional low / character's reaction)
Panel 6   → TURNING POINT     (help arrives or decision is made)
Panel 7   → TURNING POINT     (character starts to act)
Panel 8   → SOLUTION          (the Sweden fact discovered/explained)
Panel 9   → SOLUTION          (taking action / using the information)
Panel 10  → RESOLUTION + CTA  (the small win, character invites viewer)

Per panel:
{
  "character": "ahmed" | "fatima" | "bilal" | "ahmed,bilal" | "ahmed,fatima" | "all",
  "scene": "Short visual description of what's happening in the panel. NO dialogue, NO text on screen. Pure visual moment — character pose, location, mood, lighting. Example: 'Ahmed sits alone on his sofa at night, phone glow on his face, worried expression. Stockholm city lights through the window behind him.'"
}

Rules:
- "character" must list only names actually appearing in that panel
- "scene" is purely visual (no speech bubbles — the dialogue is in the post text, not the image)
- Vary locations across panels: apartment, T-bana, vårdcentral, ICA, office, kitchen, balcony, park, Migrationsverket waiting room, café — pick what fits each beat
- Body language should track the arc: hunched/worried in escalation, upright/active in solution, smiling/relieved at resolution`;
