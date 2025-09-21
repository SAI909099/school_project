/**
 * moliya-main.js
 * Fills KPI cards from /api/billing/summary/
 * Cards are matched by their <h3> text: "Kirim", "Chiqim", "Sof foyda (oylik)"
 */
(function () {
  const API = (window.API_BASE || "/api/billing").replace(/\/+$/, "");
  const token = localStorage.getItem("access");
  const HEADERS = token ? { Authorization: "Bearer " + token } : {};

  const q = (s) => document.querySelector(s);

  function findCardByTitle(title) {
    const cards = document.querySelectorAll(".finance-card");
    for (const c of cards) {
      const h = c.querySelector("h3");
      if (h && h.textContent.trim().toLowerCase() === title.toLowerCase()) return c;
    }
    return null;
  }

  function som(n) {
    return (Number(n || 0)).toLocaleString("uz-UZ") + " so'm";
  }

  async function getJSON(url) {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  }

  async function init() {
    try {
      const s = await getJSON(API + "/summary/");
      const income = Number(s.income || 0);
      const expense = Number(s.expense || 0);
      const profit = income - expense;

      const kirim = findCardByTitle("Kirim");
      const chiqim = findCardByTitle("Chiqim");
      const foyda = findCardByTitle("Sof foyda (oylik)");

      if (kirim) kirim.querySelector(".amount").textContent = som(income);
      if (chiqim) chiqim.querySelector(".amount").textContent = som(expense);
      if (foyda) foyda.querySelector(".amount").textContent = som(profit);
    } catch (e) {
      console.error("Summary load failed:", e);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
