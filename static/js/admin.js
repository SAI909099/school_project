
// admin.js
(function(){
  const access = localStorage.getItem('access');
  if(!access){
    // optional guard
    // window.location.href = '/login/';
    return;
  }
  // Example placeholder for future metric fetch
  // fetch('/api/metrics/', { headers: { Authorization: 'Bearer ' + access }})
  //  .then(r => r.json()).then(console.log).catch(console.warn);
})();
