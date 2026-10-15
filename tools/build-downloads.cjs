/* Builds the take-away PDFs in /downloads from the HTML sources in tools/downloads-src,
   and the public Open Badges files in /badges from the course's own badge code.
   Not part of the Netlify build: run it by hand after editing a source file, then commit the PDFs.

     npm i --prefix /tmp/aisg-pdf playwright-core@1 pdf-lib@1.17.1 @pdf-lib/fontkit@1
     npx --prefix /tmp/aisg-pdf playwright-core install chromium
     NODE_PATH=/tmp/aisg-pdf/node_modules node tools/build-downloads.cjs

   Each PDF is A4, one page, tagged to PDF/UA-1 (checked with veraPDF: headings, lists, tables,
   links and form fields all reach screen readers; decoration is marked as artifact),
   uses the course's own embedded fonts, and carries title, author, subject, keywords and
   language metadata. Write-in blanks ([placeholders] and ____ lines) become fillable form fields,
   so a school can type its own numbers before printing. */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { PDFDocument, PDFName, PDFString, PDFArray, PDFDict, PDFNumber, PDFRef, PDFRawStream, rgb, decodePDFRawStream } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(__dirname, 'downloads-src');
const OUT = path.join(ROOT, 'downloads');
const AUTHOR = 'AISG — AI Safeguarding & Governance (aisafegovernance.co.uk)';
const CREATOR = 'AISG course AISG-MC-4CS-01 v1.6';

const DOCS = [
  { src: 'aisg-ai-response-guide.html', out: 'aisg-ai-response-guide.pdf',
    subject: 'What every member of staff does when a safeguarding concern involves AI: listen, don’t look or copy, note, tell the DSL.',
    keywords: ['safeguarding', 'AI', 'KCSIE 2026', 'DSL', 'staff response'] },
  { src: 'aisg-4cs-reference.html', out: 'aisg-4cs-reference.pdf',
    subject: 'The four areas of online risk (content, contact, conduct, commerce) mapped to AI incidents in school.',
    keywords: ['safeguarding', '4Cs', 'online safety', 'KCSIE 2026', 'AI'] },
  { src: 'aisg-recording-checklist.html', out: 'aisg-recording-checklist.pdf',
    subject: 'What goes in a safeguarding record, what never does, and when it must be done.',
    keywords: ['safeguarding', 'recording', 'DSL', 'KCSIE 2026'] },
  { src: 'aisg-report-remove-guide.html', out: 'aisg-report-remove-guide.pdf',
    subject: 'How a pupil under 18 can use Childline and IWF Report Remove, and the school’s role around it.',
    keywords: ['safeguarding', 'Report Remove', 'Childline', 'IWF', 'nudes and semi-nudes'] },
  { src: 'aisg-staff-quick-reference.html', out: 'aisg-staff-quick-reference.pdf',
    subject: 'A4 wall sheet: what staff do about a nude, semi-nude or sexual image of a pupil. Fill in your school’s details, then print.',
    keywords: ['safeguarding', 'nudes and semi-nudes', 'UKCIS', 'KCSIE 2026', 'staff quick reference'] },
];

/* Static instances of the course typefaces (IBM Plex Sans, Montserrat; SIL OFL) so Chromium
   embeds them as real TrueType fonts rather than Type 3 outlines. */
