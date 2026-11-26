'use strict';
/* 공통 도우미 (관리자·학부모 함께 사용) */
const CFG = window.APP_CONFIG;
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});

// 화면에 넣는 모든 글자는 esc()로 감싸서 스크립트 주입을 막습니다.
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function safeUrl(u) { return /^https:\/\/[^\s<>"]+$/.test(u || '') ? u : '#'; }
function won(n) { return '₩' + Math.round(Number(n || 0)).toLocaleString('ko-KR'); }
function z2(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return d.getFullYear() + '-' + z2(d.getMonth() + 1) + '-' + z2(d.getDate()); }
function todayStr() { return ymd(new Date()); }
function addDays(s, n) { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); }
function addMonths(s, n) { const d = new Date(s + 'T00:00:00'); d.setMonth(d.getMonth() + n); return ymd(d); }
function monthStart(s) { const d = s ? new Date(s + 'T00:00:00') : new Date(); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)); }
function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }
const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
function dow(s) { return (new Date(s + 'T00:00:00').getDay() + 6) % 7; }
function md(s) { if (!s) return '—'; const p = s.split('-'); return Number(p[1]) + '/' + Number(p[2]); }
function dot(s) { return s ? s.replace(/-/g, '.') : '—'; }
function hm(t) { return t ? String(t).slice(0, 5) : ''; }
function daysText(arr) { return (arr || []).map(i => DAYS[i]).join('·'); }
const STEPS = ['물 적응', '킥판', '자유형', '배영', '평영', '접영', '진급'];
const METHODS = ['카드', '결제선생', '이모아', '제로페이', '바우처', '현금', '계좌이체'];
const KIND = { child: '어린이', adult: '성인' };

function toast(msg, isErr) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.className = isErr ? 'err' : ''; t.classList.remove('hidden');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), isErr ? 6000 : 2600);
}
function errText(e) {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (/Invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 맞지 않아요.';
  if (/already registered/i.test(m)) return '이미 가입된 이메일이에요. 로그인해 주세요.';
  if (/Password should be/i.test(m)) return '비밀번호는 8자 이상으로 정해 주세요.';
  if (/forbidden|row-level security|permission denied/i.test(m)) return '권한이 없어요.';
  if (/Failed to fetch|NetworkError/i.test(m)) return '인터넷 연결을 확인해 주세요.';
  return m;
}
function fail(e) { console.error(e); toast(errText(e), true); }
async function q(promise) { const { data, error } = await promise; if (error) throw error; return data; }
function formData(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
  return o;
}
const LOGO = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 17c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><circle cx="15" cy="6" r="2"/><path d="M6 12l4-4 4 3"/></svg>';

function authFormHtml(title, subtitle) {
  return `<div class="auth-wrap"><form class="auth" id="authForm" novalidate>
    <div class="row"><div class="logo">${LOGO}</div><div><div class="bold">${esc(CFG.CENTER_NAME)}</div><div class="small muted">${esc(subtitle)}</div></div></div>
    <h1 style="font-size:22px">${esc(title)}</h1>
    <div class="seg" role="tablist"><button type="button" class="on" data-mode="in">로그인</button><button type="button" data-mode="up">처음이에요 (가입)</button></div>
    <label class="f">이메일<input name="email" type="email" autocomplete="email" required></label>
    <label class="f">비밀번호<input name="password" type="password" autocomplete="current-password" minlength="8" required></label>
    <label class="f hidden" id="pw2wrap">비밀번호 확인<input name="password2" type="password" autocomplete="new-password" minlength="8"></label>
    <button class="btn pri block" type="submit" id="authBtn">로그인</button>
    <div class="small muted" id="authHint"></div>
  </form></div>`;
}
function bindAuthForm(root, onDone) {
  let mode = 'in';
  const form = root.querySelector('#authForm');
  form.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
    mode = b.dataset.mode;
    form.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
    form.querySelector('#pw2wrap').classList.toggle('hidden', mode === 'in');
    form.querySelector('#authBtn').textContent = mode === 'in' ? '로그인' : '가입하기';
    form.querySelector('[name=password]').autocomplete = mode === 'in' ? 'current-password' : 'new-password';
    form.querySelector('#authHint').textContent = mode === 'up' ? '비밀번호는 8자 이상, 다른 사이트와 다르게 정해 주세요.' : '';
  });
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const f = formData(form);
    if (!f.email || !f.password) return toast('이메일과 비밀번호를 입력해 주세요.', true);
    if (mode === 'up' && f.password !== f.password2) return toast('비밀번호 확인이 달라요.', true);
    if (f.password.length < 8) return toast('비밀번호는 8자 이상이에요.', true);
    const btn = form.querySelector('#authBtn'); btn.disabled = true;
    try {
      if (mode === 'in') await q(sb.auth.signInWithPassword({ email: f.email, password: f.password }));
      else {
        const d = await q(sb.auth.signUp({ email: f.email, password: f.password }));
        if (!d.session) { toast('가입 확인 메일을 확인해 주세요. (센터에 문의)'); btn.disabled = false; return; }
      }
      await onDone();
    } catch (e) { fail(e); btn.disabled = false; }
  };
}
