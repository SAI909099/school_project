/* Student payments page */
(function () {
  const API = (window.API_BASE || '/api/billing').replace(/\/+$/, '');
  const token = localStorage.getItem('access');
  if (!token) { window.location.replace('/'); return; }
  const HEADERS = { 'Authorization': 'Bearer ' + token };
  const JSON_HEADERS = { ...HEADERS, 'Content-Type': 'application/json' };

  // DOM
  const monthInp = document.getElementById('monthInp');
  const classSel = document.getElementById('classSel');
  const statusSel = document.getElementById('statusSel');
  const btnLoad = document.getElementById('btnLoad');
  const btnGenerate = document.getElementById('btnGenerate');
  const tblBody = document.querySelector('#tbl tbody');
  const qSearch = document.getElementById('qSearch');

  const planClassSel = document.getElementById('planClassSel');
  const planAmount = document.getElementById('planAmount');
  const btnPlanSave = document.getElementById('btnPlanSave');

  const payDlg = document.getElementById('payDlg');
  const dlgWho = document.getElementById('dlgWho');
  const payAmount = document.getElementById('payAmount');
  const payMethod = document.getElementById('payMethod');
  const payNote = document.getElementById('payNote');
  const btnPaySave = document.getElementById('btnPaySave');
  const btnPayCancel = document.getElementById('btnPayCancel');

  // State
  let invoices = [];   // raw list from API
  let classes = [];    // [{id,name}]
  let plansByClass = new Map(); // class_id -> {id, amount_uzs}
  let currentPay = null; // {invoice_id, student_id, name}

  // Helpers
  function todayMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  function som(n){ return (Number(n||0)).toLocaleString('uz-UZ') + " so'm"; }
  function yymm(dateStr){ return (dateStr||'').slice(0,7); }
  function badge(status, balance){
    if (status === 'paid' && Number(balance) < 0) return `<span class="pill prepaid">prepaid</span>`;
    return `<span class="pill ${status}">${status}</span>`;
  }
  async function getJSON(url){ const r=await fetch(url,{headers:HEADERS}); if(!r.ok) throw new Error(r.status); return r.json(); }
  async function postJSON(url, body){ const r=await fetch(url,{method:'POST',headers:JSON_HEADERS,body:JSON.stringify(body)}); const t=await r.text(); let j={}; try{j=t?JSON.parse(t):{}}catch{} if(!r.ok) throw new Error(j.detail||t||('HTTP '+r.status)); return j; }
  async function putJSON(url, body){ const r=await fetch(url,{method:'PUT',headers:JSON_HEADERS,body:JSON.stringify(body)}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }

  // Load classes (directory API you already have)
  async function loadClasses(){
    const data = await getJSON('/api/dir/classes/');
    classes = data || [];
    classSel.innerHTML = '<option value="">— hammasi —</option>';
    planClassSel.innerHTML = '<option value="">— tanlang —</option>';
    classes.forEach(c=>{
      const opt1 = new Option(c.name, c.id);
      const opt2 = new Option(c.name, c.id);
      classSel.add(opt1); planClassSel.add(opt2);
    });
  }

  // Load existing tuition plans
  async function loadPlans(){
    const data = await getJSON(API + '/plans/');
    plansByClass.clear();
    (data||[]).forEach(p=>plansByClass.set(String(p.clazz), p));
  }

  // When plan class changed, show amount
  planClassSel.addEventListener('change', ()=>{
    const cid = planClassSel.value;
    if (!cid) { planAmount.value=''; return; }
    const p = plansByClass.get(String(cid));
    planAmount.value = p ? Number(p.amount_uzs) : '';
  });

  // Save tuition plan (create or update)
  btnPlanSave.addEventListener('click', async ()=>{
    const cid = planClassSel.value;
    const amt = Number(planAmount.value||0);
    if (!cid || !amt) return alert('Sinf va narxni kiriting.');
    try{
      const existing = plansByClass.get(String(cid));
      if (existing) {
        const payload = { id: existing.id, clazz: Number(cid), amount_uzs: amt };
        await putJSON(API + `/plans/${existing.id}/`, payload);
      } else {
        await postJSON(API + '/plans/', { clazz: Number(cid), amount_uzs: amt });
      }
      await loadPlans();
      alert('Saqlandi.');
    }catch(e){ alert('Xatolik: '+e.message); }
  });

  // Fetch invoices with filters; handle prepaid on client
  async function loadInvoices(){
    const params = new URLSearchParams();
    const m = monthInp.value;
    if (m) params.set('month', m);
    const c = classSel.value;
    if (c) params.set('class', c);
    const st = statusSel.value;
    if (st && st !== '__prepaid') params.set('status', st);

    const url = API + '/invoices/' + (params.toString() ? ('?' + params.toString()) : '');
    const data = await getJSON(url);
    let rows = Array.isArray(data) ? data : [];

    // Mixin student/class names (InvoiceSerializer returns student id only).
    // We fetch a light students list per class via /api/classes/<id>/students_az/ if needed – but
    // to keep it simple, show just IDs unless you add a serializer that expands names.
    // Alternative: we’ll enrich by a separate call per invoice’s student via /api/student/<id>/balance,
    // but that’s heavier. For now we keep ID; (Bonus code below shows enrichment via a cache).
    // ---- Bonus enrichment cache (best-effort) ----
    const nameCache = new Map();
    async function studentName(studentId){
      if (nameCache.has(studentId)) return nameCache.get(studentId);
      // Try directory search (global) and cache first match
      try{
        const sj = await getJSON(`/api/dir/students/?q=${studentId}`);
        const m = (sj||[]).find(x=>x.id===studentId);
        const nm = m ? ((m.full_name || `${m.first_name||''} ${m.last_name||''}`).trim()) : `#${studentId}`;
        nameCache.set(studentId, nm);
        return nm;
      }catch{ nameCache.set(studentId, `#${studentId}`); return `#${studentId}`; }
    }

    // Status “prepaid” (balance < 0)
    if (statusSel.value === '__prepaid') {
      rows = rows.filter(r => Number(r.balance_uzs) < 0);
    }

    // Simple search (client-side)
    const q = (qSearch.value||'').toLowerCase().trim();
    // we’ll filter by student name once we enrich names below.

    // Render
    tblBody.innerHTML = '';
    for (const r of rows) {
      const sname = await studentName(r.student);
      if (q && !sname.toLowerCase().includes(q)) continue;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${sname}</td>
        <td>${'' /* optional: class name if serializer expands */}</td>
        <td>${yymm(r.month)}</td>
        <td>${som(r.amount_uzs)}</td>
        <td>${som(r.discount_uzs)}</td>
        <td>${som(r.penalty_uzs)}</td>
        <td>${som(r.paid_uzs)}</td>
        <td>${som(r.balance_uzs)}</td>
        <td>${badge(r.status, r.balance_uzs)}</td>
        <td><button class="btn primary btn-pay" data-inv="${r.id}" data-st="${r.student}" data-month="${r.month}">To‘lov</button></td>
      `;
      tblBody.appendChild(tr);
    }

    // Wire payment buttons
    tblBody.querySelectorAll('.btn-pay').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        const inv = Number(btn.dataset.inv);
        const st  = Number(btn.dataset.st);
        const when = btn.dataset.month.slice(0,7);
        currentPay = { invoice_id: inv, student_id: st, month: when, display: btn.closest('tr')?.firstChild?.textContent || `#${st}` };
        dlgWho.textContent = `${currentPay.display} — ${when}`;
        payAmount.value = '';
        payMethod.value = 'cash';
        payNote.value = '';
        payDlg.showModal();
      });
    });
  }

  // Generate invoices for month from plans
  btnGenerate.addEventListener('click', async ()=>{
    const m = monthInp.value || todayMonth();
    const cid = classSel.value;
    const due = 10;
    const def = 0; // if no plan exists, fallback to 0 (or set default here)
    const qs = new URLSearchParams({ month: m, due_day: String(due) });
    if (cid) qs.set('class', cid);
    if (def) qs.set('default_amount', String(def));
    try {
      const res = await postJSON(API + '/invoices/generate/?' + qs.toString(), {});
      alert(`Yaratildi: ${res.created}, yangilandi: ${res.updated}`);
      await loadInvoices();
    } catch (e) {
      alert('Xatolik: ' + e.message);
    }
  });

  // Save payment
  btnPaySave.addEventListener('click', async ()=>{
    if (!currentPay) return;
    const amt = Number(payAmount.value||0);
    if (!amt || amt<=0) return alert('Miqdorni kiriting');
    const body = {
      student: currentPay.student_id,
      invoice: currentPay.invoice_id,
      amount_uzs: amt,
      method: payMethod.value,
      note: payNote.value||'',
      // paid_at optional - backend defaults to now
    };
    try{
      await postJSON(API + '/payments-model/', body);
      payDlg.close();
      await loadInvoices();
    }catch(e){ alert('Xatolik: '+e.message); }
  });
  btnPayCancel.addEventListener('click', ()=> payDlg.close());

  // Actions
  btnLoad.addEventListener('click', loadInvoices);
  monthInp.addEventListener('change', loadInvoices);
  classSel.addEventListener('change', loadInvoices);
  statusSel.addEventListener('change', loadInvoices);
  qSearch.addEventListener('input', ()=> loadInvoices());

  // Init
  (async function init(){
    monthInp.value = todayMonth();
    await loadClasses();
    await loadPlans();
    await loadInvoices();
  })();
})();
