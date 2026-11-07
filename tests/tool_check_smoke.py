"""Regression tests for aisg-tool-check.html. Run: python3 tests/tool_check_smoke.py [screenshot_dir]"""
import sys, asyncio, pathlib, json, base64
from playwright.async_api import async_playwright
PAGE = (pathlib.Path(__file__).resolve().parent.parent / 'aisg-tool-check.html').as_uri()
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None
results = []
def check(name, ok, detail=''):
    results.append((name, ok)); print(('PASS ' if ok else 'FAIL ') + name + (' :: ' + str(detail) if detail and not ok else ''))

async def go(pg, v):
    await pg.evaluate("show(%r,true)" % v); await pg.wait_for_timeout(120)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        errs = []
        ctx = await b.new_context(viewport={'width': 1280, 'height': 1600})
        pg = await ctx.new_page(); pg.set_default_timeout(5000)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        await pg.goto(PAGE); await pg.wait_for_timeout(500)
        # 1 example is read-only and labelled
        check('example outcome is Conditions before use', (await pg.text_content('#ovPos .st')).lstrip('●▲■○◆ ') == 'Conditions before use', (await pg.text_content('#ovPos .st')).lstrip('●▲■○◆ '))
        check('example form read-only', await pg.evaluate("document.getElementById('p-name').readOnly && document.getElementById('p-loc').disabled"))
        await pg.click('#nav [data-v="s1"]'); await pg.wait_for_timeout(200); await pg.click('label:has(#a-1a-v)'); await pg.wait_for_timeout(200)
        check('example answers cannot be changed', await pg.evaluate("document.getElementById('a-1a-d').checked && !document.getElementById('a-1a-v').checked"), await pg.text_content('#exNote'))
        check('example record labelled fictional', 'SPECIMEN' in await pg.input_value('#rText'))
        check('example not saved to storage', await pg.evaluate("localStorage.getItem('aisg-tool-check-v2')") is None)
        check('critical badge hidden on non-critical item', await pg.evaluate("getComputedStyle(document.getElementById('crit-1a')).display") == 'none')
        check('critical badge shown on critical item', await pg.evaluate("getComputedStyle(document.getElementById('crit-12a')).display") != 'none')
        check('no external font requests', await pg.evaluate("!document.querySelector('link[href*=googleapis]')"))
        if SHOTS: await pg.screenshot(path=SHOTS + '/v2-desk-example.png')
        # 2 start new check
        await go(pg,'overview'); await pg.click('#startBtn'); await pg.wait_for_timeout(200)
        check('new check is blank and editable', not await pg.evaluate("document.getElementById('work').disabled") and await pg.input_value('#p-name') == '')
        check('new check outcome Incomplete', (await pg.text_content('#ovPos .st')).lstrip('●▲■○◆ ') == 'Not finished')
        check('no questions for unanswered checks', 'No questions yet' in await pg.input_value('#qText'))
        # 3 fill everything as Documented without notes -> must NOT be top outcome
        await go(pg,'product'); await pg.fill('#p-name', 'Test Tool <img src=x onerror=window.__x=1>')
        await go(pg,'product'); await pg.select_option('#p-loc', 'uk')
        await pg.evaluate("""() => { const A=window.AISG; document.querySelectorAll('input[type=radio][value=d][data-item]').forEach(r=>{r.click();}); }""")
        await pg.wait_for_timeout(100)
        h = (await pg.text_content('#ovPos .st')).lstrip('●▲■○◆ ')
        check('all Documented without notes is not cleared', h == 'Conditions before use', h)
        check('XSS in name did not execute', await pg.evaluate("window.__x===undefined"))
        # 4 a critical Not met blocks
        await pg.click('#nav [data-v="s12"]'); await pg.wait_for_timeout(200); await pg.click('label:has(#a-12a-n)'); await pg.wait_for_timeout(150)
        check('critical Not met gives Blocking gaps', (await pg.text_content('#ovPos .st')).lstrip('●▲■○◆ ') == 'Blocking gaps')
        # 5 full pass path: all tested/documented with notes, gates done
        await pg.evaluate("""() => {
          const A=window.AISG;
          A.STDS.forEach(s=>s.items.forEach(it=>{ const v=it.test?'v':'d'; const r=document.getElementById('a-'+it.id+'-'+v); r.click();
            const ta=document.getElementById('n-'+it.id); ta.hidden=false; ta.value='Evidence ref '+it.id; ta.dispatchEvent(new Event('input',{bubbles:true})); }));
          ['dpia','dpa','fm','dsl'].forEach(id=>{ const c=document.getElementById('act-'+id); if(!c.checked) c.click(); });
        }""")
        await pg.wait_for_timeout(150)
        h = (await pg.text_content('#ovPos .st')).lstrip('●▲■○◆ ')
        check('fully evidenced check reaches No blocking gaps found', h == 'No blocking gaps found', [h, await pg.evaluate("[...document.querySelectorAll('#reasons li')].map(l=>l.textContent)")])
        # 6 staff-only drops pupil standards; mixed keeps filtering
        await pg.click('#nav [data-v="product"]'); await pg.wait_for_timeout(150); await pg.check('#aud-mixed'); await pg.wait_for_timeout(150)
        check('mixed audience applies 33 checks', '33 checks' in await pg.text_content('#covSub'), await pg.text_content('#covSub'))
        await pg.click('#nav [data-v="product"]'); await pg.wait_for_timeout(150); await pg.check('#aud-staff'); await pg.wait_for_timeout(150)
        check('staff-only applies 28 checks', '28 checks' in await pg.text_content('#covSub'), await pg.text_content('#covSub'))
        await pg.click('#nav [data-v="product"]'); await pg.wait_for_timeout(150); await pg.check('#aud-learners'); await pg.wait_for_timeout(150)
        # 7 save code round trip into a second check
        code = await pg.evaluate("window.AISG.code()")
        await go(pg,'file'); await pg.fill('#pasteIn', code); await pg.click('#loadBtn'); await pg.wait_for_timeout(150)
        n = await pg.evaluate("document.querySelectorAll('#checkSel option').length")
        check('loading a code opens a second check (2 checks + example)', n == 3, n)
        check('loaded check keeps outcome', (await pg.text_content('#ovPos .st')).lstrip('●▲■○◆ ') == 'No blocking gaps found')
        # 8 undo the load
        await go(pg,'overview'); await pg.click('#undoBtn'); await pg.wait_for_timeout(100)
        check('undo removes the loaded check', await pg.evaluate("document.querySelectorAll('#checkSel option').length") == 2)
        # 9 malicious / malformed codes
        bad = {'v':2,'product':{'name':5,'uses':[1.5,2,2,'x']},'ans':{'5b':'constructor','6a':'toString','__proto__':{'x':1},'3a':'v'},'notes':{'3a':['x']}}
        enc = 'AISG2:' + base64.b64encode(json.dumps(bad).encode()).decode()
        await go(pg,'file'); await pg.fill('#pasteIn', enc); await pg.click('#loadBtn'); await pg.wait_for_timeout(150)
        st = await pg.evaluate("(()=>{const o=JSON.parse(localStorage.getItem('aisg-tool-check-v2'));return o.checks[o.current];})()")
        check('invalid answer values dropped', '5b' not in st['ans'] and '6a' not in st['ans'] and st['ans'].get('3a') == 'v', st['ans'])
        check('types coerced and uses de-duplicated', st['product']['name'] == '5' and st['product']['uses'] == [2], st['product'])
        check('no prototype pollution', await pg.evaluate("({}).x===undefined"))
        await go(pg,'file'); await pg.fill('#pasteIn', '{}'); await pg.click('#loadBtn')
        check('empty object rejected', 'not a valid' in await pg.text_content('#load-status'))
        await go(pg,'file'); await pg.evaluate("document.getElementById('pasteIn').value='AISG2:'+'A'.repeat(300000)"); await pg.click('#loadBtn')
        check('oversized code rejected', 'too large' in await pg.text_content('#load-status'))
        # 10 remove is two-step and disarms
        await go(pg,'file'); await pg.click('#clearBtn'); armed = await pg.text_content('#clearBtn'); await pg.wait_for_timeout(6300)
        check('remove arms then disarms after 6s', armed.startswith('Yes') and await pg.text_content('#clearBtn') == 'Remove this check')
        # 11 corrupt storage recovers
        await pg.evaluate("localStorage.setItem('aisg-tool-check-v2','{bad')"); await pg.reload(); await pg.wait_for_timeout(300)
        check('corrupt storage keeps a backup and still saves', await pg.evaluate("localStorage.getItem('aisg-tool-check-v2-backup')") == '{bad')
        # 12 print shows full record only
        await go(pg,'overview'); await pg.click('#startBtn'); await pg.fill('#p-name', 'Print test')
        await pg.emulate_media(media='print', color_scheme='dark')
        vis = await pg.evaluate("[getComputedStyle(document.querySelector('.shell')).display, getComputedStyle(document.getElementById('rPrint')).display, getComputedStyle(document.getElementById('rPrint')).color]")
        check('print hides app and shows record in black', vis[0] == 'none' and vis[1] == 'block' and vis[2] in ('rgb(0, 0, 0)',), vis)
        await pg.emulate_media(media='screen')
        # 13 phone, dark, overflow
        ph = await b.new_page(viewport={'width': 360, 'height': 1400}, color_scheme='dark')
        ph.on('pageerror', lambda e: errs.append(str(e)))
        await ph.goto(PAGE); await ph.wait_for_timeout(400)
        await ph.click('#menuBtn'); await ph.click('#nav [data-v="s3"]'); await ph.wait_for_timeout(300)
        check('no horizontal overflow at 360px', not await ph.evaluate("document.documentElement.scrollWidth>innerWidth"))
        clipped = await ph.evaluate("[...document.querySelectorAll('.states label')].filter(l=>l.clientWidth>1 && l.scrollWidth>l.clientWidth+1).length")
        check('segment labels not clipped at 360px', clipped == 0, clipped)
        if SHOTS:
            await ph.screenshot(path=SHOTS + '/v2-phone-dark.png', full_page=False)
            await pg.set_viewport_size({'width': 1280, 'height': 1600}); await pg.goto(PAGE); await pg.wait_for_timeout(300)
            await pg.click('#nav [data-v="s12"]'); await pg.wait_for_timeout(200)
            await pg.screenshot(path=SHOTS + '/v2-desk-s12.png')
        # 15 round 2 regressions (pure logic via window.AISG)
        await pg.goto(PAGE); await pg.wait_for_timeout(300)
        r2 = await pg.evaluate("""() => {
          const A=window.AISG, full=()=>{ const s=A.blank(); s.product.name='X'; s.product.loc='uk';
            A.STDS.forEach(st=>st.items.forEach(it=>{ s.ans[it.id]=it.test?'v':'d'; s.notes[it.id]='Evidence ref '+it.id; }));
            ['dpia','dpa','fm','dsl'].forEach(k=>s.acts[k]=true); return s; };
          const out={};
          out.full=A.assess(full()).out.h;
          let s=full(); s.product.loc='nosafe'; out.nosafe=A.assess(s).out.h;
          s=full(); s.product.reviewBy=''; out.noReview=A.assess(s).out.h;
          s=full(); s.product.reviewBy='2099-01-01'; out.farReview=A.assess(s).out.h;
          s=full(); let n=0; A.STDS.forEach(st=>st.items.forEach(it=>{ if(!it.crit && n<12){ s.ans[it.id]='c'; n++; } })); out.manyClaimed=A.assess(s).out.h;
          s=full(); s.notes['3a']='ok'; out.shortNote=A.assess(s).out.h;
          out.badDate=A.normalise({product:{date:'2026-13-45',reviewBy:'9999-99-99'},ans:{}}).product.date;
          return out; }""")
        check('round2: full evidence still clears', r2['full'] == 'No blocking gaps found', r2)
        check('round2: transfer without safeguards blocks', r2['nosafe'] == 'Blocking gaps', r2)
        check('round2: missing or far review date is a condition', r2['noReview'] == 'Conditions before use' and r2['farReview'] == 'Conditions before use', r2)
        check('round2: many claimed checks is a condition', r2['manyClaimed'] == 'Conditions before use', r2)
        check('round2: one-word critical note does not count', r2['shortNote'] == 'Conditions before use', r2)
        check('round2: impossible dates rejected', r2['badDate'] == '', r2)
        ex = 'AISG2:' + base64.b64encode(json.dumps(await pg.evaluate("window.AISG.example()")).encode()).decode()
        await go(pg,'file'); await pg.fill('#pasteIn', ex); await pg.click('#loadBtn')
        check('round2: worked example cannot be opened as a check', 'fictional worked example' in await pg.text_content('#load-status'))
        await go(pg,'overview'); await pg.select_option('#checkSel', 'example'); await pg.wait_for_timeout(100)
        check('round2: download disabled on example', await pg.evaluate("document.getElementById('dlBtn').disabled"))
        await go(pg,'overview'); await pg.click('#startBtn'); await pg.fill('#p-name', 'Only check'); await pg.wait_for_timeout(400)
        await go(pg,'file'); await pg.click('#clearBtn'); await pg.click('#clearBtn'); await pg.wait_for_timeout(100)
        check('round2: undo visible and enabled after removing last check', await pg.evaluate("!document.getElementById('toast').hidden && !document.getElementById('undoBtn').disabled"))
        await go(pg,'overview'); await pg.click('#undoBtn'); await pg.wait_for_timeout(100)
        check('round2: undo restores the removed check', await pg.input_value('#p-name') == 'Only check')
        # 14 framed: print/download hidden
        import tempfile, os
        wrap = os.path.join(tempfile.mkdtemp(), 'frame.html')
        open(wrap, 'w').write('<iframe src="' + PAGE + '" width="1200" height="900"></iframe>')
        fr = await b.new_page(); fr.set_default_timeout(5000)
        await fr.goto(pathlib.Path(wrap).as_uri()); await fr.wait_for_timeout(800)
        f = fr.frames[1]
        check('print and download hidden when framed', await f.evaluate("document.getElementById('printBtn').hidden && document.getElementById('dlBtn').hidden"))
        real_errs = [e for e in errs if 'ERR_' not in e]
        check('no script errors', not real_errs, real_errs)
        await b.close()
    failed = [n for n, ok in results if not ok]
    print('\n%d passed, %d failed' % (len(results) - len(failed), len(failed)))
    sys.exit(1 if failed else 0)
asyncio.run(main())
