/* static/js/parent-baholar.js */
(function(){
  const API = (window.API_BASE || '/api').replace(/\/+$/, '');
  const access = localStorage.getItem('access');
  if (!access) { window.location.replace('/'); return; }
  const HEADERS = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + access
  };

  // ----- tiny helpers -----
  const $ = (s, r=document)=>r.querySelector(s);
  const el=(t,a={},...kids)=>{
    const e=document.createElement(t);
    for (const [k,v] of Object.entries(a)){
      if(k==='class') e.className=v;
      else if(v!=null) e.setAttribute(k,v);
    }
    kids.forEach(k=>e.append(k instanceof Node?k:document.createTextNode(k)));
    return e;
  };
  async function apiGET(path){
    const r = await fetch(API+path, {headers: HEADERS});
    if (r.status === 401) { window.location.replace('/'); throw new Error('401'); }
    if(!r.ok){
      let t = '';
      try { t = await r.text(); } catch {}
      throw new Error(`HTTP ${r.status}${t ? ' — '+t : ''}`);
    }
    return r.json();
  }
  function fmt(val){
    if(val===null || val===undefined) return '—';
    const n = Number(val);
    if(!Number.isFinite(n)) return String(val);
    return (n % 1 === 0) ? String(n) : n.toFixed(2);
  }
  const mean = arr => {
    const xs = (arr||[]).map(Number).filter(Number.isFinite);
    return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
  };
  const typeName = t => t==='final' ? 'Yakuniy' : (t==='exam' ? 'Imtihon' : t);

  // ----- DOM targets -----
  const content = $('.content');
  const cardsGrid = $('.cards-grid');

  // Controls (child selector + refresh + info badges)
  const controls = el('div', {class:'card', style:'margin-bottom:12px; display:flex; gap:12px; align-items:end; flex-wrap:wrap;'});
  const childWrap = el('div', {},
    el('label', {for:'childSel', style:'display:block; font-size:12px; color:#666; margin-bottom:4px;'}, 'Farzand'),
    el('select', {id:'childSel', style:'min-width:220px; height:36px;'})
  );
  const refreshBtn = el('button', {class:'btn', style:'height:36px'}, 'Yangilash');
  const infoBar = el('div', {style:'margin-left:auto; display:flex; gap:12px; align-items:center; flex-wrap:wrap;'},
    el('span', {id:'stName',  class:'badge'}),
    el('span', {id:'stClass', class:'badge'}),
    el('span', {id:'stAvg',   class:'badge'}),
    el('span', {id:'stSubs',  class:'badge'})
  );
  controls.append(childWrap, refreshBtn, infoBar);
  content.insertBefore(controls, cardsGrid);

  const childSel = $('#childSel');
  const stName  = $('#stName');
  const stClass = $('#stClass');
  const stAvg   = $('#stAvg');
  const stSubs  = $('#stSubs');

  async function loadChildren(){
    try{
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
    }catch(e){
      childSel.innerHTML = '';
      childSel.append(el('option', {value:''}, 'Xatolik'));
      cardsGrid.innerHTML = `<div class="card err">Xatolik: ${e.message}</div>`;
      return null;
    }
  }

  function buildSubjectMaps(timetable){
    // subjectId -> name, and subjectId -> teacher
    const nameMap = new Map();
    const teacherMap = new Map();
    (timetable||[]).forEach(row=>{
      const sid = row.subject;
      if (sid==null) return;
      if (!nameMap.has(sid)) nameMap.set(sid, row.subject_name || `#${sid}`);
      if (!teacherMap.has(sid) && row.teacher_name) teacherMap.set(sid, row.teacher_name);
    });
    return {nameMap, teacherMap};
  }

  function groupGradesBySubject(grades, studentId){
    const out = new Map(); // subjectId -> [{date,type,score}]
    (grades||[])
      .filter(g => String(g.student) === String(studentId))
      .forEach(g=>{
        if(!out.has(g.subject)) out.set(g.subject, []);
        out.get(g.subject).push({date: g.date, type: g.type, score: Number(g.score)});
      });
    // sort each subject's grades by date ascending
    for (const arr of out.values()){
      arr.sort((a,b)=> (a.date< b.date? -1 : a.date> b.date? 1 : 0) );
    }
    return out;
  }

  function renderOverview(overview, grades){
    // badges
    const fullName = (overview.student?.full_name || `${overview.student?.first_name||''} ${overview.student?.last_name||''}`).trim();
    stName.textContent  = `O‘quvchi: ${fullName || '—'}`;
    stClass.textContent = `Sinf: ${overview.class_name || '—'}`;

    // subject/teacher maps from timetable
    const {nameMap, teacherMap} = buildSubjectMaps(overview.timetable);

    // group grade history from /api/grades/
    const bySubject = groupGradesBySubject(grades, overview.student?.id);

    // Build teacher -> subjects mapping with computed averages
    const teacherBuckets = new Map();
    const subjectAverages = [];
    const subjectIdsSorted = [...bySubject.keys()].sort((a,b)=>{
      const an = (nameMap.get(a)||'').toLocaleLowerCase();
      const bn = (nameMap.get(b)||'').toLocaleLowerCase();
      return an.localeCompare(bn, 'uz');
    });

    subjectIdsSorted.forEach(sid=>{
      const list = bySubject.get(sid);                // [{date,type,score}]
      const examScores  = list.filter(x=>x.type==='exam').map(x=>x.score);
      const finalScores = list.filter(x=>x.type==='final').map(x=>x.score);

      const examAvg  = mean(examScores);
      const finalAvg = mean(finalScores);
      const subjectAvg = mean(list.map(x=>x.score));  // simple mean across all grades

      if (subjectAvg!=null) subjectAverages.push(subjectAvg);

      const subjectName = nameMap.get(sid) || `#${sid}`;
      const teacherName = teacherMap.get(sid) || 'O‘qituvchi';

      if(!teacherBuckets.has(teacherName)) teacherBuckets.set(teacherName, []);
      teacherBuckets.get(teacherName).push({
        sid, subjectName, examAvg, finalAvg, subjectAvg, history: list
      });
    });

    // overall average across subjects
    const overall = mean(subjectAverages);
    stAvg.textContent  = `O‘rtacha ball: ${fmt(overall)}`;
    stSubs.textContent = `Fanlar: ${subjectIdsSorted.length}`;

    // Render cards
    cardsGrid.innerHTML = '';
    if(!teacherBuckets.size){
      cardsGrid.innerHTML = '<div class="card">Baholar topilmadi.</div>';
      return;
    }

    for(const [teacher, items] of teacherBuckets){
      items.sort((a,b)=>a.subjectName.localeCompare(b.subjectName, 'uz'));

      const headerTable = el('table', {},
        el('thead', {}, el('tr', {},
          el('th', {}, 'Fan'),
          el('th', {}, 'Imtihon (o‘rt.)'),
          el('th', {}, 'Yakuniy (o‘rt.)'),
          el('th', {}, 'Fan o‘r. ball'),
          el('th', {}, 'Baholar')
        )),
        el('tbody', {},
          ...items.map(row=>{
            // history table (collapse)
            const historyTable = el('table', {class:'mini'},
              el('thead', {}, el('tr', {},
                el('th', {}, 'Sana'),
                el('th', {}, 'Turi'),
                el('th', {}, 'Baho')
              )),
              el('tbody', {},
                ...(row.history.length
                  ? row.history.map(h=>el('tr', {},
                      el('td', {}, h.date),              // server returns ISO date; keep simple
                      el('td', {}, typeName(h.type)),
                      el('td', {}, fmt(h.score))
                    ))
                  : [el('tr', {}, el('td', {colspan:'3'}, 'Baholar yo‘q'))]
                )
              )
            );

            const details = el('details', {class:'hist'},
              el('summary', {}, 'Baholar ro‘yxati'),
              historyTable
            );

            return el('tr', {},
              el('td', {}, row.subjectName),
              el('td', {}, fmt(row.examAvg)),
              el('td', {}, fmt(row.finalAvg)),
              el('td', {}, fmt(row.subjectAvg)),
              el('td', {}, details)
            );
          })
        )
      );

      const card = el('div', {class:'card'},
        el('h3', {}, teacher),
        headerTable
      );
      cardsGrid.append(card);
    }
  }

  async function loadOverview(studentId){
    if(!studentId){ return; }
    cardsGrid.innerHTML = '<div class="card">Yuklanmoqda...</div>';
    try{
      // 1) overview (timetable, class, etc)
      // 2) raw grades list; server already scopes to parent’s children
      const [overview, allGrades] = await Promise.all([
        apiGET(`/parent/child/${studentId}/overview/`),
        apiGET(`/grades/?student=${studentId}`)
      ]);
      // some backends paginate; if you use DRF pagination later, you may need to fetch next pages.
      renderOverview(overview, Array.isArray(allGrades) ? allGrades : (allGrades.results || []));
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
