# Content sources for Kea situation puzzles and case files

Research date: 2026-10-31. This is not legal advice. Verdicts are deliberately conservative. The licence rules and importers built on this research (issue #58) are summarised in "Kea's policy and tooling" at the end; the README section "Content Sources and Licences" has the commands.

## How this was checked, and its limits

- **Read directly (GitHub raw):** LatEval, SPLAT, TurtleBench, MuSR, True Detective, DeepTurtle, DetectBench READMEs and LICENSE files, plus small data samples (LatEval `english.json`, SPLAT `puzzles.xlsx`, TurtleBench `stories.json`; MuSR range-read only).
- **Not read directly:** huggingface.co, arxiv.org, gutenberg.org, wikipedia/wikibooks/wikisource, itch.io, kith.org, archive.org and puzzling.stackexchange.com could not be opened during the research. For these sources, licences come from search-engine snippets of the primary pages. Each one is marked **(unverified: snippet)** and must be re-checked on the live page before we ingest anything.

### Key legal framing

- **Ideas versus wording:** copyright protects how a puzzle is written, not its premise. Classic folk situation puzzles (albatross soup, the man in the lift, the hanged man and the puddle) are widely seen as ideas anyone can retell in fresh words. But Paul Sloane publicly claims copyright even over folk puzzles he wrote down, and Jed Hartman (kith.org) has said openly that he is unsure about book-sourced puzzles.
- **Safest route for situation puzzles:** treat unlicensed collections as *idea indexes*. Write the setup and solution text from scratch with an LLM, prompted only with a one-line premise, and never copy their wording.
- **Benchmark datasets without a LICENSE file are "all rights reserved" by default.** Several also scraped third-party sites, so even a permissive repo license may not cover the puzzle text itself.
- **Public domain means different things in different places.** US status (works published before 1931, as of 2026) differs from Spain's: life + 80 years for authors who died before 7 Dec 1987, otherwise life + 70. Kea is served globally from GitHub, so we should prefer works that are public domain in **both** the US and the EU/Spain.

---

## 1. Ranked shortlist

### Situation puzzles

| Rank | Source | Verdict | Why |
|---|---|---|---|
| S1 | **Kea-original LLM-written puzzles, using classic folk premises as seeds** (premises listed in LatEval / SPLAT / Wikipedia, rewritten from scratch) | GREEN (our own text) / AMBER on premise provenance | We own the output. LatEval's `clue` field shows exactly the key-fact shape we want. We already have `generate-decks.ts` and the solvability check. Origin = `generated`. |
| S2 | **Puzzling Stack Exchange `lateral-thinking` / situation-puzzle questions** | AMBER (CC BY-SA 2.5/3.0/4.0 depending on post date; attribution plus share-alike) | Higher-quality original puzzles with accepted answers. The share-alike obligation applies to every deck JSON/YAML that contains the text, so they need their own CC BY-SA pack. The official dump moved behind a login in 2024 and its new terms conflict with CC BY-SA, so fetch individual posts via the API or page and keep a per-post URL. |
| S3 | **Wikibooks "Lateral Thinking Puzzles"** | AMBER (CC BY-SA 4.0, **unverified: snippet**) | Small. Many entries are wordplay riddles rather than situation puzzles (for example "From There to Here" → "the letter t"). Worth a manual pick of a handful. Same share-alike handling as S2. |
| S4 | **TurtleBench** (github.com/mazzzystar/TurtleBench) | AMBER→RED for text | The repo is Apache-2.0 (verified LICENSE). Only 32 stories, EN + ZH, with `surface`/`bottom` fields. The stories are "user-generated data from a Turtle Soup puzzle platform", so upstream rights are unclear. Several are dark (cannibalism, suicide). Use as inspiration only. |
| S5 | **LatEval** (github.com/THUKElab/LatEval) | RED for text (no license), useful for premises and schema | 226 EN + 100 ZH. Has `question`, `answer` and `clue` (numbered atomic facts), which is the closest to our schema of any source. No LICENSE file (verified 404). Text looks scraped from classic web collections. |

**Spanish situation puzzles:** I found **no** openly licensed Spanish collection. Every Spanish hit was a commercial book (Sloane/MacHale translations, "81 desafíos de pensamiento lateral", "Historias imposibles"), a blog, or an app. Plan: author in English (S1/S2), then run `scripts/translate-decks.ts`. Translating CC BY-SA material produces a CC BY-SA adaptation, which needs a "translated from" note. Alternatively, generate Spanish-native puzzles directly with origin `generated`.

### Case files

| Rank | Source | Verdict | Why |
|---|---|---|---|
| C1 | **Public-domain detective fiction adapted into cases.** English: Conan Doyle (d. 1930), Chesterton's *Innocence/Wisdom of Father Brown* (d. 1936), Futrelle's *Thinking Machine* (d. 1912), Poe (d. 1849), Arthur Morrison (d. 1945). Spanish: Alarcón *El clavo* (1853, d. 1891), Emilia Pardo Bazán (d. 1921) stories such as *La gota de sangre*, and the anonymous 1909 Spanish *Aventuras de Sherlock Holmes* on es.wikisource. | GREEN (public domain in US and Spain for these authors). Rewritten case text is our own work. | Real plots with fair-play clues and known culprits. An LLM extracts briefing, evidence items, unlock chains, questions and walkthrough; a human edits. Native Spanish sources exist. **Avoid:** Orczy (d. 1947: not public domain in Spain until 2028), and modern Spanish translations of Chesterton/Holmes (translator's copyright). |
| C2 | **MuSR murder mysteries** (github.com/zayne-sprague/MuSR, HF TAUR-Lab/MuSR) | GREEN with attribution: code repo MIT (verified LICENSE); HF dataset card CC BY 4.0 (**unverified: snippet**) | 250 GPT-4-written mysteries of about 1,000 words. Each has 2 suspects, means/motive/opportunity reasoning trees, and an answer. Prose is middling and repetitive, and the format is single-question. Good *skeletons*: we would split each narrative into 8–15 evidence items and add questions. English only (translate). Cite the MuSR paper and license in the deck. |
| C3 | **H. A. Ripley, *Minute Mysteries [Detectograms]*** (Gutenberg #50603, 1932) | AMBER. Marked "Public domain in the USA" (**unverified: snippet**). EU status is unknown because the author's death date was not found (b. 1896). It was reissued commercially in 2024. | About 71 short Fordney puzzles with solutions. They fit **situation puzzles or mini-cases** well. Usable from US hosting; confirm the death date before treating it as worldwide-safe. |
| C4 | **WhoDunIt** (HF jinsha-x/WhoDunIt) | GREEN for the underlying texts (Gutenberg public-domain novels), but the dataset's own license is unstated | Useful as a *finder list* of public-domain mysteries with labelled culprits that feed C1. Go to Gutenberg for the text itself. |
| C5 | **Matt Clifford's murder-mystery party games** (matthewclifford.com) | AMBER (Creative Commons, exact variant **unverified**) | Role-play party games, not evidence-board cases. At most inspiration or one adaptation. |

---

## 2. Everything examined

Formats and volumes come from samples where marked; "Schema fit" means how much of `SituationCard` / `CaseCard` the source already provides.

### Situation puzzle sources

| Source | URL | Content and volume | Lang | Format and sample | Schema fit | License and redistribution | Attribution / share-alike | Effort | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| LatEval | github.com/THUKElab/LatEval (`data/english.json`, `data/chinese.json`) | 226 EN, ~100 ZH classic lateral puzzles | EN, ZH | JSON `{id, question, answer, clue}`. Sample: Q "He was killed by breakfast. Why?" A: pepper → sneeze → avalanche. clue: "1.Man was camping… 4.The avalanche resulted in his death" | Title missing (derive). Setup, solution and key facts all present. No hints or warnings. | **No LICENSE** (verified 404; no license in sidebar). Probably scraped from classic web lists. Not redistributable. | n/a | Low technically, but legally blocked | RED (text); premise index only |
| SPLAT (NeurIPS 2024, "Weak-eval-Strong") | github.com/chenqi008/LateralThinking (`puzzles.xlsx`) | 975 puzzles; difficulty is a 1–10 score (e.g. "7/10 HARD") | EN | XLSX columns `title, story, answer, level of difficulty`. Sample: "Red high heels" (magician's apple trick, wrong height) | Title, setup, solution and difficulty present. No key facts or hints (LLM). | **No LICENSE** (verified 404). Source sites not named; many items match public riddle sites. | n/a | Low technically | RED (text); premise index |
| TurtleBench | github.com/mazzzystar/TurtleBench | 32 stories, plus 1.5k annotated guesses | EN, ZH | JSON `{index, title, chinese_title, surface, bottom}` | Title, setup, solution. No key facts or hints. | Apache-2.0 (verified LICENSE). But stories are "user-generated data from a Turtle Soup puzzle platform", so the repo owner may not hold the rights. | Apache NOTICE / attribution | Low | AMBER→RED; inspiration |
| DeepTurtle | github.com/Yuikij/DeepTurtle, HF YuiMax/DeepTurtle | Chinese 海龟汤 plus DeepSeek failure cases; size inconsistent (<1K vs 10K–100K) | ZH (some EN) | JSON | Setup and solution | MIT badge (verified README). Puzzles tied to the author's turtlenoir.com / haiguitang.net; upstream authorship unclear. | MIT notice | Medium (translation from ZH) | AMBER (ZH-only; low value) |
| haiguitang | HF lpj990/haiguitang | Large Chinese turtle-soup set (10K–100K) | ZH | JSON | Setup and solution | Apache-2.0 tag (**unverified: snippet**). Almost certainly scraped from Chinese apps or sites. | — | High | RED (provenance) |
| BrainTeaser (EMNLP'23 / SemEval-24 T9) | github.com/1171-jpg/BrainTeaser | ~1.1k sentence and word puzzles, multiple choice | EN | Password-protected zip | Wrong genre (one-line riddles, not situation stories) | Collected from riddles.com, rd.com etc.; license not stated | — | — | RED / not relevant |
| Puzzling Stack Exchange `lateral-thinking` | puzzling.stackexchange.com/questions/tagged/lateral-thinking | Hundreds of questions (count not verified); mix of situation puzzles, riddles and meta-puzzles | EN | HTML / SE API; question = setup, accepted answer ≈ solution | Setup and solution (the accepted answer is sometimes only a guess); key facts and hints via LLM | CC BY-SA 2.5 / 3.0 / 4.0 depending on post date (SE terms, via snippet). Redistributable under share-alike. The 2024 dump terms (no commercial use, no LLM training) conflict with CC BY-SA, so prefer per-post API fetches and keep revision URLs. | Credit the author with a link and post URL, state the license, note changes. Share-alike applies to the pack YAML and deck JSON containing it. | Medium (filtering, quality curation) | AMBER |
| Wikibooks "Lateral Thinking Puzzles" | en.wikibooks.org/wiki/Lateral_Thinking_Puzzles | Small; many are wordplay | EN | Wiki pages with /Solution subpages | Setup and solution | CC BY-SA 4.0 (Wikimedia default; **unverified: snippet**) | As above, plus history link | Low | AMBER (small) |
| Wikipedia "Situation puzzle" | en.wikipedia.org/wiki/Situation_puzzle | A few example puzzles | EN (+ other wikis) | Article | Setup and solution | CC BY-SA 4.0 | Share-alike | Low | AMBER (tiny) |
| Jed Hartman's Situation Puzzles | kith.org/jed/situation-puzzles/ | ~100+ classic puzzles with variants and a bibliography; frozen 1998/99 | EN | HTML | Setup and solution | © Jed Hartman. He says he is unsure about rights to book-sourced puzzles. No open license. | — | — | RED (inspiration; the bibliography is a useful provenance map) |
| r/situationpuzzles | reddit.com/r/situationpuzzles | Many user puzzles | EN | Posts + comments | Setup; solution often in comments | Posters keep copyright; Reddit's licence is to Reddit, not to third parties. No open license. | — | — | RED (unless individual authors give written permission) |
| lateralthinkingpuzzles.org, puzzlesandriddles.com, YesNoMystery (~1,140 puzzles), rd.com, Parade, AhaSlides | various | Hundreds | EN (YesNoMystery also ES) | HTML | Setup and solution | All rights reserved / no license shown | — | — | RED |
| Black Stories (Moses Verlag, Holger Bösch, 2004+), "Historias negras", Paul Sloane & Des MacHale books (incl. Spanish translations), Erwin Brecher, "Tales of Mystery", "81 desafíos…", "Historias imposibles" | commercial | Thousands | EN, ES, DE | Print | Full | **Copyrighted commercial products** | — | — | RED (inspiration only; never transcribe, even via photo quick-add) |
| TES "puzzles-lateral-thinking" resource | tes.com/teaching-resource/puzzles-lateral-thinking-11940113 | Teacher worksheet | EN | DOC | Setup and solution | Snippet mentions CC "ShareAlike"; but the uploader probably copied Sloane-style puzzles | — | — | RED (provenance doubtful) |

### Case file sources

| Source | URL | Content and volume | Lang | Format | Schema fit | License | Attribution / share-alike | Effort | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| MuSR murder mysteries | github.com/zayne-sprague/MuSR (`datasets/murder_mystery.json`, 44 MB with reasoning trees); HF TAUR-Lab/MuSR | 250 mysteries of ~1,000 words, 2 suspects each, GPT-4 generated | EN | JSON: `context` (narrative), `questions[]` with choices, answer and intermediate reasoning trees. Sample: bungee-jump site, victim Mack, suspects Ana / Mackenzie, Detective Winston | Briefing and answer present. Evidence must be split out of the narrative (the reasoning tree helps: means/motive/opportunity facts → evidence items and unlock chains). Need 3–5 questions and a walkthrough. | Repo: MIT (verified LICENSE). HF dataset card: CC BY 4.0 (**unverified: snippet**). Redistributable. | Credit "MuSR (Sprague et al., ICLR 2024), CC BY 4.0"; note changes | Medium–high (restructure plus editorial) | GREEN |
| True Detective benchmark | github.com/TartuNLP/true-detective | 191 mysteries of ~1,200 words with multiple-choice answers | EN | JSON | Good case material | README: "sourced from 5minutemystery platform and can only be used for academic research". No LICENSE. | — | — | RED |
| 5 Minute Mystery | 5minutemystery.com | Hundreds of member-written mysteries | EN | Web | Good | Copyright of the site and its authors | — | — | RED |
| DetectBench | github.com/MikeGu721/DetectBench | 3,928 multiple-choice detective questions (~1k tokens) | ZH/EN | JSON: context, question, options, answer, explanation | Partial | No LICENSE found (README only). "Collected from open-source platforms and rewritten". | — | — | RED |
| WhoDunIt | HF jinsha-x/WhoDunIt; arXiv 2502.07747 | Public-domain mystery novels and stories from Gutenberg with culprit labels (~200?) | EN | Full text + culprit list | Finder list | Dataset license unstated; underlying texts public domain (US) | Gutenberg trademark: strip the PG header if redistributing text | — | GREEN via Gutenberg originals |
| Public-domain detective fiction (EN) | gutenberg.org / standardebooks.org (CC0 editions) | Hundreds of stories | EN | Plain text / XHTML | Plot, clues and solution present. Needs restructuring into evidence and questions. | Public domain in US. Also EU/Spain for Doyle, Chesterton (pre-1923 Father Brown), Futrelle, Poe, Morrison. Standard Ebooks releases its transcriptions as CC0. | None required (credit as courtesy) | High per case (~1–2 h with an LLM plus edit) | GREEN |
| Public-domain detective fiction (ES) | es.wikisource.org; Gutenberg #67248 (*El clavo*); LibriVox | Alarcón *El clavo* (1853), Pardo Bazán crime stories (*La gota de sangre*, 1911), anonymous 1909 *Aventuras de Sherlock Holmes* | ES | Wiki text / plain text | As above | Original works public domain (authors died >80 years ago). Anonymous 1909 translation: public domain (70 years after publication). **Named modern translations are NOT public domain.** | Courtesy credit; es.wikisource transcriptions are CC BY-SA, so take the text from scans or Gutenberg, or rewrite (our case text is a rewrite anyway) | High | GREEN |
| Ripley, *Minute Mysteries [Detectograms]* | gutenberg.org/ebooks/50603 | ~71 one-page Professor Fordney puzzles with solutions (1932) | EN | Plain text | Fits a situation puzzle / mini-case (setup, clue, solution) | "Public domain in the USA" per Gutenberg (**unverified: snippet**). Non-US status unknown (death date not found). Commercial 2024 reissue of the same text exists. | — | Low–medium | AMBER |
| Baroness Orczy, *The Old Man in the Corner* | gutenberg.org/ebooks/10556 | 12 armchair-detective stories | EN | Text | Good case material | Public domain in US; **not public domain in Spain until 2028** (d. 1947, life + 80) | — | — | AMBER (US-only); skip for now |
| Matt Clifford murder mysteries | matthewclifford.com/murder-mysteries | 3 party role-play games | EN | PDF | Weak (character role-play) | "Creative Commons licence" (variant unverified) | Depends on variant | High | AMBER |
| "Murder, they wrote" | mari511.itch.io/murder-they-wrote | One itch.io game | EN | PDF | Partial | CC BY-NC-SA 4.0 (snippet) | Non-commercial plus share-alike: makes our deck non-commercial | — | AMBER→RED |
| "Desk Job" (No Shit Sherlock jam, reported CC BY 4.0) | itch.io (unconfirmed) | Procedurally generated cold-case file | EN | PDF | Partial | Snippet said CC BY 4.0; a follow-up search could not confirm the page | — | — | UNVERIFIED |
| Commercial case games: Detective Stories, Sherlock Holmes Consulting Detective, Detective: A Modern Crime, Murder Mystery Time / Mindgle / Playing With Murder free printables, Unsolved Case Files, *5 Minute Murder*, *Armchair Detective Puzzle Book* | — | — | EN/ES | — | — | Copyrighted, or "personal, revocable licence" | — | — | RED (inspiration only) |

---

## 3. Recommended ingestion pipeline

All of these steps keep Kea's existing invariants: decks only through pack YAML, `public/decks/index.json` maintained by `scripts/lib/deck-index.ts`, and deterministic imports.

### 3.0 Schema change first (small) — done in #58

> Implemented with slightly different names: the public-domain id is `PDM-1.0`, the allow-list and rules live in `src/lib/content/licenses.ts`, and the validator rule is "share-alike cards only in decks whose licence is that share-alike licence; no mixing". `decks/LICENSES.md` was not added; the README "License" section notes that deck content carries its own licence.

Add provenance and licensing to the pack format, so attribution ships with the deck JSON and shows in the UI:

- **`SituationCard.source`:** extend `{ pack, ref, origin }` with `license` (SPDX id: `CC-BY-SA-4.0`, `CC-BY-4.0`, `PDM` for public domain), `author`, `url` and `modified: boolean`. Add origin `"adapted"`, distinct from `transcribed` (verbatim) and `generated`.
- **`CaseCard`:** add the same `source` object (it has none today).
- **Deck-level:** add `license` + `attribution` to pack YAML and deck JSON, shown on the start screen or deck info.
- **Validator rule:** reject any pack whose card licenses are incompatible with the deck license. BY-SA cards force a BY-SA deck, and BY-NC never mixes with others.
- **Repo:** add `decks/LICENSES.md`. Keep the app code license separate from content licenses (deck JSON is a separate "work").

### 3.1 Situation puzzles

1. **`scripts/import-stackexchange.ts`:** fetch posts by id (or `/questions?tagged=lateral-thinking&filter=withbody` via api.stackexchange.com; no key needed at low volume) into a raw cache file. Fields: title, body, accepted answer, author display name and profile URL, post URL, creation date, which gives the CC BY-SA version.
2. **Human curation pass:** keep only real situation puzzles that have an accepted canonical answer and are original to the poster. Drop anything credited to Sloane, MacHale or Black Stories, or that is a known commercial puzzle (check against LatEval/SPLAT/Hartman as a "known classic" list).
3. **LLM normalisation step:** a new `scripts/prompts/situation-normalize.md` with a JSON-schema output using `src/lib/ai/provider.ts`.
   - **Input:** raw setup + solution.
   - **Output:** title, setup (≤400 chars), solution, 3–8 atomic `keyFacts` (LatEval's `clue` field is a good few-shot example of the target shape, used privately), 1–4 hints ordered mild → strong, difficulty, `contentWarnings`, estMinutes.
   - **Wording:** keep the source wording where possible, so attribution stays honest. Mark `modified: true`.
4. **Write pack YAML:** `decks/puzzles/pse-lateral-en.yaml` with `origin: adapted`, deck `license: CC-BY-SA-4.0` (2.5/3.0 posts may be relicensed to 4.0 under the BY-SA compatibility rules) and per-card `source.url/author`.
5. `bun scripts/import-puzzles.ts --file … --dry-run`, then for real. Then run `bun scripts/check-solvability.ts --deck <id>` and drop or fix unsolvable items.
6. **Spanish:** `bun scripts/translate-decks.ts` into `pse-lateral-es.yaml`. It keeps the same `source` and adds a "translated by Kea" note; the result is still CC BY-SA. Run the solvability check again in ES, because wordplay often breaks in translation.
7. **Original packs (S1):** extend `generate-decks.ts` with a "seed premise" list. These are one-line premises written by us, not copied text. Generate EN and ES natively, with origin `generated` and license of our choice (e.g. CC BY 4.0 or CC0).

### 3.2 Case files

1. **`scripts/adapt-case.ts`** (LLM-assisted, human-in-the-loop). Its output is a *draft* `decks/cases/<pack>-<lang>.yaml`, never JSON.
   - **Input:** a public-domain source text (from Standard Ebooks or Gutenberg with the PG header stripped) or a MuSR item.
   - **The LLM produces:** briefing; 8–15 evidence items (interview / document / phone_log / map), each with `unlockAfter` chains; 3–5 questions with `answer`, `acceptedVariants` and `proof` evidence ids; and a walkthrough citing evidence ids in backticks, matching `case-pack.ts` conventions.
   - **Checks:** the existing importer validates that proof ids are cited in the walkthrough. Run a case eval with `bun scripts/eval-keeper.ts --suite case` (stub, then a real provider when keys are available) to check fairness.
2. **MuSR adapter:**
   - Map `context` to a seed narrative, and the reasoning-tree leaves (means / motive / opportunity facts per suspect) to evidence items.
   - Add a red-herring suspect if needed, because MuSR has only 2.
   - Q1 = "who", then add "how" / "why" / "what proves it".
   - Deck attribution: "Adapted from MuSR (Sprague et al., 2024), CC BY 4.0". Mark `modified: true`.
3. **Spanish:** adapt Spanish public-domain originals natively (Alarcón, Pardo Bazán, the 1909 anonymous Holmes) and translate the EN cases. Images and maps are generated or drawn by us, so we own them (put them under `decks/cases/assets/<pack>/`).
4. **Volume target:** about 2–4 hours per polished case including editing. Start with 3 EN + 3 ES (e.g. Holmes "The Red-Headed League", Father Brown "The Blue Cross", Futrelle "The Problem of Cell 13", *El clavo*, *La gota de sangre*, one MuSR).

---

## 4. Open questions and risks

1. **Unverified licenses** (the primary pages could not be opened during the research): MuSR's HF card (CC BY 4.0), Ripley's PD flag, Wikibooks and Stack Exchange page footers, Clifford's CC variant, "Desk Job". Allow huggingface.co, gutenberg.org, wikimedia and stackexchange hosts, or check them manually.
2. **Share-alike creep:** if one CC BY-SA puzzle lands in a deck, the whole deck JSON is BY-SA. Keep BY-SA content in separate packs, and decide whether we accept BY-SA at all (it is compatible with a public repo, but means anyone may reuse our edited versions).
3. **"Classic" puzzle provenance:** even community posts (Stack Exchange, Reddit) often repost Sloane / Black Stories puzzles. A poster cannot license what isn't theirs, so a dedupe/check against known commercial puzzles is needed. Also add a written policy that photo quick-add (`/add`) must not be used to transcribe commercial cards.
4. **Spanish public domain:** Spain's life + 80 rule (for pre-1987 deaths) is stricter than the US. Translations carry their own copyright. Is the global site OK with US-only public domain (Ripley, Orczy)? Recommendation: no, for now.
5. **LLM-generated source data (MuSR):** quality is uneven and plots repeat. OpenAI terms historically assign output rights to the user, and the authors license it CC BY 4.0, so the risk is low but should be noted.
6. **Content warnings:** turtle-soup and Black-Stories-style corpora skew heavily toward suicide, cannibalism and child death. `content-warnings.ts` tagging must run on every ingested item.
7. **Attribution UI:** is a deck-info credits line enough, or must per-card credit be visible when a card is played? Stack Exchange's terms ask for a link per post. Recommendation: show the per-card `source.author` + link on the solution or reveal screen.
8. **Maintenance:** Stack Exchange posts get edited; pin the revision id in `source.ref`.

---

## 5. Kea's policy and tooling (issue #58)

### Licence rules

The allow-list and checks are in `src/lib/content/licenses.ts` (re-exported as `scripts/lib/licenses.ts`), shared by the importers, the validators, the app's credits UI and the Worker.

| Rule | Where it is enforced |
|---|---|
| Card `source.license` and deck `license` must be one of `PDM-1.0`, `CC0-1.0`, `CC-BY-3.0`, `CC-BY-4.0`, `CC-BY-SA-2.5`, `CC-BY-SA-3.0`, `CC-BY-SA-4.0`, `MIT` | `contentSourceErrors`, `deckLicenseFieldErrors`; pack parsers |
| `origin: adapted` needs `license` and `url` | `contentSourceErrors` (situation and case validators) |
| CC BY, CC BY-SA and MIT need `author` | `contentSourceErrors` |
| A deck with any share-alike card: every card share-alike, deck `license` = that share-alike licence; an older version only as an adaptation (`modified: true`) | `deckLicenseErrors` (`puzzlePackToDeck`, `casePackToDeck`, `validateCaseDeck`) |
| Translations keep source/licence fields; external cards become `modified: true` | `translatedSource`, `translatedDeckLicensing` (`scripts/lib/deck-translation.ts`) |
| Stack Exchange licence per post: `content_license` from the API, else by date (before 2011-04-08 CC BY-SA 2.5, before 2018-05-02 CC BY-SA 3.0, then 4.0); a card combining question and answer takes the latest version and credits both authors | `scripts/lib/stackexchange.ts` |

All new fields are optional, so Kea's own decks are unchanged. Kea-original cards keep `source: { origin, pack }` and show no credit.

### Fields

- Card `source` (situation and case): `{ origin, pack?, ref?, license?, author?, url?, modified? }`, origin one of `original | generated | transcribed | adapted`.
- Deck and `DeckMeta`: optional `license` and `attribution` (the index builder copies them only when set).
- Puzzle pack YAML: pack-level `license`, `attribution`; per puzzle `origin`, `ref`, `license`, `author`, `url`, `modified`. Case pack YAML: the same at pack and per-case level (a case gets a `source` only when one of those fields is set).

### Pipeline

1. **Raw items** (git-ignored, `decks/sources/`): `scripts/import-stackexchange.ts` (Stack Exchange API, `lateral-thinking` questions with accepted answers, `--min-score`, `--max`, `--dry-run`; posts naming commercial sources are flagged) and `scripts/import-story.ts` (plain-text story with `--url --author --license`; Project Gutenberg boilerplate is stripped).
2. **Normalisation** (`scripts/normalize-sources.ts`, shared provider from `src/lib/ai/provider.ts`): puzzles get setup ≤ 400 chars, solution, key facts and hints; stories become a case with briefing, text evidence with unlock chains, questions with proofs and a walkthrough citing evidence ids. The licence, author and URL always come from the raw item, never from the model. Output: a draft in `decks/drafts/sources/` (git-ignored) with a review checklist and any validation problems in its header.
3. **Human review:** confirm the licence and author on the live page, check the post is the poster's own work (not Sloane / Black Stories), compare the wording, check content warnings.
4. **Import:** move the draft to `decks/puzzles/` or `decks/cases/` and run the usual importer (which re-validates, licence rules included), then `check-solvability.ts` for puzzles and the case eval for cases.

Re-running is deterministic: raw items have a fixed key order and no timestamps (unchanged files are not rewritten), `--replay` normalisation is byte-identical, and the importers keep the deck version when content is unchanged.

### Fixture walk-through

`scripts/fixtures/sources/` holds original text written for the tests, in the shape of the real inputs: recorded Stack Exchange API responses (`stackexchange/questions.json`, `answers.json`; example.org links, fictional authors), a short original story (`story-the-brass-key.txt`, released as CC0 to stand in for a public-domain text) and recorded model output (`*-replay.json`). To rebuild the two fixture decks:

```bash
bun scripts/import-stackexchange.ts --recorded scripts/fixtures/sources/stackexchange
bun scripts/import-story.ts --file scripts/fixtures/sources/story-the-brass-key.txt \
  --url https://example.org/kea-fixture/stories/the-brass-key --author "Kea test fixture" --license CC0-1.0
bun scripts/normalize-sources.ts --input decks/sources/stackexchange --pack sample-cc-by-sa \
  --name "Sample: CC BY-SA source (fixture)" --replay scripts/fixtures/sources/stackexchange-replay.json
bun scripts/normalize-sources.ts --input decks/sources/stories/the-brass-key.json --pack sample-public-domain \
  --name "Sample: public-domain story (fixture)" --replay scripts/fixtures/sources/story-replay.json
# review, then move (dropping the draft header) and import
bun scripts/import-puzzles.ts --file decks/puzzles/sample-cc-by-sa-en.yaml
bun scripts/import-cases.ts --file decks/cases/sample-public-domain-en.yaml
```

`scripts/lib/source-pipeline.test.ts` runs the same steps in memory and checks that they reproduce the committed packs and decks; `tests/content-sources.spec.ts` checks the credits in the app.

### Not done yet

- No real pack has been imported: the Stack Exchange API and the source pages were not reachable while building this, and no model keys were available, so the importers and prompts are only tested against fixtures and a replayed model.
- The licences marked "unverified" above still need checking on the live pages before any import.

