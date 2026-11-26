'use strict';
/* 관리자 웹 — 공통 틀, 로그인, 대시보드 */
const A = { me: null, classes: [], staff: [], members: [], pages: {} };
const root = document.getElementById('root');
const isAdmin = () => A.me && A.me.role === 'admin';

const NAV = [
  ['dashboard', '대시보드', true], ['members', '회원 관리', false], ['classes', '반·시간표', false],
  ['payments', '결제·매출', true], ['notices', '학부모 공지', true], ['import', '엑셀 가져오기', true], ['staff', '직원 권한', true]
];

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showLogin();
  await afterLogin();
}
function showLogin() {
  root.innerHTML = authFormHtml('관리자 로그인', '어린이 수영 관리');
  bindAuthForm(root, afterLogin);
}
async function afterLogin() {
  try {
    const who = await q(sb.rpc('whoami'));
    if (!who.staff) {
      const { data: { user } } = await sb.auth.getUser();
      root.innerHTML = `<div class="auth-wrap"><div class="auth"><h1 style="font-size:20px">권한 확인 중이에요</h1>
        <p class="muted" style="margin:0">가입은 완료됐어요. 관리자에게 이 이메일을 알려 주시면 '직원 권한'에서 등록해 드려요.</p>
        <div class="info">${esc(user && user.email)}</div><button class="btn" id="lo">로그아웃</button></div></div>`;
      document.getElementById('lo').onclick = logout;
      return;
    }
    A.me = who.staff;
    await loadBase();
    renderShell();
    route();
  } catch (e) { fail(e); showLogin(); }
}
async function logout() { await sb.auth.signOut(); A.me = null; location.hash = ''; showLogin(); }
async function loadBase() {
  [A.classes, A.staff] = await Promise.all([
    q(sb.from('classes').select('*').eq('kind', 'child').order('start_time')),
    q(sb.from('staff').select('*').order('name'))
  ]);
  await loadMembers();
}
async function loadMembers() {
  const all = []; let from = 0;
  while (true) {
    const page = await q(sb.from('members').select('*').eq('kind', 'child').order('name').range(from, from + 999));
    all.push(...page); if (page.length < 1000) break; from += 1000;
  }
  A.members = all;
  const enr = []; let f2 = 0;
  while (true) {
    const page = await q(sb.from('enrollments').select('member_id,class_id').range(f2, f2 + 999));
    enr.push(...page); if (page.length < 1000) break; f2 += 1000;
  }
  A.enr = enr;
}
// 한 아이 = 여러 반
function enrolledClasses(mid) {
  return A.enr.filter(e => e.member_id === mid).map(e => clsById(e.class_id)).filter(Boolean)
    .sort((a, b) => (a.days[0] ?? 9) - (b.days[0] ?? 9) || String(a.start_time).localeCompare(String(b.start_time)));
}
function classMembers(cid) {
  const ids = new Set(A.enr.filter(e => e.class_id === cid).map(e => e.member_id));
  return A.members.filter(m => ids.has(m.id));
}
function clsNames(mid) { return enrolledClasses(mid).map(c => c.name).join(', '); }
function teacherNames(mid) { return [...new Set(enrolledClasses(mid).map(c => c.teacher_id).filter(Boolean).map(staffName))].join(', '); }
function kidCode(mid) {
  const pairs = []; enrolledClasses(mid).forEach(c => { const h = +hm(c.start_time).slice(0, 2); c.days.forEach(d => pairs.push([d, (h > 12 ? h - 12 : h)])); });
  return pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([d, h]) => DAYS[d] + h).join('');
}
const clsById = (id) => A.classes.find(c => c.id === id);
const staffName = (id) => (A.staff.find(s => s.user_id === id) || {}).name || '미배정';
function clsLabel(c) { return c ? `${c.name} · ${daysText(c.days)} ${hm(c.start_time)}` : '—'; }