function brandCss() {
  const face = (fam, w, file) => `@font-face{font-family:'${fam}';font-weight:${w};src:url(data:font/ttf;base64,${
    fs.readFileSync(path.join(__dirname, 'fonts', file)).toString('base64')}) format('truetype')}`;
  return '<style>' + [
    face('IBM Plex Sans', 400, 'IBMPlexSans-Regular.ttf'), face('IBM Plex Sans', 600, 'IBMPlexSans-SemiBold.ttf'),
    face('IBM Plex Sans', 700, 'IBMPlexSans-Bold.ttf'), face('Montserrat', 600, 'Montserrat-SemiBold.ttf'),
    face('Montserrat', 700, 'Montserrat-Bold.ttf'),
  ].join('') + `
body,button,input{font-family:'IBM Plex Sans',Arial,sans-serif!important}
.banner h1,h1,h2,h3,.band h1{font-family:'Montserrat','IBM Plex Sans',Arial,sans-serif!important}
:root{--font:'IBM Plex Sans',Arial,sans-serif!important}
.pdf-field{display:inline-block;width:15em;height:1.35em;vertical-align:-.3em;border-bottom:.75pt solid currentColor}
td .pdf-field{width:100%}
.school .pdf-field{width:22em;border-color:#fff}.u.tell .v .pdf-field{width:9em}
</style>`;
}

/* [Placeholders] and ____ write-in lines become blank spans of a known size that form fields sit on. */
async function markFields(page) {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = []; let n;
    while ((n = walker.nextNode())) if (/\[[^\]]+\]|_{4,}/.test(n.nodeValue)) nodes.push(n);
    const used = {};
    nodes.forEach((t) => {
      const frag = document.createDocumentFragment();
      t.nodeValue.split(/(\[[^\]]+\]|_{4,})/).forEach((p) => {
        let m = /^\[([^\]]+)\]$/.exec(p);
        if (/^_{4,}$/.test(p)) {
          const row = t.parentNode.closest('tr'), rh = row && row.querySelector('.rh');
          m = [p, rh ? rh.textContent.trim() : 'Details'];
        }
        if (!m) { if (p) frag.appendChild(document.createTextNode(p)); return; }
        const s = document.createElement('span');
        s.className = 'pdf-field';
        let label = m[1].charAt(0).toUpperCase() + m[1].slice(1);
        if (/local number/.test(m[1])) {
          const ctx = t.parentNode.closest('.c');
          const b = ctx && ctx.querySelector('b');
          label = b ? b.textContent.trim() + ' number' : label;
        }
        used[label] = (used[label] || 0) + 1;
        s.setAttribute('data-name', used[label] > 1 ? label + ' ' + used[label] : label);
        s.setAttribute('aria-label', label + ' (blank to fill in)');
        frag.appendChild(s);
      });
      t.parentNode.replaceChild(frag, t);
    });
  });
}

/* Find where Chromium placed each blank: a first render wraps every blank in a marker link,
   and the link annotations in that PDF give exact page rectangles. */
async function fieldBoxes(page, pdfOpts) {
  const info = await page.evaluate(() => [...document.querySelectorAll('.pdf-field')].map((el, i) => {
    const a = document.createElement('a');
    a.href = 'https://field.invalid/' + i;
    el.parentNode.insertBefore(a, el); a.appendChild(el);
    const cs = getComputedStyle(el);
    return { name: el.getAttribute('data-name'), fs: parseFloat(cs.fontSize), color: (cs.color.match(/[\d.]+/g) || [0, 0, 0]).map(Number) };
  }));
  if (!info.length) return [];
  const probe = await PDFDocument.load(await page.pdf(pdfOpts));
  const rects = {};
  probe.getPages().forEach((pg, pi) => {
    const annots = pg.node.Annots();
    if (!annots) return;
    annots.asArray().forEach((ref) => {
      const an = probe.context.lookup(ref);
      const act = an.lookup(PDFName.of('A'));
      const uri = act && act.lookup(PDFName.of('URI'));
      const m = uri && /field\.invalid\/(\d+)/.exec(uri.decodeText ? uri.decodeText() : uri.toString());
      if (m) rects[m[1]] = { page: pi, r: an.lookup(PDFName.of('Rect')).asArray().map((n) => n.asNumber()) };
    });
  });
  /* Unwrap the markers again so the final PDF carries no stray links. */
  await page.evaluate(() => document.querySelectorAll('a[href^="https://field.invalid/"]').forEach((a) => a.replaceWith(...a.childNodes)));
  return info.map((f, i) => Object.assign(f, rects[i])).filter((f) => f.r);
}

