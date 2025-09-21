/* static/js/parents-main.js — current-week only */
(function () {
  const API = (window.API_BASE || '/api').replace(/\/+$/, '');
  const access = localStorage.getItem('access');
  if (!access) { window.location.replace('/'); return; }
  const HEADERS = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + access };

  // ---------- tiny helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const el = (t, a = {}, ...kids) => {
    const e = document.createElement(t);
    for (const [k, v] of Object.entries(a)) {
      if (k === 'class') e.className = v;
      else if (v != null) e.setAttribute(k, v);
    }
    kids.forEach(k => e.append(k instanceof Node ? k : document.createTextNode(k)));
    return e;
  };
  async function api(path) {
    const url = path.startsWith('http') ? path : API + (path.startsWith('/') ? path : '/' + path);
    const r = await fetch(url, { headers: HEADERS });
    if (r.status === 401) { localStorage.clear(); window.location.replace('/'); throw new Error('401'); }
    if (!r.ok) throw new Error(await r.text().catch(() => `HTTP ${r.status}`));
    return r.json();
  }
  function btnStyle(){
    return [
      'padding:8px 12px',
      'border-radius:8px',
      'border:1px solid #ddd',
      'background:#f7f7f7',
      'text-decoration:none',
      'display:inline-block'
    ].join(';');
  }

  // ---------- inject minimal styles (NON-clipping) ----------
  (function injectStyles(){
    const css = `
    .child-card{padding:14px;border:1px solid #eee;border-radius:12px;background:#fff}
    .meta-row{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;color:#444;font-size:14px}

    .status-pill{display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;line-height:1;border:1px solid transparent;min-width:74px;text-align:center}
    .status-present{background:#e7f6ed;color:#0a7a33;border-color:#bfe6cf}
    .status-absent{background:#fde7ea;color:#c01a1a;border-color:#f3b8c0}
    .status-late{background:#fff4e5;color:#a15e00;border-color:#f8d7a6}
    .status-excused{background:#e8f1ff;color:#1a4fbf;border-color:#b9d1ff}

    /* allow horizontal scroll when 6 cols don't fit */
    .grid-wrap{margin-top:10px;border:1px solid #eee;border-radius:12px;overflow-x:auto;overflow-y:hidden;background:#fff}
    .grid-head,.grid-body{display:grid;grid-template-columns:repeat(6, minmax(160px,1fr));gap:0;min-width:960px}
    .grid-head{background:#fafafa;border-bottom:1px solid #eee}
    .grid-head > div{padding:8px 10px;font-weight:600;text-align:center}

    .day-col{border-right:1px solid #f0f0f0;min-height:100%}
    .day-col:last-child{border-right:none}
    .lesson{border-bottom:1px dashed #eee;padding:10px 12px;display:flex;flex-direction:column;gap:6px;min-height:72px}
    .lesson:last-child{border-bottom:none}
    .lesson .time{font-size:12px;color:#555}
    .lesson .subj{font-weight:600}
    /* Center the "no class" message */
    .lesson.muted{color:#777;display:flex;align-items:center;justify-content:center;text-align:center}
    .legend{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:#555}
    .legend .item{display:flex;align-items:center;gap:6px}
    `;
    if (!document.getElementById('parent-status-styles')) {
      const s = document.createElement('style');
      s.id = 'parent-status-styles';
      s.textContent = css;
      document.head.appendChild(s);
    }
  })();

  // ---------- profile fill ----------
  function fillProfile(me, firstChild) {
    const fioEl = $('.profile-info h2');
    const phoneEl = $('.profile-info p:nth-of-type(1)');
    const emailEl = $('.profile-info p:nth-of-type(2)');
    const addrEl = $('.profile-info p:nth-of-type(3)');

    const first = (me?.first_name || '').trim();
    const last  = (me?.last_name  || '').trim();
    const fio   = [last, first].filter(Boolean).join(' ') || (me?.username || '—');

    if (fioEl)   fioEl.textContent = 'F.I.O: ' + fio;
    if (phoneEl) phoneEl.textContent = 'Telefon: ' + ((me?.phone || '').trim() || '—');
    if (emailEl) emailEl.textContent = 'Email: ' + ((me?.email || '').trim() || '—');

    const addr = (me?.address || '').trim() || (firstChild?.address || '').trim();
    if (addrEl) addrEl.textContent = 'Manzil: ' + (addr || '—');
  }

  // ---------- week helpers ----------
  const WD_LABELS = ['Du','Se','Ch','Pa','Ju','Sha']; // Mon..Sat
  function mondayOf(d){ const x=new Date(d); const day=x.getDay(); const diff=(day===0?6:day-1); x.setDate(x.getDate()-diff); x.setHours(0,0,0,0); return x; }
  function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
  function toISO(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }

  function statusPill(status){
    const label = status==='present' ? 'Kelgan'
                  : status==='absent' ? 'Kelmagan'
                  : status==='late' ? 'Kechikkan'
                  : status==='excused' ? 'Sababli' : '—';
    const cls = status ? `status-pill status-${status}` : `status-pill`;
    return el('span', { class: cls, title: label }, label);
  }

  // (dateISO, subjectId) -> status
  function buildAttendanceMap(list){
    const map = new Map();
    (list||[]).forEach(a=>{
      const date = String(a?.date||'');
      const subj = a?.subject ?? null; // may be null if daily-only
      map.set(`${date}::${subj ?? 'none'}`, String(a.status || ''));
    });
    return map;
  }

  // ---------- weekly grid (current week only) ----------
  function renderWeeklyGrid(container, timetable, attendanceList){
    const attMap = buildAttendanceMap(attendanceList);

    const theToday = new Date(); // <-- fixed scoping
    const mon = mondayOf(theToday);

    // group timetable by weekday (1..6)
    const byDay = {1:[],2:[],3:[],4:[],5:[],6:[]};
    (timetable||[]).forEach(t=>{
      if (t.weekday>=1 && t.weekday<=6) byDay[t.weekday].push(t);
    });
    Object.values(byDay).forEach(a=>a.sort((a,b)=>String(a.start_time).localeCompare(String(b.start_time))));

    const head = el('div', { class:'grid-head' });
    const body = el('div', { class:'grid-body' });

    for (let i=0;i<6;i++){
      const wd = i+1; // 1..6
      const d = addDays(mon, i);
      const iso = toISO(d);

      head.append(el('div', {}, `${WD_LABELS[i]} (${iso.slice(5)})`));

      const col = el('div', { class:'day-col' });
      const slots = byDay[wd];

      if (!slots.length){
        const empty = el('div', { class:'lesson muted' },
          el('div', { class:'subj' }, 'Bu kunda dars yo‘q')
        );
        col.append(empty);
      } else {
        slots.forEach(s=>{
          const time = `${(s.start_time||'').slice(0,5)}–${(s.end_time||'').slice(0,5)}`.replace(/^–$/,'');
          const subj = s.subject_name || 'Fan';
          const st   = attMap.get(`${iso}::${s.subject}`) || null; // null = no record
          const row  = el('div', { class:'lesson' },
            el('div', { class:'time' }, time || '—'),
            el('div', { class:'subj' }, subj),
            statusPill(st)
          );
          col.append(row);
        });
      }
      body.append(col);
    }

    const wrap = el('div', { class:'grid-wrap' }, head, body);

    const legend = el('div', { class:'legend' },
      el('div', { class:'item' }, statusPill('present'), el('span', {}, 'Kelgan')),
      el('div', { class:'item' }, statusPill('absent'),  el('span', {}, 'Kelmagan')),
      el('div', { class:'item' }, statusPill('late'),    el('span', {}, 'Kechikkan')),
      el('div', { class:'item' }, statusPill('excused'), el('span', {}, 'Sababli')),
      el('div', { class:'item' }, statusPill(null),      el('span', {}, 'Belgilash yo‘q'))
    );

    container.append(
      el('div', { style:'font-size:14px;color:#444;margin-top:12px;margin-bottom:6px;font-weight:600;' },
         'Hafta dars jadvali va davomati'),
      wrap,
      legend
    );
  }

  // ---------- child card ----------
  async function renderChildOverview(container, child){
    container.innerHTML = ''; // ensure fresh build each time

    // No week param → backend should return current week by default
    let ov=null;
    try { ov = await api(`/parent/child/${child.id}/overview/`); }
    catch(e){ console.error('overview fail', e); }

    const full = (child.last_name ? child.last_name + ' ' : '') + (child.first_name || '');
    const clsName = (ov?.class_name || child.class_name || child.clazz || '—');
    const header = el('div', { style:'font-weight:600;margin-bottom:6px;' }, full || 'F.I.O');

    const meta = el('div', { class:'meta-row' });
    meta.append(el('span', {}, 'Sinf: ' + clsName));
    if (ov?.gpa_overall != null) meta.append(el('span', {}, `GPA: ${Number(ov.gpa_overall).toFixed(2)}`));
    if (ov?.class_rank != null && ov?.class_size != null) meta.append(el('span', {}, `O‘rin: ${ov.class_rank}/${ov.class_size}`));

    const actions = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;' },
      (() => {
        const b = el('a', { href: '/otaona/davomat/', class: 'btn', style: btnStyle() }, 'Davomat');
        b.addEventListener('click', () => localStorage.setItem('parent_current_child', String(child.id)));
        return b;
      })(),
      (() => {
        const b = el('a', { href: '/otaona/baholar/', class: 'btn', style: btnStyle() }, 'Baholar');
        b.addEventListener('click', () => localStorage.setItem('parent_current_child', String(child.id)));
        return b;
      })()
    );

    container.append(header, meta, actions);

    if (ov && Array.isArray(ov.timetable)) {
      renderWeeklyGrid(container, ov.timetable, ov.latest_week_attendance || []);
    }
  }

  // ---------- render children list ----------
  async function renderChildren(children) {
    let section = document.getElementById('children-section');
    if (!section) {
      section = el('section', { id: 'children-section', style: 'margin-top:18px;' },
        el('h3', { style: 'margin:0 0 10px 0;' }, 'Farzandlarim')
      );
      const main = document.querySelector('main.content') || document.body;
      main.appendChild(section);
    }
    section.querySelectorAll('.child-list')?.forEach(n => n.remove());

    const list = el('div', { class: 'child-list', style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;' });
    if (!children || children.length === 0) {
      list.append(el('div', { class: 'child-card' }, 'Bolalar ro‘yxati bo‘sh.'));
      section.appendChild(list);
      return;
    }

    const tasks = children.map(async (ch) => {
      const card = el('div', { class: 'child-card wide' });
      list.appendChild(card);
      await renderChildOverview(card, ch);
    });
    section.appendChild(list);
    await Promise.allSettled(tasks);
  }

  // ---------- init ----------
  (async function init() {
    try {
      const me = await api('/auth/me/');
      const role = (me?.role || '').toLowerCase();
      if (role !== 'parent') {
        const map = { admin:'/dashboard/', registrar:'/dashboard/', accountant:'/moliya/', finance:'/moliya/', teacher:'/teachers/', operator:'/operator/' };
        window.location.replace(map[role] || '/');
        return;
      }

      const children = await api('/parent/children/');
      fillProfile(me, children?.[0] || null);
      await renderChildren(Array.isArray(children) ? children : []);
    } catch (e) {
      console.error(e);
      alert('Maʼlumotlarni yuklashda xatolik.');
    }
  })();
})();
