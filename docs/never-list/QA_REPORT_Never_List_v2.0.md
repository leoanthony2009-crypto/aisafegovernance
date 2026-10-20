# QA report — The safeguarding never list (v2.0, October 2026)

**Deliverable:** `downloads/AISG_Safeguarding_Never_List_v2.0_2026-10.pdf`
**Editable source:** `tools/downloads-src/aisg-never-list.html` (rebuild with `node tools/build-downloads.cjs aisg-never-list.html`)
**Also served from:** the course's resource list (index.html), "Download PDF" button, same bytes and file name.
**Checked:** 20 October 2026. These scores are internal editorial checks, not official compliance certifications.

## What changed from the previous version

The previous PDF used about 55% of the A4 page, and the lower half was blank. Its tick and cross symbols were Type 3 glyphs, and it had no review date or page number. The redesign keeps the core message, *Your job is the child in front of you, not the evidence*, and keeps prohibited actions separate from safe alternatives. It adds:

- a red **Urgent** panel for immediate danger (999) and sextortion;
- a **Who to tell / What to record / When to escalate** action row;
- a **basis label** on every line, which separates law, statutory guidance (KCSIE), official advice (UKCIS, NCA) and AISG's own recommendations;
- a source key with links, and a full footer: brand, URL, published date, review date, version, page X of Y, and an independence disclaimer.

### Substantive wording corrections (verified against sources)

| Change | Why | Source |
|---|---|---|
| "tell the DSL **the same day**" became "tell the DSL or deputy **immediately**" | UKCIS says incidents "should be immediately reported to the DSL"; the KCSIE 2026 staff overview says "Act immediately on any concern – do not delay" | UKCIS 2024; KCSIE 2026 |
| Added "If you saw it by accident, tell the DSL" | UKCIS: "If you have already viewed the imagery by accident … report this to the DSL" | UKCIS 2024 |
| Added "Never blame or shame anyone — including a pupil who forwarded an image" | UKCIS: "Do not say or do anything to blame or shame any young people involved"; NCA asks staff to avoid victim-blaming language | UKCIS 2024; NCA 2024 |
| Sextortion: added "do not pay, stop replying, delete nothing" | NCA: "Don't pay, do stop contact and block"; "try not to delete anything that could be used as evidence" | NCA, 29 April 2024 |
| "Copying it can itself be a crime" kept, and now explicitly covers AI-generated images | Protection of Children Act 1978 s.1(1)(a) makes it an offence "to make" an indecent photograph **or pseudo-photograph** of a child | legislation.gov.uk |
| No instruction to view, copy, circulate, investigate or handle imagery | Required by the brief and by UKCIS | — |

## Checks performed

| Check | Result |
|---|---|
| Page size and count | A4 (209.9 × 297.0 mm), 1 page. The build fails if the content runs to a second page |
| Margins | 16 mm sides, 15 mm top; footer ends 10 mm from the bottom edge |
| Page utilisation | Content runs from 15 mm to 286.8 mm; 3.7 mm of deliberate space above the footer rule; no empty band |
| Visual inspection | Rendered with MuPDF at 110–220 dpi (whole page plus zoomed crops), then revised and re-rendered over several rounds. Fixed: overflow and clipping in the first draft, an orphaned word, footer wrapping. No overlaps, clipped text or misaligned icons in the final render |
| Typography | IBM Plex Sans body, Montserrat headings, both embedded as TrueType subsets (no Type 3). Title 23 pt; section headings 12–13 pt; body and callouts 10.5 pt; basis labels, source key and footer 8.5 pt; brand line 8.5–9 pt |
| Colour contrast (WCAG 2.2 AA) | Lowest pair: white on teal #007F75, 4.89:1 (13 pt bold heading). Body text 13.8–14.4:1; red text 6.6–8.6:1; links 6.4:1 |
| Not colour alone | Every item starts with the word "Never" or an action verb, and the sections are headed in text: "NEVER DO THIS" and "DO THIS INSTEAD" |
| Tagging (PDF/UA-oriented) | Tagged PDF, `/Lang en-GB`, title shown in the window title bar, XMP metadata with the pdfuaid flag, tab order follows structure. Tag tree: H1 → H2 → H3; 3 lists (13 LI/LBody); 3 Link elements with descriptive annotation text. Icons, row shading and rules are marked as artifacts |
| Reading-order defect found and fixed | Chromium tagged inline item text and row shading as list "labels" (Lbl). Item text is now wrapped in paragraphs, and the build script now turns text-less list decoration into artifacts. This step was also run on two other PDFs in the pack to confirm it is safe; their committed files were left unchanged |
| Text extraction | 2,835 characters, no replacement characters |
| Metadata | Title, author, subject, keywords, language and creation date set |
| Course integration | Loaded index.html in a headless browser: no script errors. The PDF download matches the file in /downloads byte for byte; the HTML download contains the updated wording |