/* Chromium leaves backgrounds, borders and decorative circles outside the tag tree. Wrap every
   untagged path, text block, image or shading in an Artifact marker so assistive tech skips it.
   Path objects and BT/ET blocks cannot contain q/Q, so the markers always nest correctly. */
function tokenize(src) {
  const t = []; let i = 0; const n = src.length;
  const WS = /[\0\t\n\f\r ]/, DELIM = /[()<>\[\]{}\/%\0\t\n\f\r ]/;
  while (i < n) {
    const c = src[i];
    if (WS.test(c)) { i++; continue; }
    if (c === '%') { while (i < n && src[i] !== '\n' && src[i] !== '\r') i++; continue; }
    const st = i;
    if (c === '(') { let d = 0; for (; i < n; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === '(') d++; else if (src[i] === ')' && --d === 0) { i++; break; } } t.push({ v: src.slice(st, i) }); continue; }
    if (c === '<' && src[i + 1] === '<') { t.push({ v: '<<' }); i += 2; continue; }
    if (c === '>' && src[i + 1] === '>') { t.push({ v: '>>' }); i += 2; continue; }
    if (c === '<') { i = src.indexOf('>', i) + 1; t.push({ v: src.slice(st, i) }); continue; }
    if ('[]{}'.includes(c)) { t.push({ v: c }); i++; continue; }
    i++; while (i < n && !DELIM.test(src[i])) i++;
    const v = src.slice(st, i);
    t.push({ v, op: c !== '/' && !/^[-+.\d]/.test(v) && v !== 'true' && v !== 'false' && v !== 'null' });
  }
  return t;
}
function markArtifacts(src) {
  const toks = tokenize(src);
  if (toks.some((k) => k.op && k.v === 'BI')) return null; // inline images: leave the stream alone
  const ops = []; let operands = [];
  toks.forEach((k) => { if (k.op) { ops.push({ args: operands.map((o) => o.v), op: k.v }); operands = []; } else operands.push(k); });
  const PATH = new Set(['m', 'l', 'c', 'v', 'y', 'h', 're']), PAINT = new Set(['S', 's', 'f', 'F', 'f*', 'B', 'B*', 'b', 'b*']);
  const out = []; let depth = 0, i = 0;
  const emit = (o) => out.push((o.args.length ? o.args.join(' ') + ' ' : '') + o.op);
  while (i < ops.length) {
    const o = ops[i];
    if (o.op === 'BDC' || o.op === 'BMC') depth++;
    if (o.op === 'EMC') depth--;
    if (depth === 0 && PATH.has(o.op)) {
      let j = i; while (j < ops.length && (PATH.has(ops[j].op) || ops[j].op === 'W' || ops[j].op === 'W*')) j++;
      const end = ops[j];
      if (end && PAINT.has(end.op)) { out.push('/Artifact BMC'); for (let k = i; k <= j; k++) emit(ops[k]); out.push('EMC'); i = j + 1; continue; }
    }
    if (depth === 0 && o.op === 'BT') {
      let j = i, nested = false; while (j < ops.length && ops[j].op !== 'ET') { if (ops[j].op === 'BDC' || ops[j].op === 'BMC') nested = true; j++; }
      if (!nested) { out.push('/Artifact BMC'); for (let k = i; k <= j; k++) emit(ops[k]); out.push('EMC'); i = j + 1; continue; }
    }
    if (depth === 0 && (o.op === 'Do' || o.op === 'sh')) { out.push('/Artifact BMC'); emit(o); out.push('EMC'); i++; continue; }
    emit(o); i++;
  }
  return out.join('\n');
}
function artifactPages(pdf) {
  const ctx = pdf.context;
  pdf.getPages().forEach((pg) => {
    const c = pg.node.get(PDFName.of('Contents'));
    const refs = c instanceof PDFArray ? c.asArray() : [c];
    const src = refs.map((r) => {
      const st = ctx.lookup(r);
      const raw = st instanceof PDFRawStream ? decodePDFRawStream(st).decode() : st.getUnencodedContents();
      return Buffer.from(raw).toString('latin1');
    }).join('\n');
    const fixed = markArtifacts(src);
    if (fixed == null) return;
    pg.node.set(PDFName.of('Contents'), ctx.register(ctx.flateStream(Buffer.from(fixed, 'latin1'))));
  });
}

