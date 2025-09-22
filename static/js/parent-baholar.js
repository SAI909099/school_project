/* static/js/parent-baholar.js */
(function(){
  const API = (window.API_BASE || '/api').replace(/\/+$/, '');
  const access = localStorage.getItem('access');
  if (!access) { window.location.replace('/'); return; }
  const HEADERS = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + access };

  // ----- tiny helpers -----
  const $ = (s, r=document)=>r.querySelector(s);
  const el=(t,a={},...kids)=>{ const e=document.createElement(t);
    for (const [k,v] of Object.entries(a)){ if(k==='class') e.className=v; else if(v!=null) e.setAttribute(k,v); }
    kids.forEach(k=>e.append(k instanceof Node?k:document.createTextNode(k)));
    return e;
  };
  async function apiGET(path){
    const r = await fetch(API+path, {headers: HEADERS});
    if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }
  function fmt(val){
    if(val===null || val===undefined) return '—';
    const n = Number(val);
    if(!Number.isFinite(n)) return String(val);
    return n % 1 === 0 ? String(n) : n.toFixed(2);
  }

  // ----- DOM targets -----
  const content = $('.content');
  const cardsGrid = $('.cards-grid');

  // We’ll create a small controls bar dynamically (no HTML edit needed)
  const controls = el('div', {class:'card', style:'margin-bottom:12px; display:flex; gap:12px; align-items:end; flex-wrap:wrap;'});
  const childWrap = el('div', {}, el('label', {}, 'Farzand'), el('select', {id:'childSel', style:'min-width:220px'}));
  const refreshBtn = el('button', {class:'btn', style:'height:38px'}, 'Yangilash');
  const infoBar = el('div', {style:'margin-left:auto; display:flex; gap:16px; flex-wrap:wrap;'},
    el('span', {id:'stName', class:'badge'}),
    el('span', {id:'stClass', class:'badge'}),
    el('span', {id:'stGpa', class:'badge'}),
    el('span', {id:'stRank', class:'badge'})
  );
  controls.append(childWrap, refreshBtn, infoBar);
  content.insertBefore(controls, cardsGrid);

  const childSel = $('#childSel');
  const stName = $('#stName');
  const stClass = $('#stClass');
  const stGpa = $('#stGpa');
  const stRank = $('#stRank');

  async function loadChildren(){
    const kids = await apiGET('/parent/children/');
    childSel.innerHTML = '';
    if(!Array.isArray(kids) || !kids.length){
      childSel.append(el('option', {value:''}, 'Farzand topilmadi'));
      cardsGrid.innerHTML = '<div class="card">Akkountga bog‘langan farzand topilmadi.</div>';
      return null;
    }
    kids.forEach(k=>{
      const name = (k.full_name || `${k.first_name||''} ${k.last_name||''}`).trim() || `#${k.id}`;
      childSel.append(el('option', {value:k.id}, name));
    });
    return kids[0].id;
  }

  function buildTeacherMap(timetable){
    // Map subject_name -> teacher_name (first match wins)
    const m = new Map();
    (timetable||[]).forEach(row=>{
      const sub = row.subject_name || '';
      const tname = row.teacher_name || '';
      if(sub && tname && !m.has(sub)) m.set(sub, tname);
    });
    return m;
  }

  function renderOverview(data){
    // Top info badges
    const fullName = data.student?.full_name || `${data.student?.first_name||''} ${data.student?.last_name||''}`.trim();
    stName.textContent = `O‘quvchi: ${fullName || '—'}`;
    stClass.textContent = `Sinf: ${data.class_name || '—'}`;
    stGpa.textContent   = `GPA: ${fmt(data.gpa_overall)}`;
    const rankTxt = (data.class_rank && data.class_size) ? `${data.class_rank}/${data.class_size}` : '—';
    stRank.textContent  = `O‘rin: ${rankTxt}`;

    // Group subjects by teacher
    const teacherBySubject = buildTeacherMap(data.timetable);
    const groups = new Map(); // teacher -> [{subject_name, exam_avg, final_avg, gpa_subject}]
    const summary = data.grades_summary || {};

    Object.keys(summary).sort((a,b)=>a.localeCompare(b,'uz')).forEach(subjName=>{
      const s = summary[subjName] || {};
      const teacher = teacherBySubject.get(subjName) || 'O‘qituvchi';
      if(!groups.has(teacher)) groups.set(teacher, []);
      groups.get(teacher).push({
        subject_name: subjName,
        exam_avg: s.exam_avg ?? null,      // we ignore daily_avg on purpose
        final_avg: s.final_avg ?? null,
        gpa_subject: s.gpa_subject ?? null
      });
    });

    // Render cards
    cardsGrid.innerHTML = '';
    if(!groups.size){
      cardsGrid.innerHTML = '<div class="card">Baholar topilmadi.</div>';
      return;
    }

    for(const [teacher, items] of groups){
      // sort subjects alphabetically
      items.sort((a,b)=>a.subject_name.localeCompare(b.subject_name, 'uz'));
      const table = el('table', {},
        el('thead', {}, el('tr', {},
          el('th', {}, 'Fan'),
          el('th', {}, 'Imtihon (o‘rt.)'),
          el('th', {}, 'Yakuniy (o‘rt.)'),
          el('th', {}, 'Fan GPA')
        )),
        el('tbody', {},
          ...items.map(row=>el('tr', {},
            el('td', {}, row.subject_name),
            el('td', {}, fmt(row.exam_avg)),
            el('td', {}, fmt(row.final_avg)),
            el('td', {}, fmt(row.gpa_subject))
          )))
      );

      const card = el('div', {class:'card'},
        el('h3', {}, teacher),
        table
      );
      cardsGrid.append(card);
    }
  }

  async function loadOverview(studentId){
    if(!studentId){ return; }
    cardsGrid.innerHTML = '<div class="card">Yuklanmoqda...</div>';
    try{
      const data = await apiGET(`/parent/child/${studentId}/overview/`);
      renderOverview(data);
    }catch(e){
      cardsGrid.innerHTML = `<div class="card err">Xatolik: ${e.message}</div>`;
    }
  }

  // events
  childSel?.addEventListener('change', ()=>loadOverview(childSel.value));
  refreshBtn.addEventListener('click', ()=>loadOverview(childSel.value));

  // init
  (async function init(){
    const firstId = await loadChildren();
    if(firstId){ childSel.value = firstId; await loadOverview(firstId); }
  })();
})();
