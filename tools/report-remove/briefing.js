(function(){
  'use strict';
  /* Report Remove staff quick reference: editor.
     School details (.f fields) are keyed by a stable id and always applied.
     Guidance text (.g blocks) is editable only behind a toggle; each edit is stored with a hash of the
     published text it replaced, so a later revision of the sheet is never silently overwritten. */
  var KEY='aisg-rr-briefing-v2', LOGOKEY='aisg-rr-briefing-logo-v2', OLDKEY='aisg-sqr-any-v1';
  var LIMIT={school:60,'dsl-name':40,'dsl-phone':40,'dep-name':40,'dep-phone':40,adopted:20,review:20,system:40,wellbeing:50,'csc-day':40,'csc-ooh':40,lado:40};
  var REQ=['school','dsl-name','dsl-phone'];
  var KEEP={STRONG:'b',B:'b',EM:'em',I:'em',LI:'li',UL:'ul',OL:'ol',BR:'br'};
  function $(id){ return document.getElementById(id); }
  var main=document.querySelector('main'), status=$('status'), editBtn=$('editBtn'), crest=document.querySelector('.crest');
  var state={f:{},g:{},editedAt:''}, logo='', editing=false, gEdit=false, armed=null, snapshot=null, undoTimer=0;
  var ph={}, gOrig={}, gEls=[].slice.call(document.querySelectorAll('.g'));
  [].forEach.call(document.querySelectorAll('.f'),function(el){ var id=el.dataset.f; if(!(id in ph)) ph[id]=el.textContent.trim(); });
  gEls.forEach(function(el){ gOrig[el.dataset.g]=clean(el); });

  function esc(t){ return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function hash(s){ var h=5381,i; for(i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0; return (h>>>0).toString(16); }
  function isPh(t){ t=String(t||'').trim(); return !t||/^\[[^\]]*\]$/.test(t); }
  function today(){ return new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}); }
  function monthYear(){ return new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'}); }

  /* sanitiser for stored guidance html */
  function clean(node){
    var out='';
    [].forEach.call(node.childNodes,function(n){
      if(n.nodeType===3){ out+=esc(n.nodeValue); return; }
      if(n.nodeType!==1) return;
      var t=n.tagName, inner=clean(n);
      if(t==='BR'){ out+='<br>'; return; }
      if(KEEP[t]){ out+='<'+KEEP[t]+'>'+inner+'</'+KEEP[t]+'>'; return; }
      if(t==='SPAN'&&n.dataset.f&&(n.dataset.f in ph)){
        out+='<span class="f'+(n.classList.contains('tel')?' tel':'')+'" data-f="'+n.dataset.f+'">'+esc(ph[n.dataset.f])+'</span>'; return;
      }
      if(t==='A'){
        var h=n.getAttribute('href')||'', txt=n.textContent;
        if(/^tel:/.test(h)){ var d=txt.replace(/[^\d+]/g,''); if(d.length>=3){ out+='<a class="num" href="tel:'+esc(d)+'">'+inner+'</a>'; } else out+=inner; return; }
        if(/^https:\/\/[^\s"<>]+$/.test(h)){ out+='<a'+(n.classList.contains('url')?' class="url"':'')+' href="'+esc(h)+'">'+inner+'</a>'; return; }
        out+=inner; return;
      }
      out+=inner;
    });
    return out;
  }
  function fromStore(html){ var t=document.createElement('template'); t.innerHTML=String(html).slice(0,8000); return clean(t.content); }

  /* status line */
  function say(msg,kind,actions){
    status.textContent=''; status.setAttribute('data-kind',kind||'ok');
    status.setAttribute('role',kind==='err'?'alert':'status');
    if(!msg) return;
    var s=document.createElement('span'); s.textContent=msg; status.appendChild(s);
    (actions||[]).forEach(function(a){ var b=document.createElement('button'); b.type='button'; b.textContent=a.label; b.addEventListener('click',a.fn); status.appendChild(b); });
  }
  var sayT=0; function saySoon(msg){ clearTimeout(sayT); sayT=setTimeout(function(){ if(!status.querySelector('button')) say(msg,'ok'); },1200); }

  /* storage */
  var persistT=0;
  function persist(){
    state.editedAt=today();
    try{ localStorage.setItem(KEY,JSON.stringify(state)); return true; }
    catch(e){ say('This browser cannot keep your changes. Save a copy before closing.','err'); return false; }
  }
  function persistSoon(){ clearTimeout(persistT); persistT=setTimeout(persist,350); }
  function persistLogo(){ try{ if(logo) localStorage.setItem(LOGOKEY,logo); else localStorage.removeItem(LOGOKEY); }catch(e){ say('The logo is too large for this browser to keep. It will print this time but may not be here next time.','warn'); } }
  function hasEdits(){ return Object.keys(state.f).length>0||Object.keys(state.g).length>0||!!logo; }

  /* rendering */
  function telLink(text){
    return esc(text).replace(/(\+?\d[\d ]{4,}\d)/g,function(m){ return '<a class="num" href="tel:'+m.replace(/[^\d+]/g,'')+'">'+m+'</a>'; });
  }
  function renderFields(){
    [].forEach.call(document.querySelectorAll('.f'),function(el){
      var id=el.dataset.f, v=state.f[id], text=v||ph[id];
      if(el===document.activeElement) return;
      el.classList.toggle('empty',!v);
      if(!editing&&v&&el.classList.contains('tel')) el.innerHTML=telLink(text); else el.textContent=text;
    });
  }
  var dropped=[];
  function renderGuides(){
    dropped=[]; var changed=0;
    gEls.forEach(function(el){
      var id=el.dataset.g, s=state.g[id];
      if(s&&s.h===hash(gOrig[id])){ el.innerHTML=fromStore(s.html); changed++; el.classList.add('gchanged'); }
      else { if(s){ dropped.push(id); delete state.g[id]; } el.innerHTML=gOrig[id]; el.classList.remove('gchanged'); }
    });
    if(dropped.length){ persist(); }
    return changed;
  }
  function renderProv(){
    var p=$('prov'); if(!p) return;
    var bits=[];
    if(Object.keys(state.g).length) bits.push('Guidance text adapted by this school from the AISG form; the adaptation is the school’s own.');
    if(hasEdits()&&state.editedAt) bits.push('School details added '+state.editedAt+'.');
    p.textContent=bits.join(' ');
  }
  function rerender(){ var n=renderGuides(); renderFields(); renderProv(); return n; }
  function showLogo(){
    if(logo){ crest.setAttribute('src',logo); crest.hidden=false; crest.alt=(state.f.school||'School')+' logo'; $('logoRemove').hidden=false; $('logoAdd').hidden=true; }
    else { crest.removeAttribute('src'); crest.hidden=true; crest.alt=''; $('logoRemove').hidden=true; $('logoAdd').hidden=false; }
  }

  /* editing mode */
  function setEditing(on){
    editing=on; main.classList.toggle('editing',on);
    editBtn.setAttribute('aria-pressed',String(on)); editBtn.textContent=on?'Done editing':'Edit for your school';
    $('editpanel').hidden=!on;
    [].forEach.call(document.querySelectorAll('.f'),function(el){ if(on) el.setAttribute('contenteditable','plaintext-only'); else el.removeAttribute('contenteditable'); if(on) el.setAttribute('spellcheck','false'); });
    gEls.forEach(function(el){ if(on&&gEdit) el.setAttribute('contenteditable','true'); else el.removeAttribute('contenteditable'); });
    if(on&&!state.f.adopted){ state.f.adopted=monthYear(); persistSoon(); }
    renderFields();
  }
  editBtn.addEventListener('click',function(){ setEditing(!editing); if(!editing) say(hasEdits()?'Your school details are kept in this browser. Print, or save a copy to share.':'' ,'ok'); });
  $('gToggle').addEventListener('change',function(ev){
    gEdit=ev.target.checked; setEditing(true);
    say(gEdit?'The guidance text is now editable. Agree any change with the DSL; the sheet will say it has been adapted.':'Guidance text locked. School details stay editable.','warn');
  });

  /* field events, delegated */
  function fieldOf(t){ return t&&t.closest?t.closest('.f'):null; }
  function guideOf(t){ var g=t&&t.closest?t.closest('.g'):null; return (g&&!fieldOf(t))?g:null; }
  main.addEventListener('focusin',function(e){
    var f=fieldOf(e.target); if(!f||!editing) return;
    if(isPh(f.textContent)){ var r=document.createRange(); r.selectNodeContents(f); var sel=getSelection(); sel.removeAllRanges(); sel.addRange(r); }
  });
  main.addEventListener('focusout',function(e){
    var f=fieldOf(e.target); if(!f||!editing) return;
    var id=f.dataset.f, t=f.textContent.replace(/\s+/g,' ').trim();
    if(isPh(t)){ delete state.f[id]; } else state.f[id]=t;
    persist(); renderFields(); f.textContent=state.f[id]||ph[id]; f.classList.toggle('empty',!state.f[id]);
  });
  main.addEventListener('input',function(e){
    var f=fieldOf(e.target), g=guideOf(e.target);
    if(f){
      var id=f.dataset.f, t=f.textContent, lim=LIMIT[id]||40;
      if(t.length>lim){ f.textContent=t.slice(0,lim); placeCaretEnd(f); say('That field is limited to '+lim+' characters so the sheet still fits one page.','warn'); t=f.textContent; }
      t=t.trim();
      if(isPh(t)) delete state.f[id]; else state.f[id]=t;
      [].forEach.call(document.querySelectorAll('.f[data-f="'+id+'"]'),function(o){ if(o!==f){ o.textContent=state.f[id]||ph[id]; o.classList.toggle('empty',!state.f[id]); } });
      persistSoon(); saySoon('Saved in this browser.'); renderProv(); return;
    }
    if(g&&gEdit){
      var gid=g.dataset.g, c=clean(g);
      if(c===gOrig[gid]){ delete state.g[gid]; g.classList.remove('gchanged'); } else { state.g[gid]={h:hash(gOrig[gid]),html:c}; g.classList.add('gchanged'); }
      persistSoon(); saySoon('Saved in this browser. This block now differs from the published text.'); renderProv();
    }
  });
  main.addEventListener('keydown',function(e){
    var f=fieldOf(e.target); if(f&&e.key==='Enter'){ e.preventDefault(); f.blur(); }
  });
  main.addEventListener('paste',function(e){
    var f=fieldOf(e.target), g=guideOf(e.target); if(!f&&!g) return;
    e.preventDefault();
    var t=((e.clipboardData||window.clipboardData).getData('text/plain')||'');
    var cap=f?(LIMIT[f.dataset.f]||40):1500, cut=t.length>cap;
    if(f) t=t.replace(/\s+/g,' ');
    t=t.slice(0,cap);
    document.execCommand('insertText',false,t);
    if(cut) say('Pasted text was shortened to '+cap+' characters.','warn');
  });
  main.addEventListener('click',function(e){ if(editing&&e.target.closest('a')&&fieldOf(e.target)) e.preventDefault(); });
  function placeCaretEnd(el){ var r=document.createRange(); r.selectNodeContents(el); r.collapse(false); var s=getSelection(); s.removeAllRanges(); s.addRange(r); }

  /* placeholders print as lines */
  function applyFills(root){
    [].forEach.call(root.querySelectorAll('.f'),function(el){
      if(isPh(el.textContent)){ el.textContent=''; var s=document.createElement('span'); s.className='fill'; var v=document.createElement('span'); v.className='vh'; v.textContent='blank line to write in'; s.appendChild(v); el.appendChild(s); }
    });
  }
  window.addEventListener('beforeprint',function(){ applyFills(document); });
  window.addEventListener('afterprint',function(){ renderFields(); });

  function missing(){ return REQ.filter(function(id){ return !state.f[id]; }); }
  function focusField(id){ setEditing(true); var el=document.querySelector('.f[data-f="'+id+'"]'); if(el){ el.scrollIntoView({block:'center'}); el.focus(); } }
  function doPrint(){ say('','ok'); window.print(); }
  $('printBtn').addEventListener('click',function(){
    var m=missing();
    if(m.length&&armed!=='print'){
      armed='print'; setTimeout(function(){ if(armed==='print') armed=null; },8000);
      say('The school name or DSL contact is still blank. The blanks will print as lines to write on.','warn',[{label:'Add them now',fn:function(){ focusField(m[0]); }},{label:'Print anyway',fn:doPrint}]);
      return;
    }
    armed=null; doPrint();
  });
  $('paper').addEventListener('change',function(ev){
    var a3=ev.target.value==='a3'; document.documentElement.classList.toggle('a3',a3);
    var st=$('pagesize'); if(!st){ st=document.createElement('style'); st.id='pagesize'; document.head.appendChild(st); }
    st.textContent=a3?'@media print{@page{size:A3 portrait;margin:14mm 16mm}}':'';
    say(a3?'Set for A3. In the print dialog choose A3 paper as well.':'Set for A4.','ok');
  });

  /* save a copy */
  function fileHtml(){
    var copy=document.documentElement.cloneNode(true);
    [].slice.call(copy.querySelectorAll('script,noscript,#toolbar,#editpanel,#status,.skip,.gw-head,#pagesize')).forEach(function(n){ n.remove(); });
    [].slice.call(copy.querySelectorAll('[contenteditable],[spellcheck]')).forEach(function(n){ n.removeAttribute('contenteditable'); n.removeAttribute('spellcheck'); });
    copy.querySelector('main').classList.remove('editing');
    [].slice.call(copy.querySelectorAll('.gchanged')).forEach(function(n){ n.classList.remove('gchanged'); });
    applyFills(copy);
    var c=copy.querySelector('.crest'); if(c&&c.hidden) c.remove();
    var csp=copy.querySelector('meta[http-equiv="Content-Security-Policy"]');
    if(csp) csp.setAttribute('content',"default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'");
    var ttl=copy.querySelector('title'); if(ttl) ttl.textContent='Staff quick reference: nude or sexual image of a pupil — '+(state.f.school||'school');
    return '<!doctype html>\n'+copy.outerHTML;
  }
  function doSave(){
    var name='staff-quick-reference-'+((state.f.school||'school').toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50)||'school')+'.html';
    try{
      var u=URL.createObjectURL(new Blob([fileHtml()],{type:'text/html;charset=utf-8'})); var a=document.createElement('a'); a.href=u; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(u); },4000);
      say('Your browser will now download “'+name+'”. It has no editing tools, so it is ready to share or put on your network.','ok');
    }catch(e){ say('This browser blocked the download. Use Print, then Save as PDF.','err'); }
  }
  $('saveBtn').addEventListener('click',function(){
    var m=missing();
    if(m.length&&armed!=='save'){
      armed='save'; setTimeout(function(){ if(armed==='save') armed=null; },8000);
      say('The school name or DSL contact is still blank.','warn',[{label:'Add them now',fn:function(){ focusField(m[0]); }},{label:'Save with blank lines to write on',fn:doSave}]);
      return;
    }
    armed=null; doSave();
  });

  /* reset, two steps, with undo */
  $('resetBtn').addEventListener('click',function(){
    say('Reset clears your school details, any guidance edits and the logo from this browser.','warn',[{label:'Yes, reset everything',fn:doReset},{label:'Keep them',fn:function(){ say('','ok'); }}]);
  });
  function doReset(){
    snapshot={state:JSON.stringify(state),logo:logo};
    state={f:{},g:{},editedAt:''}; logo='';
    try{ localStorage.removeItem(KEY); localStorage.removeItem(LOGOKEY); }catch(e){}
    rerender(); showLogo(); setEditing(editing);
    say('Reset to the published sheet.','ok',[{label:'Undo',fn:undoReset}]);
    clearTimeout(undoTimer); undoTimer=setTimeout(function(){ snapshot=null; if(status.textContent.indexOf('Reset to')===0) say('','ok'); },12000);
  }
  function undoReset(){
    if(!snapshot) return; try{ state=JSON.parse(snapshot.state); }catch(e){ state={f:{},g:{},editedAt:''}; }
    logo=snapshot.logo; snapshot=null; persist(); persistLogo(); rerender(); showLogo(); setEditing(editing); say('Your details are back.','ok');
  }

  /* logo */
  $('logoAdd').addEventListener('click',function(){ $('logoFile').click(); });
  $('logoRemove').addEventListener('click',function(){ logo=''; persistLogo(); showLogo(); say('Logo removed.','ok'); $('logoAdd').focus(); });
  $('logoFile').addEventListener('change',function(ev){
    var f=ev.target.files&&ev.target.files[0]; ev.target.value=''; if(!f) return;
    var type=f.type||({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',svg:'image/svg+xml'}[(f.name.split('.').pop()||'').toLowerCase()]||'');
    if(/heic|heif/i.test(f.type+f.name)){ say('HEIC photos cannot be used here. Export the crest as PNG or JPG first.','err'); return; }
    if(!/^image\/(png|jpeg|webp|svg\+xml)$/.test(type)){ say('Use a PNG, JPG, WebP or SVG file for the logo.','err'); return; }
    if(f.size>5*1024*1024){ say('That image is over 5 MB. Choose a smaller file.','err'); return; }
    var r=new FileReader();
    r.onload=function(){
      var img=new Image();
      img.onload=function(){
        var nw=img.naturalWidth||img.width||240, nh=img.naturalHeight||img.height||120;
        var h=Math.min(200,nh), w=Math.round(nw*h/nh); if(w>480){ w=480; h=Math.round(nh*w/nw); }
        var cv=document.createElement('canvas'); cv.width=w; cv.height=h; cv.getContext('2d').drawImage(img,0,0,w,h);
        var url=cv.toDataURL('image/png'); if(url.length>300000) url=cv.toDataURL('image/jpeg',0.85);
        logo=url; persistLogo(); showLogo(); say('Logo added. It prints at the top of the front page.','ok');
      };
      img.onerror=function(){ say('That file could not be read as an image.','err'); };
      img.src=r.result;
    };
    r.readAsDataURL(f);
  });

  /* load */
  try{
    var d=JSON.parse(localStorage.getItem(KEY)||'null');
    if(d&&typeof d==='object'){
      if(d.f&&typeof d.f==='object') Object.keys(d.f).forEach(function(k){ if((k in ph)&&typeof d.f[k]==='string'&&!isPh(d.f[k])) state.f[k]=d.f[k].replace(/\s+/g,' ').trim().slice(0,LIMIT[k]||40); });
      if(d.g&&typeof d.g==='object') Object.keys(d.g).forEach(function(k){ var v=d.g[k]; if((k in gOrig)&&v&&typeof v.h==='string'&&typeof v.html==='string') state.g[k]={h:v.h,html:v.html}; });
      if(typeof d.editedAt==='string') state.editedAt=d.editedAt.slice(0,40);
    } else {
      var o=JSON.parse(localStorage.getItem(OLDKEY)||'null');
      if(o&&o.e&&typeof o.e['0']==='string'){ var t=document.createElement('template'); t.innerHTML=o.e['0']; var nm=t.content.textContent.trim(); if(nm&&!isPh(nm)) state.f.school=nm.slice(0,60); }
    }
    var lg=localStorage.getItem(LOGOKEY)||'';
    if(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+\/=]+$/.test(lg)) logo=lg;
  }catch(e){}
  rerender(); showLogo(); setEditing(false);
  $('toolbar').hidden=false;
  if(dropped.length) say('This sheet has been revised since this browser last edited it. Your school details were kept; '+dropped.length+' edited guidance block'+(dropped.length>1?'s were':' was')+' reset to the new text. Review the sheet before printing.','warn');
  else if(hasEdits()&&state.editedAt) say('This browser holds school details added on '+state.editedAt+'. Check the DSL details before printing.','warn',[{label:'Reset',fn:function(){ $('resetBtn').click(); }}]);
})();
