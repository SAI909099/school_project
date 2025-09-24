/**
 * moliya-chiqim.js
 * - Date range filter (from/to)
 * - Include salaries (oyliklar) toggle
 * - Client search
 * - CSV export
 * - NEW: Add manual expense via modal (POST /api/billing/expenses/)
 */
(function () {
  const API = (window.API_BASE || "/api/billing").replace(/\/+$/, "");
  const token = localStorage.getItem("access");
  const HEADERS = token ? { Authorization: "Bearer " + token } : {};
  const JSON_HEADERS = token
    ? { Authorization: "Bearer " + token, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };

  // DOM
  const fromDate = document.getElementById("fromDate");
  const toDate   = document.getElementById("toDate");
  const incSalary= document.getElementById("incSalary");
  const btnFilter= document.getElementById("btnFilter");
  const btnThisMonth = document.getElementById("btnThisMonth");
  const btnReset = document.getElementById("btnReset");
  const btnNew = document.getElementById("btnNew");
  const q = document.getElementById("q");
  const rowsCount = document.getElementById("rowsCount");
  const sumBox = document.getElementById("sumBox");
  const btnExport = document.getElementById("btnExport");
  const tbody = document.querySelector("#tbl tbody");

  // dialog
  const expDlg = document.getElementById("expDlg");
  const expDate = document.getElementById("expDate");
  const expAmount = document.getElementById("expAmount");
  const expMethod = document.getElementById("expMethod");
  const expCategory = document.getElementById("expCategory");
  const expReason = document.getElementById("expReason");
  const btnSaveExp = document.getElementById("btnSaveExp");
  const btnCancelExp = document.getElementById("btnCancelExp");

  // helpers
  const pad = (n) => String(n).padStart(2,"0");
  function todayISO(){
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  function thisMonthRange() {
    const d = new Date();
    const y = d.getFullYear(), m = d.getMonth()+1;
    const first = `${y}-${pad(m)}-01`;
    const lastDate = new Date(y, m, 0).getDate();
    const last = `${y}-${pad(m)}-${pad(lastDate)}`;
    return {first, last};
  }
  function som(n){ return (Number(n || 0)).toLocaleString("uz-UZ") + " so'm"; }
  function fmtDate(d) {
    const dt = new Date(d);
    return isNaN(dt) ? (d || "") : dt.toISOString().slice(0, 10);
  }
  function tag(kind, catName){
    if (kind === "salary_total") return `<span class="tag salary">Oyliklar (yakun)</span>`;
    if (kind === "salary") return `<span class="tag salary">Oylik</span>`;
    // manual
    const label = catName ? ` — ${catName}` : "";
    return `<span class="tag manual">Xarajat${label}</span>`;
  }
  function rowAmount(r){ return r.amount_uzs ?? r.amount ?? 0; }

  async function getJSON(url) {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  }

  function render(rows) {
    // sort by date ASC
    rows.sort((a,b)=>{
      const da = (a.date || a.paid_at || ''), db = (b.date || b.paid_at || '');
      return String(da).localeCompare(String(db));
    });

    // search filter
    const qv = (q.value || "").toLowerCase().trim();
    const filtered = rows.filter(r => {
      if (!qv) return true;
      const hay = [
        r.reason || "",
        r.method || "",
        r.kind || "",
        r.category_name || "",
        fmtDate(r.date || r.paid_at)
      ].join(" ").toLowerCase();
      return hay.includes(qv);
    });

    // fill table
    tbody.innerHTML = "";
    let sum = 0;
    filtered.forEach((p, i) => {
      const amt = Number(rowAmount(p));
      sum += amt;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${fmtDate(p.date || p.paid_at)}</td>
        <td>${tag(p.kind || "manual", p.category_name)}</td>
        <td>${p.reason || p.note || ""}</td>
        <td>${p.method || "-"}</td>
        <td>${som(amt)}</td>
      `;
      tbody.appendChild(tr);
    });
    rowsCount.textContent = String(filtered.length);
    sumBox.textContent = som(sum);
  }

  async function load() {
    const params = new URLSearchParams({ type: "expense" });
    if (fromDate.value) params.set("from", fromDate.value);
    if (toDate.value)   params.set("to",   toDate.value);
    if ((incSalary.value || "1") === "1") params.set("include_salaries", "1");

    try {
      const data = await getJSON(API + "/payments/?" + params.toString());
      render(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Expenses load failed:", e);
      render([]);
    }
  }

  // CSV export (filtered rows as shown)
  function exportCSV() {
    const rows = [];
    const ths = Array.from(document.querySelectorAll("#tbl thead th")).map(th => th.textContent.trim());
    rows.push(ths.join(","));
    Array.from(tbody.querySelectorAll("tr")).forEach(tr => {
      const cols = Array.from(tr.children).map(td => {
        const t = td.textContent.replaceAll(",", " ");
        return `"${t}"`;
      });
      rows.push(cols.join(","));
    });
    const blob = new Blob([rows.join("\n")], {type: "text/csv;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "chiqimlar.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ----- Manual expense modal -----
  function openNew() {
    expDate.value = todayISO();
    expAmount.value = "";
    expMethod.value = "cash";
    expCategory.value = "other";
    expReason.value = "";
    expDlg.showModal();
  }
  async function saveNew() {
    const amt = Number(expAmount.value || 0);
    if (!expDate.value || !amt || amt <= 0) {
      alert("Sana va miqdorni to‘g‘ri kiriting.");
      return;
    }
    const body = {
      date: expDate.value,
      amount_uzs: amt,
      method: expMethod.value,
      category: expCategory.value,
      reason: expReason.value || ""
    };
    try {
      const res = await fetch(API + "/expenses/", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      expDlg.close();
      await load();
    } catch (e) {
      console.error(e);
      alert("Saqlashda xatolik.");
    }
  }

  // events
  btnFilter.addEventListener("click", load);
  btnReset.addEventListener("click", () => {
    fromDate.value = ""; toDate.value = ""; q.value = ""; incSalary.value = "1";
    load();
  });
  btnThisMonth.addEventListener("click", () => {
    const {first, last} = thisMonthRange();
    fromDate.value = first; toDate.value = last;
    load();
  });
  incSalary.addEventListener("change", load);
  q.addEventListener("input", load);
  btnExport.addEventListener("click", exportCSV);

  btnNew.addEventListener("click", openNew);
  btnSaveExp.addEventListener("click", saveNew);
  btnCancelExp.addEventListener("click", () => expDlg.close());

  // init
  document.addEventListener("DOMContentLoaded", () => {
    const {first, last} = thisMonthRange();
    fromDate.value = first; toDate.value = last;
    load();
  });
})();
