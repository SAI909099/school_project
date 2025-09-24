/**
 * Salaries page — shows all staff (teachers + admins + operators etc.)
 * Columns: full name, specialty, role, amount, paid checkbox
 * Supports month locking (finalize).
 */
(function () {
  const API = (window.API_BASE || "/api/billing").replace(/\/+$/, "");
  const token = localStorage.getItem("access");
  const JSON_HEADERS = token
    ? { Authorization: "Bearer " + token, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };

  const monthInp   = document.getElementById("monthInp");
  const btnReload  = document.getElementById("btnReload");
  const btnSave    = document.getElementById("btnSave");
  const btnFinalize= document.getElementById("btnFinalize");
  const tblBody    = document.querySelector("#tbl tbody");
  const qSearch    = document.getElementById("qSearch");
  const lockInfo   = document.getElementById("lockInfo");

  let locked = false;
  let rows = []; // [{user, full_name, role, specialty, amount_uzs, paid}]

  function thisMonth() {
    const d = new Date();
    return d.toISOString().slice(0,7);
  }
  async function getJSON(url){
    const r = await fetch(url, { headers: JSON_HEADERS });
    if (!r.ok) throw new Error("HTTP "+r.status);
    return await r.json();
  }
  async function postJSON(url, body){
    const r = await fetch(url, { method:"POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
    const t = await r.text();
    let j = {};
    try { j = t ? JSON.parse(t) : {}; } catch {}
    if (!r.ok) throw new Error(j.detail || t || ("HTTP "+r.status));
    return j;
  }

  function render() {
    const q = (qSearch.value || "").trim().toLowerCase();
    tblBody.innerHTML = "";
    (rows || []).forEach(it => {
      const hay = `${it.full_name} ${it.role} ${it.specialty}`.toLowerCase();
      if (q && !hay.includes(q)) return;
      const tr = document.createElement("tr");
      tr.dataset.user = it.user;
      tr.innerHTML = `
        <td>${it.full_name || ""}</td>
        <td>${it.specialty || ""}</td>
        <td>${it.role || ""}</td>
        <td><input type="number" class="amount" min="0" step="10000" value="${Number(it.amount_uzs || 0)}"></td>
        <td style="text-align:center;"><input type="checkbox" class="paid" ${it.paid ? "checked" : ""}></td>
      `;
      if (locked) {
        tr.querySelector(".amount").setAttribute("disabled", "disabled");
        tr.querySelector(".paid").setAttribute("disabled", "disabled");
      }
      tblBody.appendChild(tr);
    });

    btnSave.classList.toggle("disabled", locked);
    btnSave.disabled = locked;
    btnFinalize.classList.toggle("disabled", locked);
    btnFinalize.disabled = locked;
    lockInfo.textContent = locked ? "Bu oy yakunlangan (lock). O‘zgartirish mumkin emas." : "";
  }

  async function load() {
    const m = monthInp.value || thisMonth();
    const data = await getJSON(`${API}/salaries/staff/?month=${encodeURIComponent(m)}`);
    locked = !!data.locked;
    rows = Array.isArray(data.items) ? data.items : [];
    render();
  }

  async function save() {
    if (locked) return alert("Oy yakunlangan. O‘zgartirish mumkin emas.");

    const m = monthInp.value || thisMonth();
    const items = Array.from(tblBody.querySelectorAll("tr")).map(tr => {
      const user = Number(tr.dataset.user);
      const amount = Number(tr.querySelector(".amount").value || 0);
      const paid = !!tr.querySelector(".paid").checked;
      return { user, amount_uzs: amount, paid };
    });
    if (!items.length) return alert("Saqlash uchun ma'lumot yo‘q.");

    await postJSON(`${API}/salaries/mark/`, { month: m, items });
    alert("Saqlandi.");
    await load();
  }

  async function finalize() {
    if (locked) return;
    const m = monthInp.value || thisMonth();
    if (!confirm("Ushbu oy yakunlansinmi? (keyin o‘zgartira olmaysiz)")) return;
    await postJSON(`${API}/salaries/finalize/`, { month: m });
    alert("Oy yakunlandi (lock).");
    await load();
  }

  // Events
  btnReload.addEventListener("click", load);
  btnSave.addEventListener("click", save);
  btnFinalize.addEventListener("click", finalize);
  monthInp.addEventListener("change", load);
  qSearch.addEventListener("input", render);

  // Init
  document.addEventListener("DOMContentLoaded", () => {
    monthInp.value = thisMonth();
    load().catch(console.error);
  });
})();
