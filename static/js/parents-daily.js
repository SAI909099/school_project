(function(){
  const API = (document.body.dataset.apiBase || '/api').replace(/\/+$/, '');
  const $ = (s, r=document)=>r.querySelector(s);
  const el = (t,a={},...kids)=>{
    const e=document.createElement(t);
    for(const[k,v] of Object.entries(a)){ if(k==='class') e.className=v; else e.setAttribute(k,v); }
    kids.forEach(k=>e.append(k?.nodeType? k: document.createTextNode(k)));
    return e;
  };

  function thisMonthISO(){ const d=new Date(); const m=String(d.getMonth()+1).padStart(2,'0'); return `${d.getFullYear()}-${m}`; }
  function todayISO(){ const d=new Date(); const m=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${d.getFullYear()}-${m}-${dd}`; }
  function weekRangeOf(dayStr){
    const d = new Date(dayStr || todayISO());
    const wd = (d.getDay()+6)%7; // Mon=0..Sun=6
    const start = new Date(d); start.setDate(d.getDate()-wd);
    const end = new Date(start); end.setDate(start.getDate()+5);
    const iso = d=> d.toISOString().slice(0,10);
    return {start: iso(start), end: iso(end)};
  }
  function weekdayShort(isoDate){
    const [y,m,d]=isoDate.split('-').map(Number);
    const w = new Date(y, m-1, d).getDay(); // 0..6
    return ['Ya','Du','Se','Ch','Pa','Ju','Sh'][w] || '';
  }

  function setLoading(b){ $('#loading')?.classList.toggle('hidden', !b); }
  function msg(ok, t){
    const m=$('#msg'); if(!m) return;
    m.className = ok? 'ok' : 'err';
    m.textContent=t;
    m.classList.remove('hidden');
    clearTimeout(msg._t);
    msg._t=setTimeout(()=>m.classList.add('hidden'), ok?2000:5000);
  }

  async function fetchWithAuth(path, opts={}, retry=true){
    const token = localStorage.getItem('access');
    const headers = Object.assign({ 'Authorization':'Bearer '+token }, opts.headers||{});
    const r = await fetch(API+path, Object.assign({}, opts, {headers}));
    if(r.status===401 && retry){
      const refresh = localStorage.getItem('refresh');
      if(refresh){
        const rr = await fetch(API+'/auth/refresh/', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({refresh})});
        if(rr.ok){ const d=await rr.json().catch(()=>({})); if(d.access){ localStorage.setItem('access', d.access); return fetchWithAuth(path, opts, false); } }
      }
    }
    return r;
  }
  async function getJSON(path){
    const r=await fetchWithAuth(path);
    const t=await r.text();
    let j=null; try{ j=t?JSON.parse(t):{} }catch{}
    if(!r.ok) throw new Error((j&&(j.detail||j.error))||t||('HTTP '+r.status));
    return j;
  }

  // DOM
  const childSel = $('#childSel');
  const monthInp = $('#monthInp');
  const weekInp  = $('#weekInp');
  const wrapMonth= $('#wrapMonth');
  const wrapWeek = $('#wrapWeek');
  const btnLoad  = $('#btnLoad');
  const meta     = $('#meta');

  // LIST
  const listWrap = $('#listWrap');
  const listContainer = $('#listContainer');
  const emptyList = $('#emptyList');

  // GRID
  const gridWrap = $('#gridWrap');
  const empty    = $('#empty');
  const thead    = $('#gridTbl thead');
  const tbody    = $('#gridTbl tbody');

  // init pickers
  monthInp.value = thisMonthISO();
  weekInp.value  = todayISO();

  async function loadChildren(){
    const kids = await getJSON('/parent/children/');
    childSel.innerHTML='';
    kids.forEach(k=>{
      const label = (`${k.last_name||''} ${k.first_name||''}`).trim() || `#${k.id}`;
      childSel.append(el('option', {value:k.id}, label));
    });
    if(!kids.length) childSel.append(el('option', {value:''}, 'Farzand topilmadi'));
  }

  /* ---------- RENDER: LIST ---------- */
  function renderList(data){
    listContainer.innerHTML = '';
    emptyList.textContent = '';

    // flatten grid -> entries, grouped by date
    // data.grid: {subject_id: {date: {score,comment}}}
    const subjName = new Map(data.subjects.map(s=> [String(s.id), s.name]));
    const byDate = new Map(); // date -> [{subject,score,comment}]
    let total = 0;

    data.days.forEach(day=>{
      for(const sid of Object.keys(data.grid||{})){
        const cell = (data.grid[sid]||{})[day];
        if(cell && cell.score!=null){
          total++;
          if(!byDate.has(day)) byDate.set(day, []);
          byDate.get(day).push({
            subject: subjName.get(sid) || ('Fan #' + sid),
            score: cell.score,
            comment: cell.comment || ''
          });
        }
      }
    });

    if(total === 0){
      emptyList.textContent = 'Tanlangan davr uchun kundalik baholar mavjud emas.';
      return;
    }

    // build UI (dates already in ascending order thanks to data.days)
    data.days.forEach(day=>{
      const items = byDate.get(day);
      if(!items || !items.length) return;
      const group = el('div', {class:'day-group'},
        el('div', {class:'day-header'}, day, el('small', {}, weekdayShort(day)))
      );
      const ul = el('ul', {class:'items'});
      items.forEach(it=>{
        ul.append(
          el('li', {class:'item'},
            el('span', {class:'subject'}, it.subject),
            el('span', {class:'score-badge'}, String(it.score)),
            it.comment ? el('span', {class:'comment'}, it.comment) : ''
          )
        );
      });
      group.append(ul);
      listContainer.append(group);
    });
  }

  /* ---------- RENDER: GRID (existing) ---------- */
  function renderGrid(data){
    thead.innerHTML=''; tbody.innerHTML=''; empty.textContent='';
    const trh = el('tr', {}, el('th', {}, 'Fan'));
    data.days.forEach(d=>{
      const dd = d.slice(-2);
      trh.append(el('th', {class:'dayhead'}, dd, el('small', {}, weekdayShort(d))));
    });
    thead.append(trh);

    if(!data.subjects.length){
      empty.textContent = 'Fanlar topilmadi.';
      return;
    }

    let hasAny = false;
    data.subjects.forEach(s=>{
      const tr = el('tr', {}, el('td', {}, s.name));
      data.days.forEach(day=>{
        const cell = (data.grid[String(s.id)]||{})[day];
        if(cell && (cell.score!=null)) hasAny = true;
        tr.append(el('td', {class:'cell', title: (cell?.comment||'')}, cell && cell.score!=null ? String(cell.score) : '—'));
      });
      tbody.append(tr);
    });

    if(!hasAny) empty.textContent = 'Tanlangan davr uchun kundalik baholar mavjud emas.';
  }

  /* ---------- LOAD ---------- */
  function currentPeriod(){
    return document.querySelector('input[name="period"]:checked')?.value || 'month';
  }
  function currentView(){
    return document.querySelector('input[name="view"]:checked')?.value || 'list';
  }

  async function loadGrid(){
    const student = childSel.value;
    if(!student){ msg(false, 'Farzandni tanlang'); return; }

    const period = currentPeriod();
    setLoading(true);
    try{
      let url;
      if(period === 'week'){
        const d = weekInp.value || todayISO();
        url = `/grades/daily-by-student/?student=${encodeURIComponent(student)}&period=week&week_of=${encodeURIComponent(d)}`;
      }else{
        const m = monthInp.value || thisMonthISO(); // YYYY-MM
        url = `/grades/daily-by-student/?student=${encodeURIComponent(student)}&period=month&month_of=${encodeURIComponent(m)}`;
      }
      const data = await getJSON(url);

      const st = data.student || {};
      let periodText = '';
      if(period==='week'){
        const wr = weekRangeOf(weekInp.value || todayISO());
        periodText = `${wr.start} — ${wr.end}`;
      }else{
        periodText = monthInp.value || thisMonthISO();
      }
      meta.textContent = `${(st.last_name||'')+' '+(st.first_name||'')}`.trim()
                         + (st.class_name? ` • ${st.class_name}` : '')
                         + ` • ${periodText}`;

      // toggle view
      const view = currentView();
      if(view === 'grid'){
        listWrap.classList.add('hidden');
        gridWrap.classList.remove('hidden');
        renderGrid(data);
      }else{
        gridWrap.classList.add('hidden');
        listWrap.classList.remove('hidden');
        renderList(data);
      }
    }catch(e){
      msg(false, e.message);
    }finally{
      setLoading(false);
    }
  }

  // period toggle
  document.querySelectorAll('input[name="period"]').forEach(r=>{
    r.addEventListener('change', ()=>{
      const v = currentPeriod();
      wrapMonth.classList.toggle('hidden', v!=='month');
      wrapWeek.classList.toggle('hidden', v!=='week');
      loadGrid();
    });
  });

  // view toggle
  document.querySelectorAll('input[name="view"]').forEach(r=>{
    r.addEventListener('change', loadGrid);
  });

  // triggers
  $('#btnLoad').addEventListener('click', loadGrid);
  monthInp.addEventListener('change', ()=> { if(childSel.value) loadGrid(); });
  weekInp.addEventListener('change',  ()=> { if(childSel.value) loadGrid(); });
  childSel.addEventListener('change', ()=> { if(childSel.value) loadGrid(); });

  (async function init(){
    try{
      setLoading(true);
      await loadChildren();
      if(childSel.value) await loadGrid();
    }catch(e){
      msg(false, e.message);
    }finally{
      setLoading(false);
    }
  })();
})();
