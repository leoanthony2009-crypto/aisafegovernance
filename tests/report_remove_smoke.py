#!/usr/bin/env python3
"""Smoke tests for the Report Remove staff quick reference (built page).
Usage: python3 tests/report_remove_smoke.py [path-to-built-html]"""
import asyncio, base64, io, json, re, sys
from playwright.async_api import async_playwright

PAGE = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/aisafeguardingreview/staff-report-remove-briefing.html'
URL = 'file://' + PAGE
fails = []
def check(name, ok, info=''):
    print(('ok   ' if ok else 'FAIL ') + name + (('  ' + str(info)) if (info and not ok) else ''))
    if not ok: fails.append(name)

async def fresh(b, **kw):
    ctx = await b.new_context(**kw)
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    await pg.goto(URL); await pg.wait_for_timeout(200)
    return ctx, pg, errs

async def main():
    html = open(PAGE, encoding='utf-8').read()
    # static checks
    check('no external resources', not re.search(r'(src|href)="https?://(?!www\.childline|aisafegovernance)[^"]+\.(js|css|woff2?)', html))
    check('no target=_blank', 'target="_blank"' not in html)
    check('no negative contractions in guidance', not re.search(r"\b(Don|Can|Won|Shouldn)[’']t\b", html))
    check('no dark-mode theme', 'prefers-color-scheme' not in html)
    check('no border-radius in print', not re.search(r'@media print[\s\S]*border-radius:(?!0)', html))
    m = re.search(r"script-src 'sha256-([^']+)'", html); js = re.search(r'<script>([\s\S]*?)</script>', html).group(1)
    import hashlib
    check('CSP hash matches inline script', m and base64.b64encode(hashlib.sha256(js.encode()).digest()).decode() == m.group(1))
    check('short Childline address used', 'childline.org.uk/remove' in html and 'online-mobile-safety/report-remove' not in html)
    check('LADO, Take It Down, POSH present', all(x in html for x in ['LADO', 'takeitdown.ncmec.org', 'helpline@saferinternet.org.uk', '0800 028 0285']))
    check('suicidal wording in referral point 5', 'presenting as suicidal or self-harming' in html)

    async with async_playwright() as p:
        b = await p.chromium.launch()

        # 1. read mode on load, no errors, 999 live
        ctx, pg, errs = await fresh(b)
        check('no script errors on load', not errs, errs[:2])
        check('toolbar revealed by script', not await pg.evaluate("document.getElementById('toolbar').hidden"))
        check('starts in read mode', not await pg.evaluate("document.querySelector('main').classList.contains('editing')"))
        check('nothing editable on load', await pg.evaluate("document.querySelectorAll('[contenteditable]').length") == 0)
        check('999 is a live tel link', await pg.evaluate("getComputedStyle(document.querySelector('a[href=\"tel:999\"]')).pointerEvents") != 'none')
        check('no status noise on first visit', (await pg.inner_text('#status')).strip() == '')
        # phone: no horizontal scroll
        await pg.set_viewport_size({'width': 360, 'height': 700})
        check('no horizontal overflow at 360px', await pg.evaluate("document.documentElement.scrollWidth") <= 360)
        await pg.set_viewport_size({'width': 1200, 'height': 900})

        # 2. edit: fields mirror, placeholder selected, limit enforced, persisted
        await pg.click('#editBtn')
        check('edit mode toggles', await pg.evaluate("document.querySelector('main').classList.contains('editing')"))
        check('fields editable, guidance locked', await pg.evaluate("document.querySelectorAll('.f[contenteditable]').length>10 && document.querySelectorAll('.g[contenteditable]').length===0"))
        check('adopted defaults to current month', await pg.evaluate("/\\d{4}$/.test(document.querySelector('.f[data-f=adopted]').textContent)"))
        f = pg.locator('.fm .f[data-f="dsl-name"]')
        await f.click()
        sel = await pg.evaluate("getSelection().toString()")
        check('placeholder selected on focus', sel == '[DSL name]', sel)
        await pg.keyboard.type('Mrs J Smith')
        await pg.locator('.fm .f[data-f="dsl-phone"]').click(); await pg.keyboard.type('0121 464 1234')
        await pg.locator('.fm .f[data-f="school"]').click(); await pg.keyboard.type("St Anne's Catholic Primary School")
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(500)
        check('DSL name mirrored into care card', await pg.inner_text('.cc .big') == 'Tell Mrs J Smith on 0121 464 1234')
        check('school name mirrored to back page', 'St Anne' in await pg.evaluate("document.querySelector('.back .runhead').textContent"))
        await pg.locator('.fm .f[data-f="dep-name"]').click(); await pg.keyboard.type('x' * 60); await pg.wait_for_timeout(100)
        check('field length limited', len(await pg.inner_text('.fm .f[data-f="dep-name"]')) <= 40)
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(500)
        st = json.loads(await pg.evaluate("localStorage.getItem('aisg-rr-briefing-v2')"))
        check('state stored by field id', st['f'].get('dsl-name') == 'Mrs J Smith' and st['f'].get('school', '').startswith('St Anne'))
        check('no guidance stored', st['g'] == {})
        # done editing: phone becomes tel link
        await pg.click('#editBtn'); await pg.wait_for_timeout(100)
        check('DSL phone becomes tel link in read mode', await pg.evaluate("!!document.querySelector('.cc .big a[href=\"tel:01214641234\"]')"))
        check('provenance in footer', 'School details added' in await pg.inner_text('#prov'))
        # reload keeps edits and shows notice
        await pg.reload(); await pg.wait_for_timeout(200)
        check('edits survive reload', await pg.inner_text('.cc .big') == 'Tell Mrs J Smith on 0121 464 1234')
        check('local-edits notice shown', 'holds school details' in await pg.inner_text('#status'))

        # 3. guidance editing stored with hash; revision drops it
        await pg.click('#editBtn'); await pg.check('#gToggle'); await pg.wait_for_timeout(100)
        check('guidance editable after toggle', await pg.evaluate("document.querySelectorAll('.g[contenteditable]').length>10"))
        g = pg.locator('.g[data-g="s3"]'); await g.click(); await pg.keyboard.press('End'); await pg.keyboard.type(' Extra.'); await pg.wait_for_timeout(500)
        st = json.loads(await pg.evaluate("localStorage.getItem('aisg-rr-briefing-v2')"))
        check('guidance edit stored with hash', 's3' in st['g'] and 'h' in st['g']['s3'] and 'Extra.' in st['g']['s3']['html'])
        check('adapted note in footer', 'adapted' in await pg.inner_text('#prov'))
        # simulate a revision: change the published text of s3 in a copy of the page
        rev = html.replace('and the time. Do not look at the device to get these.', 'and the time. Do not touch the device.')
        revpath = PAGE + '.rev.html'
        open(revpath, 'w', encoding='utf-8').write(rev)
        await pg.goto('file://' + revpath); await pg.wait_for_timeout(200)
        check('revised guidance replaces stale edit', 'Do not touch the device' in await pg.inner_text('.g[data-g="s3"]') and 'Extra.' not in await pg.inner_text('.g[data-g="s3"]'))
        check('school details kept through revision', await pg.inner_text('.cc .big') == 'Tell Mrs J Smith on 0121 464 1234')
        check('revision notice shown', 'revised' in await pg.inner_text('#status'))
        await pg.goto(URL); await pg.wait_for_timeout(200)

        # 4. reset: two steps, undo
        await pg.click('#editBtn'); await pg.click('#resetBtn')
        check('reset asks first', 'Yes, reset everything' in await pg.inner_text('#status') and await pg.inner_text('.cc .big') == 'Tell Mrs J Smith on 0121 464 1234')
        await pg.get_by_role('button', name='Yes, reset everything').click(); await pg.wait_for_timeout(100)
        check('reset clears', '[DSL name]' in await pg.inner_text('.cc .big') and await pg.evaluate("localStorage.getItem('aisg-rr-briefing-v2')") is None)
        await pg.get_by_role('button', name='Undo').click(); await pg.wait_for_timeout(100)
        check('undo restores', await pg.inner_text('.cc .big') == 'Tell Mrs J Smith on 0121 464 1234')

        # 5. print guard and fills
        ctx2, pg2, _ = await fresh(b)
        printed = []
        await pg2.expose_function('__printed', lambda: printed.append(1))
        await pg2.evaluate("void (window.print=()=>window.__printed())")
        await pg2.click('#printBtn'); await pg2.wait_for_timeout(100)
        check('print blocked once when required blank', not printed and 'Print anyway' in await pg2.inner_text('#status'))
        await pg2.get_by_role('button', name='Print anyway').click(); await pg2.wait_for_timeout(100)
        check('print anyway prints', len(printed) == 1)
        await pg2.evaluate("window.dispatchEvent(new Event('beforeprint'))")
        check('placeholders become fill lines before print', await pg2.evaluate("document.querySelectorAll('.f .fill').length") >= 10)
        await pg2.evaluate("window.dispatchEvent(new Event('afterprint'))")
        check('placeholders restored after print', await pg2.evaluate("document.querySelectorAll('.f .fill').length") == 0)
        await pg2.emulate_media(media='print')
        pdf = await pg2.pdf(format='A4', print_background=True, prefer_css_page_size=True)
        from pypdf import PdfReader
        check('blank sheet prints to two sides (A4)', len(PdfReader(io.BytesIO(pdf)).pages) == 2)
        pdf = await pg2.pdf(format='Letter', print_background=True, prefer_css_page_size=False)
        check('blank sheet prints to two sides (Letter)', len(PdfReader(io.BytesIO(pdf)).pages) == 2)
        await pg2.emulate_media(media='screen')

        # 7. export
        if await pg.evaluate("document.getElementById('editpanel').hidden"): await pg.click('#editBtn')
        async with pg.expect_download() as dl:
            await pg.click('#saveBtn')
        d = await dl.value
        path = await d.path(); exp = open(path, encoding='utf-8').read()
        check('export filename from school', (d.suggested_filename).startswith('staff-quick-reference-st-annes'))
        check('export has no script or tools', '<script' not in exp and 'id="toolbar"' not in exp and 'id="editpanel"' not in exp and 'contenteditable=' not in exp)
        check('export CSP has no script-src', 'script-src' not in exp)
        check('export carries school details', re.search(r'Tell <span[^>]*>Mrs J Smith</span> on', exp) is not None and 'St Anne' in exp)
        check('export fills blank fields as lines', 'class="fill"' in exp)
        check('export keeps copyright and source line', 'Wendell Gopaul' in exp and 'UKCIS' in exp)

        # 8. logo round-trip (PNG)
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP4z8DwHwyBNAMDAC1oA/4b9H9RAAAAAElFTkSuQmCC')
        await pg.set_input_files('#logoFile', {'name': 'crest.png', 'mimeType': 'image/png', 'buffer': png}); await pg.wait_for_timeout(300)
        check('logo shown', not await pg.evaluate("document.querySelector('.crest').hidden"))
        check('logo stored separately', (await pg.evaluate("(localStorage.getItem('aisg-rr-briefing-logo-v2')||'').slice(0,15)")) == 'data:image/png;')
        await pg.click('#logoRemove'); await pg.wait_for_timeout(100)
        check('logo removed', await pg.evaluate("document.querySelector('.crest').hidden"))

        # 6. filled sheet still two sides with a long DSL line
        await pg.emulate_media(media='print')
        await pg.evaluate("""()=>{const f={school:"St Anne's Catholic Primary School, Birmingham",'dsl-name':'Mrs J Smith','dsl-phone':'0121 464 1234 (office) or 07700 900123','dep-name':'Mr T Brown','dep-phone':'07700 900456',adopted:'November 2026',review:'November 2027',system:'CPOMS',wellbeing:'Mrs A Patel','csc-day':'0121 303 1888','csc-ooh':'0121 675 4806',lado:'0121 675 1669'};localStorage.setItem('aisg-rr-briefing-v2',JSON.stringify({f,g:{},editedAt:'8 November 2026'}))}""")
        await pg.reload(); await pg.wait_for_timeout(200)
        pdf = await pg.pdf(format='A4', print_background=True, prefer_css_page_size=True)
        check('filled sheet prints to two sides (A4)', len(PdfReader(io.BytesIO(pdf)).pages) == 2)
        pdf = await pg.pdf(format='Letter', print_background=True, prefer_css_page_size=False)
        check('filled sheet prints to two sides (Letter)', len(PdfReader(io.BytesIO(pdf)).pages) == 2)
        await pg.emulate_media(media='screen')

        # 9. migration from v1 store
        ctx3, pg3, _ = await fresh(b)
        await pg3.evaluate("localStorage.clear(); localStorage.setItem('aisg-sqr-any-v1', JSON.stringify({e:{'0':'Old School <b>Name</b>'},color:'',logo:''}))")
        await pg3.reload(); await pg3.wait_for_timeout(200)
        check('v1 school name migrated', 'Old School Name' in await pg3.inner_text('.fm .school'))

        # 10. tampered store ignored
        await pg3.evaluate("localStorage.setItem('aisg-rr-briefing-v2', JSON.stringify({f:{school:'<img src=x onerror=alert(1)>', bogus:'x'}, g:{s3:{h:'bad',html:'<script>alert(1)</script>evil'}}}))")
        await pg3.reload(); await pg3.wait_for_timeout(200)
        check('field value rendered as text', await pg3.evaluate("!document.querySelector('.fm .school img')") and '<img' in await pg3.inner_text('.fm .school'))
        check('bad-hash guidance ignored', 'evil' not in await pg3.inner_text('.g[data-g="s3"]'))
        await b.close()
    import os
    try: os.remove(PAGE + '.rev.html')
    except OSError: pass
    print(f"\n{len(fails)} failed" if fails else "\nall passed")
    sys.exit(1 if fails else 0)

asyncio.run(main())
