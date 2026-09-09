(function(){
  const q=new URLSearchParams(location.search);
  const requested=q.get('role')||'participant';
  const key=q.get('key')||'';
  const allowed=(requested==='participant'||key==='GoBears');
  window.SPARK_BOOT={role:allowed?requested:'participant',group:q.get('group')||'1',key:key};
})();
