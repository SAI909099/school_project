// static/js/admin-dashboard.js
(function () {
  const API = (window.API_BASE || '/api').replace(/\/+$/, '');
  const access = localStorage.getItem('access');
  if (!access) { /* redirect if you want */ /* window.location='/login/'; */ }

  const HEADERS = { 'Authorization': 'Bearer ' + access, 'Content-Type': 'application/json' };

  // --- Helpers ---
  async function tryRefresh() {
    const refresh = localStorage.getItem('refresh');
    if (!refresh) return false;
    const r = await fetch(API + '/auth/refresh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh })
    });
    if (!r.ok) return false;
    const d = await r.json().catch(() => ({}));
    if (!d.access) return false;
    localStorage.setItem('access', d.access);
    HEADERS.Authorization = 'Bearer ' + d.access;
    return true;
  }
  async function getJSON(path) {
    const url = path.startsWith('http') ? path : API + (path.startsWith('/') ? path : '/' + path);
    let res = await fetch(url, { headers: HEADERS });
    if (res.status === 401) {
      const ok = await tryRefresh();
      res = ok ? await fetch(url, { headers: HEADERS }) : res;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  // --- DOM refs ---
  const kpiStudents = document.getElementById('kpiStudents');
  const kpiActive   = document.getElementById('kpiActive');
  const kpiClasses  = document.getElementById('kpiClasses');
  const kpiTeachers = document.getElementById('kpiTeachers');
  const tblBody     = document.querySelector('#tblClasses tbody');

  const regCard   = document.getElementById('regCard');
  const regTitle  = document.getElementById('regTitle');
  const regMode   = document.getElementById('regMode');
  const regYear   = document.getElementById('regYear');
  const lblRegYear= document.getElementById('lblRegYear');
  const btnRegReload = document.getElementById('btnRegReload');

  let barChart = null, lineChart = null;

  // --- Utils ---
  const monthNames = ['Yan','Fev','Mar','Apr','May','Iyun','Iyul','Avg','Sen','Okt','Noy','Dek'];
  const thisYear = () => (new Date()).getFullYear();
  function fillYearSelect(select, countBack = 5) {
    const y = thisYear();
    select.innerHTML = '';
    for (let i = 0; i <= countBack; i++) {
      const yr = y - i;
      const o = document.createElement('option');
      o.value = String(yr); o.textContent = String(yr);
      if (i === 0) o.selected = true;
      select.appendChild(o);
    }
  }
  function setRegTitle(mode, year) {
    regTitle.textContent = (mode === 'year')
      ? "Ro‘yxatdan o‘tganlar — Yillik"
      : `Ro‘yxatdan o‘tganlar — Oylik (${year})`;
  }

  // --- Renderers ---
  function renderKPIs(totals = {}) {
    kpiStudents.textContent = totals.students ?? '—';
    kpiActive.textContent   = totals.active_students ?? totals.students ?? '—';
    kpiClasses.textContent  = totals.classes ?? '—';
    kpiTeachers.textContent = totals.teachers ?? '—';
  }

  function renderClassesTable(classes = []) {
    tblBody.innerHTML = '';
    classes.forEach((c, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i + 1}</td><td>${c.name || ('#' + c.id)}</td><td>${c.students_count ?? 0}</td>`;
      tblBody.appendChild(tr);
    });
  }

  function renderClassBar(classes = []) {
    const top = [...classes].sort((a, b) => (b.students_count || 0) - (a.students_count || 0)).slice(0, 12);
    const labels = top.map(c => c.name);
    const data = top.map(c => c.students_count || 0);
    const ctx = document.getElementById('clsBar').getContext('2d');
    if (barChart) barChart.destroy();
    barChart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'O‘quvchilar', data }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  function renderRegMonthly(year, monthly = []) {
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const map = new Map(monthly.map(r => [String((r.month || '').slice(5)).padStart(2,'0'), r.count || 0]));
    const labels = months.map(i => `${String(i).padStart(2, '0')} · ${monthNames[i - 1]}`);
    const data   = months.map(i => map.get(String(i).padStart(2, '0')) || 0);

    const ctx = document.getElementById('regLine').getContext('2d');
    if (lineChart) lineChart.destroy();
    lineChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Ro‘yxatdan o‘tganlar', data, tension: 0.25 }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
    regCard.style.display = '';
    setRegTitle('month', year);
  }

  function renderRegYearly(series = []) {
    const labels = series.map(r => String(r.year));
    const data   = series.map(r => r.count || 0);

    const ctx = document.getElementById('regLine').getContext('2d');
    if (lineChart) lineChart.destroy();
    lineChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Ro‘yxatdan o‘tganlar (yillik)', data, tension: 0.25 }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
    regCard.style.display = '';
    setRegTitle('year');
  }

  // --- API loaders (compatible with your /api/views.py SchoolStatsView) ---
  async function loadSchoolStatsBase() {
    return getJSON('/stats/school/'); // { totals, classes, registrations? }
  }
  async function loadRegistrationsMonthly(year) {
    // Try dedicated endpoint first if you add it later; fallback to /stats/school/
    try {
      return await getJSON(`/stats/registrations/?granularity=month&year=${year}`);
    } catch {
      const base = await loadSchoolStatsBase().catch(() => null);
      if (base?.registrations?.monthly) {
        return { granularity: 'month', year: base.registrations.year || year, monthly: base.registrations.monthly, available: true };
      }
      return { granularity: 'month', year, monthly: [], available: false };
    }
  }
  async function loadRegistrationsYearly(yearsBack = 5) {
    try {
      return await getJSON(`/stats/registrations/?granularity=year&years=${yearsBack}`);
    } catch {
      const y = thisYear();
      const mo = await loadRegistrationsMonthly(y).catch(() => ({ available: false }));
      if (mo.available && mo.monthly?.length) {
        return { granularity: 'year', series: [{ year: y, count: mo.monthly.reduce((a, b) => a + (b.count || 0), 0) }], available: true };
      }
      return { granularity: 'year', series: [], available: false };
    }
  }

  // --- Events ---
  btnRegReload?.addEventListener('click', async () => {
    if (regMode.value === 'year') {
      lblRegYear.style.display = 'none'; regYear.style.display = 'none';
      const yr = await loadRegistrationsYearly(5);
      if (yr.available && yr.series?.length) renderRegYearly(yr.series);
      else regCard.style.display = 'none';
    } else {
      lblRegYear.style.display = ''; regYear.style.display = '';
      const y = parseInt(regYear.value || thisYear(), 10);
      const mo = await loadRegistrationsMonthly(y);
      if (mo.available) renderRegMonthly(mo.year || y, mo.monthly || []);
      else regCard.style.display = 'none';
    }
  });

  regMode?.addEventListener('change', () => {
    const yearly = (regMode.value === 'year');
    lblRegYear.style.display = yearly ? 'none' : '';
    regYear.style.display = yearly ? 'none' : '';
  });

  // --- Init ---
  (async function init() {
    try {
      // KPIs + classes + maybe monthly registrations block
      const stats = await loadSchoolStatsBase();
      renderKPIs(stats?.totals || {});
      renderClassesTable(stats?.classes || []);
      renderClassBar(stats?.classes || []);

      // registration controls
      fillYearSelect(regYear, 5);
      lblRegYear.style.display = ''; regYear.style.display = '';

      // monthly current year first
      const y = parseInt(regYear.value || thisYear(), 10);
      const mo = await loadRegistrationsMonthly(y);
      if (mo.available) {
        renderRegMonthly(mo.year || y, mo.monthly || []);
      } else {
        const yr = await loadRegistrationsYearly(5);
        if (yr.available && yr.series?.length) {
          regMode.value = 'year';
          lblRegYear.style.display = 'none';
          regYear.style.display = 'none';
          renderRegYearly(yr.series);
        } else {
          regCard.style.display = 'none';
        }
      }
    } catch (e) {
      console.error('Dashboard load failed', e);
      // Leave placeholders instead of blocking the page
    }
  })();
})();