function renderShell() {
  const items = NAV.filter(n => isAdmin() || !n[2]);
  root.innerHTML = `<div class="app">
    <nav class="nav" aria-label="주 메뉴">
      <div class="brand"><div class="logo">${LOGO}</div><div><div class="bold">${esc(CFG.CENTER_NAME)}</div><div class="small" style="color:#9FB3C8">어린이 수영 관리 · ${esc(CFG.BRANCH_NAME)}</div></div></div>
      ${items.map(n => `<a href="#${n[0]}" data-nav="${n[0]}">${n[1]}</a>`).join('')}
      <div class="me"><span>${esc(A.me.role === 'admin' ? '관리자' : '강사')} · ${esc(A.me.name)}</span><button id="logout">로그아웃</button></div>
    </nav>
    <main class="content" id="view"></main></div>`;
  document.getElementById('logout').onclick = logout;
}
async function route() {
  if (!A.me) return;
  let r = (location.hash || '').slice(1) || (isAdmin() ? 'dashboard' : 'classes');
  const allowed = NAV.find(n => n[0] === r && (isAdmin() || !n[2]));
  if (!allowed) r = isAdmin() ? 'dashboard' : 'classes';
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === r));
  const v = document.getElementById('view');
  v.onclick = v.onchange = v.oninput = v.onsubmit = null;
  v.innerHTML = '<div class="loading">불러오는 중…</div>';
  try { await A.pages[r](v); } catch (e) { fail(e); v.innerHTML = `<div class="card empty">불러오지 못했어요: ${esc(errText(e))}</div>`; }
}
window.addEventListener('hashchange', route);

