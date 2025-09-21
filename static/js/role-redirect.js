// static/js/role-redirect.js
(function(global){
  const API = (window.API_BASE || '/api').replace(/\/+$/,'');
  function roleToPath(role){
    const r = (role||'').toLowerCase();
    const MAP = {
      admin: "/dashboard/",
      registrar: "/dashboard/",
      accountant: "/moliya/",
      finance: "/moliya/",
      teacher: "/teachers/",
      parent: "/otaona/",
      operator: "/operator/",
    };
    return MAP[r] || "/";
  }

  async function redirectByRole(){
    const token = localStorage.getItem('access');
    if(!token){ window.location.replace("/"); return; }
    const r = await fetch(API + "/auth/me/", { headers: { Authorization: "Bearer " + token } });
    if(!r.ok){ window.location.replace("/"); return; }
    const me = await r.json();
    window.location.replace(roleToPath(me.role));
  }

  // expose
  global.RoleRedirect = { roleToPath, redirectByRole };
})(window);