**Not run:** veraPDF and PAC were not available in this environment, so the PDF has **not** been machine-validated against PDF/UA-1 for this release. No screen-reader test was carried out.

## Scorecard (internal)

| Quality area | Target | Score | Note |
|---|---|---|---|
| Safeguarding accuracy | 10 | 9.5 | Two points need human review (see below) |
| Page utilisation and balance | 9+ | 9.5 | |
| Typography and readability | 9+ | 9 | Basis labels and footer are 8.5 pt, the lower limit |
| Visual consistency | 10 | 9.5 | New palette; the rest of the pack still uses the older #1F3A5F navy |
| Practical usefulness | 10 | 9.5 | DSL fill-in fields dropped to fit the page; the wall sheet keeps them |
| Accessibility | 9+ | 9 | Tagging checked by inspection only; no veraPDF run |
| Source traceability | 10 | 10 | Every line labelled; source key linked |
| Header and footer quality | 10 | 10 | |
| Overall publication readiness | 9.5+ | 9.5 | Subject to the human-review items below |

## Sources checked (accessed 20 October 2026)

- DfE, *Keeping children safe in education 2026* (in force 1 September 2026) — https://www.gov.uk/government/publications/keeping-children-safe-in-education--2 and the part one overview for all staff on the same page.
- UKCIS, *Sharing nudes and semi-nudes: how to respond to an incident (overview)*, last updated 11 March 2024 — https://www.gov.uk/government/publications/sharing-nudes-and-semi-nudes-advice-for-education-settings-working-with-children-and-young-people
- National Crime Agency, *NCA issues urgent warning about 'sextortion'*, 29 April 2024 — https://www.nationalcrimeagency.gov.uk/news/nca-issues-urgent-warning-about-sextortion
- Protection of Children Act 1978, section 1 — https://www.legislation.gov.uk/ukpga/1978/37/section/1
- DfE, *Searching, screening and confiscation* (July 2022, page updated 19 July 2023) — https://www.gov.uk/government/publications/searching-screening-and-confiscation. Only the landing page was checked; the PDF text was not.
- Childline Report Remove page — the request returned HTTP 403, so it could not be checked. Report Remove is not cited in this document.

## For human review before publication

1. **"Same day" vs "immediately".** This document now says "immediately", following UKCIS and KCSIE. Other documents in the pack, and the course itself, still say "the same day". Decide on one wording across the pack.
2. **"Never promise to keep it secret" (labelled KCSIE).** The KCSIE 2026 staff overview does not state this. It is long-standing KCSIE part one guidance, but the 2026 paragraph has not been confirmed in the full PDF.
3. **"Neither free? … speak to a senior leader or children's social care"** paraphrases the KCSIE part one wording on an unavailable DSL. Confirm against the 2026 paragraph.
4. **"Copying can itself be a crime".** The statute says "make". Treating copying or downloading as "making" comes from case law (for example *R v Bowden*), which was not checked in this session.
5. **Review date.** The previous version said "Review each term". The footer now reads "next by January 2027". Confirm this date.
6. **Fonts.** The pack's IBM Plex Sans and Montserrat were kept for consistency, rather than switching to Source Sans 3, Arial, Aptos or Noto Sans.
7. **PDF/UA validation.** Run veraPDF (PDF/UA-1 profile) before release.