/* Chromium puts a list item's number and its blocks straight inside LI; PDF/UA wants Lbl + LBody. */
function fixListItems(pdf, root) {
  const ctx = pdf.context;
  const nums = root.lookup(PDFName.of('ParentTree'), PDFDict).lookup(PDFName.of('Nums'));
  const pageArr = {};
  for (let i = 0; i < nums.size(); i += 2) pageArr[nums.get(i).asNumber()] = nums.lookup(i + 1);
  const pageKey = (pgRef) => { const pd = ctx.lookup(pgRef, PDFDict), sp = pd.get(PDFName.of('StructParents')); return sp ? sp.asNumber() : null; };
  const walk = (ref) => {
    const el = ctx.lookup(ref);
    if (!(el instanceof PDFDict)) return;
    let k = el.get(PDFName.of('K'));
    const kids = k instanceof PDFArray ? k.asArray() : k ? [k] : [];
    const S = el.lookup(PDFName.of('S'));
    if (S === PDFName.of('LI')) {
      const isElem = (x) => x instanceof PDFRef && ctx.lookup(x) instanceof PDFDict && ctx.lookup(x).get(PDFName.of('S'));
      const ok = kids.every((x) => isElem(x) && ['Lbl', 'LBody'].includes(ctx.lookup(x).lookup(PDFName.of('S')).asString().slice(1)));
      if (!ok && kids.length) {
        const marks = kids.filter((x) => !isElem(x)), blocks = kids.filter(isElem);
        const newKids = [];
        const pg = el.get(PDFName.of('Pg'));
        if (marks.length) {
          const lbl = ctx.register(ctx.obj({ Type: 'StructElem', S: 'Lbl', P: ref, K: marks }));
          if (pg) ctx.lookup(lbl).set(PDFName.of('Pg'), pg);
          marks.forEach((m) => {
            const mcid = m instanceof PDFNumber ? m.asNumber() : ctx.lookup(m) instanceof PDFDict ? ctx.lookup(m).lookup(PDFName.of('MCID')).asNumber() : null;
            const arr = pg && pageArr[pageKey(pg)];
            if (mcid != null && arr) arr.set(mcid, lbl);
          });
          newKids.push(lbl);
        }
        if (blocks.length) {
          const body = ctx.register(ctx.obj({ Type: 'StructElem', S: 'LBody', P: ref, K: blocks }));
          blocks.forEach((b) => ctx.lookup(b).set(PDFName.of('P'), body));
          newKids.push(body);
        }
        el.set(PDFName.of('K'), ctx.obj(newKids));
      }
    }
    kids.forEach((x) => { if (x instanceof PDFRef) walk(x); });
  };
  walk(root.get(PDFName.of('K')));
}

/* Accessibility and metadata touches Chromium leaves out: an XMP metadata stream, descriptions on
   links, a role map for its inline tags, and form fields placed in the tag tree. */
