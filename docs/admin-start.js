'use strict';
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT' && A.me) { A.me = null; showLogin(); } });
boot();
