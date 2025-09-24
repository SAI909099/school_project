(function(){
  const API = (window.API_BASE || '/api').replace(/\/+$/,'');
  const access = localStorage.getItem('access');
  if (!access) { window.location.replace('/login/'); return; }
  const HEADERS = { 'Authorization':'Bearer '+access, 'Content-Type':'application/json' };

  async function tryRefresh(){
    const refresh = localStorage.getItem('refresh'); if (!refresh) return false;
    const r = await fetch(API+'/auth/refresh/', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({refresh})});
    if (!r.ok) return false;
    const d = await r.json().catch(()=>({})); if (!d.access) return false;
    localStorage.setItem('access', d.access); HEADERS.Authorization='Bearer '+d.access; return true;
  }
  async function getJSON(path){
    const url = path.startsWith('http') ? path : API + (path.startsWith('/')?path:'/'+path);
    let res = await fetch(url, {headers: HEADERS});
    if (res.status === 401){ const ok = await tryRefresh(); if (ok) res = await fetch(url, {headers: HEADERS}); else {localStorage.clear(); window.location='/login/'; return;}}
    if (!res.ok) throw new Error('HTTP '+res.status);
    return res.json();
  }

  // DOM
  const kpiStudents = document.getElementById('kpiStudents');
  const kpiActive   = document.getElementById('kpiActive');
  const kpiClasses  = document.getElementById('kpiClasses');
  const kpiTeachers = document.getElementById('kpiTeachers');
  const tblBody     = document.querySelector('#tblClasses tbody');

  const regCard   = document.getElementById('regCard');
  const regTitle  = document.getElementById('regTitle');
  const regMode   = document.getElementById('regMode');   // month | year
  const regYear   = document.getElementById('regYear');   // visible only for month
  const btnRegReload = document.getElementById('btnRegReload');

  let barChart=null, lineChart=null;

  // Utils
  const monthNames = ['Yan','Fev','Mar','Apr','May','Iyun','Iyul','Avg','Sen','Okt','Noy','Dek'];
  function thisYear(){ return new Date().getFullYear(); }
  function fillYearSelect(select, countBack=5){
    const y = thisYear();
    select.innerHTML = '';
    for (let i=0; i<=countBack; i++){
      const yr = y - i;
      const opt = document.createElement('option');
      opt.value = String(yr); opt.textContent = String(yr);
      if (i===0) opt.selected = true;
      select.appendChild(opt);
    }
  }
  function setRegTitle(mode, year){
    if (mode==='year') regTitle.textContent = 'Ro‘yxatdan o‘tganlar — Yillik';
    else regTitle.textContent = `Ro‘yxatdan o‘tganlar — Oylik (${year})`;
  }

  // Renderers
  function renderKPIs(totals){
    kpiStudents.textContent = totals.students ?? '—';
    kpiActive.textContent   = totals.active_students ?? totals.students ?? '—';
    kpiClasses.textContent  = totals.classes ?? '—';
    kpiTeachers.textContent = totals.teachers ?? '—';
  }

  function renderClassesTable(classes){
    tblBody.innerHTML = '';
    (classes||[]).forEach((c, i)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i+1}</td><td>${c.name || ('#'+c.id)}</td><td>${c.students_count ?? 0}</td>`;
      tblBody.appendChild(tr);
    });
  }

  function renderClassBar(classes){
    const top = [...(classes||[])].sort((a,b)=>(b.students_count||0)-(a.students_count||0)).slice(0,12);
    const labels = top.map(c=>c.name);
    const data   = top.map(c=>c.students_count||0);
    const ctx = document.getElementById('clsBar').getContext('2d');
    if (barChart) barChart.destroy();
    barChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'O‘quvchilar', data }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision:0 } } }
      }
    });
  }

  function renderRegMonthly(year, monthly){
    // monthly: [{month:'YYYY-MM', count: N}, ...] (can be sparse)
    const months = Array.from({length:12}, (_,i)=>i+1);
    const map = new Map((monthly||[]).map(r=>{
      const key = (r.month || '').slice(5); // 'MM'
      return [key, r.count||0];
    }));
    const labels = months.map(i=> `${String(i).padStart(2,'0')} · ${monthNames[i-1]}`);
    const data   = months.map(i=> map.get(String(i).padStart(2,'0')) || 0);
    const ctx = document.getElementById('regLine').getContext('2d');
    if (lineChart) lineChart.destroy();
    lineChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Ro‘yxatdan o‘tganlar', data, tension: 0.25 }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision:0 } } }
      }
    });
    regCard.style.display='';
    setRegTitle('month', year);
  }

  function renderRegYearly(series){
    // series: [{year:YYYY, count:N}, ...]
    const labels = (series||[]).map(r=> String(r.year));
    const data   = (series||[]).map(r=> r.count || 0);
    const ctx = document.getElementById('regLine').getContext('2d');
    if (lineChart) lineChart.destroy();
    lineChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Ro‘yxatdan o‘tganlar (yillik)', data, tension: 0.25 }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision:0 } } }
      }
    });
    regCard.style.display='';
    setRegTitle('year');
  }

  // Data loaders (with graceful fallback)
  async function loadSchoolStatsBase(){
    // KPIs + classes + (maybe) registrations.monthly for current year
    // Shape expected: { totals:{...}, classes:[...], registrations:{available:true, year:YYYY, monthly:[{month:'YYYY-MM',count}] } }
    return getJSON('/stats/school/');
  }

  async function loadRegistrationsMonthly(year){
    // Preferred dedicated endpoint:
    // GET /stats/registrations/?granularity=month&year=2025
    try {
      return await getJSON(`/stats/registrations/?granularity=month&year=${year}`);
    } catch (e) {
      // fallback: use /stats/school/ if it ships the monthly block
      try {
        const base = await loadSchoolStatsBase();
        if (base?.registrations?.monthly) {
          return { granularity:'month', year: base.registrations.year || year, monthly: base.registrations.monthly, available:true };
        }
      } catch {}
      return { granularity:'month', year, monthly: [], available:false };
    }
  }

  async function loadRegistrationsYearly(yearsBack=5){
    // Preferred dedicated endpoint:
    // GET /stats/registrations/?granularity=year&years=${yearsBack}
    try {
      return await getJSON(`/stats/registrations/?granularity=year&years=${yearsBack}`);
    } catch (e) {
      // fallback: try computing from multiple monthly series if your backend later returns them via /stats/school/
      // For now, show current year only if monthly available; else hide card.
      try {
        const y = thisYear();
        const m = await loadRegistrationsMonthly(y);
        if (m.available && (m.monthly||[]).length){
          return { granularity:'year', series:[{ year: y, count: (m.monthly||[]).reduce((a,b)=>a+(b.count||0),0) }], available:true };
        }
      } catch {}
      return { granularity:'year', series: [], available:false };
    }
  }

  // Events
  btnRegReload?.addEventListener('click', async ()=>{
    const mode = regMode.value;
    if (mode === 'year'){
      document.getElementById('lblRegYear').style.display = 'none';
      regYear.style.display = 'none';
      const yrResp = await loadRegistrationsYearly(5);
      if (yrResp.available && yrResp.series?.length) renderRegYearly(yrResp.series);
      else { regCard.style.display='none'; }
    } else {
      document.getElementById('lblRegYear').style.display = '';
      regYear.style.display = '';
      const y = parseInt(regYear.value || thisYear(), 10);
      const moResp = await loadRegistrationsMonthly(y);
      if (moResp.available) renderRegMonthly(moResp.year || y, moResp.monthly || []);
      else { regCard.style.display='none'; }
    }
  });

  regMode?.addEventListener('change', ()=>{
    // auto toggle year selector visibility
    const yearly = (regMode.value === 'year');
    document.getElementById('lblRegYear').style.display = yearly ? 'none' : '';
    regYear.style.display = yearly ? 'none' : '';
  });

  // Init
  (async function init(){
    try {
      // base stats (KPIs, classes, maybe monthly for current year)
      const stats = await loadSchoolStatsBase();
      renderKPIs(stats.totals || {});
      renderClassesTable(stats.classes || []);
      renderClassBar(stats.classes || []);

      // setup registration controls
      fillYearSelect(regYear, 5);
      document.getElementById('lblRegYear').style.display = ''; // default monthly
      regYear.style.display = '';

      // try monthly first (current year), else hide card
      const y = parseInt(regYear.value || thisYear(), 10);
      const moResp = await loadRegistrationsMonthly(y);
      if (moResp.available) {
        renderRegMonthly(moResp.year || y, moResp.monthly || []);
      } else {
        // as a backup, try yearly series
        const yrResp = await loadRegistrationsYearly(5);
        if (yrResp.available && yrResp.series?.length) {
          regMode.value = 'year';
          document.getElementById('lblRegYear').style.display = 'none';
          regYear.style.display = 'none';
          renderRegYearly(yrResp.series);
        } else {
          regCard.style.display = 'none';
        }
      }
    } catch (e) {
      console.error('Stats load failed', e);
      alert('Analitika ma’lumotlarini yuklashda xatolik.');
    }
  })();
})();