function xmlEsc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function accessibility(pdf, title, subject, keywords, when) {
  const ctx = pdf.context, cat = pdf.catalog, iso = when.toISOString().replace(/\.\d+Z$/, 'Z');
  const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
<dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEsc(title)}</rdf:li></rdf:Alt></dc:title>
<dc:creator><rdf:Seq><rdf:li>${xmlEsc(AUTHOR)}</rdf:li></rdf:Seq></dc:creator>
<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xmlEsc(subject)}</rdf:li></rdf:Alt></dc:description>
<dc:language><rdf:Bag><rdf:li>en-GB</rdf:li></rdf:Bag></dc:language>
<pdf:Keywords>${xmlEsc(keywords.join(', '))}</pdf:Keywords><pdf:Producer>Chromium + pdf-lib</pdf:Producer>
<xmp:CreatorTool>${xmlEsc(CREATOR)}</xmp:CreatorTool><xmp:CreateDate>${iso}</xmp:CreateDate><xmp:ModifyDate>${iso}</xmp:ModifyDate>
</rdf:Description>
<rdf:Description rdf:about="" xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/"><pdfuaid:part>1</pdfuaid:part></rdf:Description></rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
  const md = ctx.stream(Buffer.from(xmp, 'utf8'), { Type: 'Metadata', Subtype: 'XML' });
  cat.set(PDFName.of('Metadata'), ctx.register(md));

  const root = cat.lookup(PDFName.of('StructTreeRoot'), PDFDict);
  if (root) {
    const rm = root.lookup(PDFName.of('RoleMap')) || ctx.obj({});
    ['Strong', 'Em', 'B', 'I', 'Mark', 'Code'].forEach((t) => rm.set(PDFName.of(t), PDFName.of('Span')));
    root.set(PDFName.of('RoleMap'), rm);
    fixListItems(pdf, root);
  }
  artifactPages(pdf);
  const docElem = root && root.lookup(PDFName.of('K'));
  const docRef = root && (root.get(PDFName.of('K')) instanceof PDFArray ? root.get(PDFName.of('K')).get(0) : root.get(PDFName.of('K')));
  const docDict = docElem instanceof PDFArray ? docElem.lookup(0, PDFDict) : docElem;
  const pt = root && root.lookup(PDFName.of('ParentTree'), PDFDict);
  const nums = pt && pt.lookup(PDFName.of('Nums'));
  let nextKey = root && root.lookup(PDFName.of('ParentTreeNextKey')) ? root.lookup(PDFName.of('ParentTreeNextKey')).asNumber() : 1000;

  pdf.getPages().forEach((pg) => {
    const annots = pg.node.Annots();
    if (!annots) return;
    annots.asArray().forEach((ref) => {
      const an = ctx.lookup(ref, PDFDict), sub = an.lookup(PDFName.of('Subtype'));
      if (sub === PDFName.of('Link') && !an.get(PDFName.of('Contents'))) {
        const act = an.lookup(PDFName.of('A')), uri = act && act.lookup(PDFName.of('URI'));
        const u = uri ? uri.decodeText() : '';
        const label = /^tel:/.test(u) ? 'Call ' + u.slice(4) : 'Link to ' + u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
        an.set(PDFName.of('Contents'), PDFString.of(label));
      }
      if (sub === PDFName.of('Widget') && docDict && nums) {
        const kids = docDict.lookup(PDFName.of('K'));
        const elem = ctx.obj({ Type: 'StructElem', S: 'Form', P: docRef, Pg: pg.ref,
          K: ctx.obj({ Type: 'OBJR', Obj: ref, Pg: pg.ref }) });
        const parent = an.lookup(PDFName.of('Parent'), PDFDict);
        const tu = (parent && parent.lookup(PDFName.of('TU'))) || an.lookup(PDFName.of('TU'));
        if (tu) elem.set(PDFName.of('Alt'), tu);
        const eref = ctx.register(elem);
        if (kids instanceof PDFArray) kids.push(eref); else docDict.set(PDFName.of('K'), ctx.obj([docDict.get(PDFName.of('K')), eref]));
        an.set(PDFName.of('StructParent'), PDFNumber.of(nextKey));
        nums.push(PDFNumber.of(nextKey)); nums.push(eref);
        nextKey++;
      }
    });
    pg.node.set(PDFName.of('Tabs'), PDFName.of('S'));
  });
  if (root) root.set(PDFName.of('ParentTreeNextKey'), PDFNumber.of(nextKey));
}