/* ---------- 대시보드 ---------- */
A.pages.dashboard = async (v) => {
  await loadMembers();
  const today = todayStr(), ms = monthStart(), wk = addDays(today, 7);
  const [pays, logs] = await Promise.all([
    q(sb.from('payments').select('amount,refund_amount,method,type,members!inner(kind)').eq('members.kind', 'child').gte('paid_at', ms).lte('paid_at', addDays(addMonths(ms, 1), -1))),
    q(sb.from('member_status_log').select('status,refund_amount,members!inner(kind)').eq('members.kind', 'child').gte('effective_date', ms))
  ]);
  const M = A.members, live = M.filter(m => m.status !== '탈회');
  const kids = live.filter(m => m.kind === 'child').length, adults = live.length - kids, paused = live.filter(m => m.status === '휴회').length;
  const newCnt = pays.filter(p => p.type === '신규').length, reCnt = pays.length - newCnt;
  const left = logs.filter(l => l.status === '탈회').length;
  const refunds = logs.reduce((s, l) => s + (l.refund_amount || 0), 0);
  const total = pays.reduce((s, p) => s + p.amount - (p.refund_amount || 0), 0);
  const byM = METHODS.concat(['서비스']).map(m => [m, pays.filter(p => p.method === m).reduce((s, p) => s + p.amount, 0)]);
  const maxM = Math.max(1, ...byM.map(x => x[1]));
  const td = dow(today);
  const todays = A.classes.filter(c => c.active && c.days.includes(td)).map(c => {
    const n = classMembers(c.id).filter(m => m.status === '재원').length; return { c, n };
  });
  const expiring = M.filter(m => m.status === '재원' && m.pass_end && m.pass_end >= today && m.pass_end <= wk).sort((a, b) => a.pass_end.localeCompare(b.pass_end));
  const d = new Date();
  v.innerHTML = `
  <header class="spread"><div><h1>대시보드</h1><div class="muted small">${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DAYS[td]})</div></div>
    <a class="btn pri" href="#members" data-new="1">+ 원생 등록</a></header>
  <section class="grid-auto">
    <div class="card"><div class="muted small">총 원생</div><div class="kpi-n">${live.length}<span class="small muted"> 명</span></div>
      <div class="row small" style="margin-top:8px"><span>재원 <b>${live.length - paused}</b></span><span>휴회 <b>${paused}</b></span></div></div>
    <div class="card"><div class="muted small">이번 달 회원 변동</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px">
      <div><div class="kpi-n" style="font-size:24px;color:var(--pri)">${newCnt}</div><div class="small muted">신규</div></div>
      <div><div class="kpi-n" style="font-size:24px">${reCnt}</div><div class="small muted">재등록</div></div>
      <div><div class="kpi-n" style="font-size:24px;color:#B4471A">${left}</div><div class="small muted">탈회</div></div></div></div>
    <div class="card"><div class="muted small">이번 달 매출</div><div class="kpi-n">${won(total)}</div>
      <div class="small muted" style="margin-top:8px">결제 ${pays.length}건${refunds ? ' · 환불 ' + won(refunds) : ''}</div></div>
    <a class="card" href="#members" data-exp="1" style="background:#FFF6EE;border-color:#F3D3B5;text-decoration:none;color:var(--warn)">
      <div class="small">수강권 만료 7일 이내</div><div class="kpi-n">${expiring.length}<span class="small"> 명</span></div><div class="small" style="margin-top:8px">재등록 안내가 필요해요 →</div></a>
  </section>
  <div class="wrap2">
    <section class="card main"><div class="spread" style="margin-bottom:10px"><h2>오늘 수업 <span class="small muted">${todays.length}개 반</span></h2><a href="#classes" class="small">시간표 보기 →</a></div>
      ${todays.length ? `<div class="tbl-wrap"><table class="tbl" style="min-width:480px"><thead><tr><th>시간</th><th>반</th><th>강사</th><th style="width:36%">인원 / 정원</th></tr></thead><tbody>
      ${todays.map(({ c, n }) => `<tr><td class="bold">${esc(hm(c.start_time))}</td><td>${esc(c.name)}</td><td>${esc(staffName(c.teacher_id))}</td>
        <td><div class="row" style="flex-wrap:nowrap"><div class="bar ${n >= c.capacity ? 'full' : ''}" style="flex:1"><i style="width:${Math.min(100, Math.round(n / c.capacity * 100))}%"></i></div><span class="small" style="min-width:96px">${n}/${c.capacity}명 · ${n >= c.capacity ? '만석' : '빈자리 ' + (c.capacity - n)}</span></div></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">오늘은 수업이 없어요.</div>'}
    </section>
    <section class="card side"><div class="spread" style="margin-bottom:12px"><h2>결제수단별 매출 <span class="small muted">${d.getMonth() + 1}월</span></h2><a href="#payments" class="small">상세 →</a></div>
      <div class="col" style="gap:11px">${byM.map(([m, a]) => `<div><div class="spread small" style="margin-bottom:4px"><span>${m}</span><b>${won(a)}</b></div><div class="bar"><i style="width:${a ? Math.max(2, Math.round(a / maxM * 100)) : 0}%"></i></div></div>`).join('')}</div>
    </section>
  </div>
  <section class="card"><h2 style="margin-bottom:12px">수강권 만료 7일 이내 회원</h2>
    ${expiring.length ? `<div class="grid-auto" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">${expiring.map(m => `
      <a href="#members" data-open="${esc(m.id)}" style="border:1px solid var(--line);border-radius:10px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;text-decoration:none;color:var(--ink)">
        <div><div class="bold">${esc(m.name)}</div><div class="small muted">${esc(clsNames(m.id) || '반 없음')} · ${md(m.pass_end)} 만료</div></div>
        <span class="badge b-warn">D-${daysBetween(today, m.pass_end)}</span></a>`).join('')}</div>` : '<div class="empty">없어요.</div>'}
  </section>`;
  v.onclick = (e) => {
    const a = e.target.closest('[data-open],[data-new],[data-exp]'); if (!a) return;
    A.memberIntent = a.dataset.open ? { open: a.dataset.open } : a.dataset.new ? { create: true } : { expiring: true };
  };
};
