// Single source of truth for the recurring cast (Ahmed, Fatima, Bilal) and
// the story-format rules shared by every Groq prompt in scheduler/daily.ts.
// Keeping this here means a tone/voice tweak is one edit, not three.

export const CAST = `━━━ RECURRING CAST ━━━
**Ahmed** — 28, Pakistani guy, arrived in Stockholm 4 months ago on a work permit. Junior software developer. Anxious newcomer energy, still figuring out Sweden. Wears a navy hoodie, glasses. Lives in a temporary sublet with Fatima in Vällingby.
**Fatima** — 27, Ahmed's wife. Was an accountant in Karachi. Doing SFI free classes, looking for first job. Practical, optimistic, the planner. Wears modest dress with a draped scarf (no head covering).
**Bilal** — 35, Ahmed's older cousin. 10 years in Sweden, has personnummer, citizenship in progress. Senior engineer at a Stockholm tech company. Married to a Swedish woman (Linnea — only mentioned, not on screen). The mentor — direct, warm, "I've seen this all before."

ONE character per post is OK. Two is good (dialogue). Three is rare. Pick whoever fits the topic. The audience follows them like a soap opera — episodes connect over time but each post stands alone.`;

export const STORY_RULES = `━━━ STORY MODE — THIS IS NOT INFO POSTING ━━━
Every post is a SHORT NARRATIVE EPISODE about Ahmed/Fatima/Bilal. NOT a fact dump.

Structure:
1. HOOK — a moment of tension, surprise, or a small disaster (NOT a bullet list)
2. SCENE — show ONE concrete situation through one character's eyes; dialogue is great
3. REVEAL — ONE specific Sweden fact discovered THROUGH the story, not preached
4. TURN — a decision, realization, or open question that lands the ending

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
The IG caption MUST end with TWO elements, in this order:

1. **Direct question to viewers** — phrased as if Ahmed/Fatima/Bilal is asking THEM personally. Examples:
   "Tum hote toh kya karte? Comment mein batao 👇"
   "Aap ne aisa kuch face kiya hai? Apni story share karo 👇"
   "Kya Ahmed ko Bilal ki advice lena chahiye? Vote karo 👇"
   Not generic ("What do you think?"). Specific to the episode beat.

2. **Hashtag block** — exactly these 4 community hashtags MUST appear (at the end, after your topic hashtags):
   #PakistaniInSweden #PakistaniInSverige #SwedenMeinPakistani #Stockholm

   Pillar-specific hashtags go BEFORE these (3-5 of them). Total = 7-9 hashtags.

This rule is the difference between getting 200 views and 600 views on IG reels.`;

export const PANEL_SPEC = `━━━ COMIC PANELS (REQUIRED) ━━━
Generate a "panels" array — 5 to 7 panels that visually narrate the episode.
Each panel is one moment in the story; together they should read as the episode beat-by-beat.

Per panel:
{
  "character": "ahmed" | "fatima" | "bilal" | "ahmed,bilal" | "ahmed,fatima" | "all",
  "scene": "Short visual description of what's happening in the panel. NO dialogue, NO text on screen. Pure visual moment — character pose, location, mood, lighting. Example: 'Ahmed sits alone on his sofa at night, phone glow on his face, worried expression. Stockholm city lights through the window behind him.'"
}

Rules:
- "character" must list only names actually appearing in that panel
- "scene" is purely visual (no speech bubbles — the dialogue is in the post text, not the image)
- Panel 1 sets the location/mood; final panel is a resolution or open-question moment
- Avoid duplicating Sweden landmarks across consecutive panels — vary the locations (apartment, T-bana, vårdcentral, ICA, office, kitchen, balcony, park)`;