async function build() {
  fs.mkdirSync(OUT, { recursive: true });
  const css = brandCss();
  const browser = await chromium.launch();
  for (const d of DOCS) {
    const page = await browser.newPage();
    let html = fs.readFileSync(path.join(SRC, d.src), 'utf8');
    html = html.replace('</head>', css + '</head>');
    await page.setContent(html, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);
    await markFields(page);
    const pdfOpts = { format: 'A4', printBackground: true, preferCSSPageSize: true, tagged: true, outline: true };
    const boxes = await fieldBoxes(page, pdfOpts);
    const raw = await page.pdf(pdfOpts);
    await page.close();

    const pdf = await PDFDocument.load(raw, { updateMetadata: false });
    if (pdf.getPageCount() !== 1) throw new Error(d.out + ' runs to ' + pdf.getPageCount() + ' pages; it must fit on one A4 page');
    const title = (/<title>([^<]*)<\/title>/.exec(html) || [])[1].replace(/&amp;/g, '&');
    const now = new Date();
    pdf.setTitle(title, { showInWindowTitleBar: true });
    pdf.setAuthor(AUTHOR);
    pdf.setSubject(d.subject);
    pdf.setKeywords(d.keywords);
    pdf.setCreator(CREATOR);
    pdf.setProducer('Chromium + pdf-lib');
    pdf.setLanguage('en-GB');
    pdf.setCreationDate(now);
    pdf.setModificationDate(now);

    if (boxes.length) {
      pdf.registerFontkit(fontkit);
      /* Embed the full font so whatever a school types is shown and printed in the same face. */
      const plex = await pdf.embedFont(fs.readFileSync(path.join(__dirname, 'fonts', 'IBMPlexSans-Regular.ttf')), { subset: false });
      const form = pdf.getForm();
      boxes.forEach((b) => {
        const tf = form.createTextField(b.name);
        const [x1, y1, x2, y2] = b.r;
        tf.addToPage(pdf.getPage(b.page), {
          x: x1, y: Math.min(y1, y2), width: x2 - x1, height: Math.abs(y2 - y1),
          font: plex, borderWidth: 0, textColor: rgb(b.color[0] / 255, b.color[1] / 255, b.color[2] / 255),
          backgroundColor: undefined, borderColor: undefined,
        });
        tf.setFontSize(Math.max(7, Math.min(11, b.fs * 0.75))); // CSS px to pt
        /* Tooltip doubles as the accessible name of the field. */
        tf.acroField.dict.set(PDFName.of('TU'), PDFString.of(b.name));
      });
      form.updateFieldAppearances(plex);
    }
    accessibility(pdf, title, d.subject, d.keywords, now);
    const bytes = await pdf.save({ useObjectStreams: false });
    fs.writeFileSync(path.join(OUT, d.out), bytes);
    console.log(d.out, Math.round(bytes.length / 1024) + ' KB', boxes.map((b) => b.name).join(' | '));
  }
  await badgeFiles(browser);
  await browser.close();
}

/* The public Open Badges files the credentials point to, made by the course's own code so they
   always agree: the achievement definition, the issuer profile and the generic badge image. */
async function badgeFiles(browser) {
  const dir = path.join(ROOT, 'badges');
  fs.mkdirSync(dir, { recursive: true });
  const page = await browser.newPage();
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  const out = await page.evaluate(async () => {
    const issuer = Object.assign({ '@context': achievementDef()['@context'] }, issuerProfile());
    return { slug: CRED.slug, achievement: JSON.stringify(achievementDef(), null, 2), issuer: JSON.stringify(issuer, null, 2),
      png: Array.from(await badgePngBytes(800)) };
  });
  await page.close();
  fs.writeFileSync(path.join(dir, out.slug + '.json'), out.achievement + '\n');
  fs.writeFileSync(path.join(dir, 'issuer.json'), out.issuer + '\n');
  fs.writeFileSync(path.join(dir, out.slug + '.png'), Buffer.from(out.png));
  console.log('badges/', out.slug + '.json', 'issuer.json', out.slug + '.png');
}

build().catch((e) => { console.error(e); process.exit(1); });
