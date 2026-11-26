'use strict';
/* 학부모 웹앱 */
const P = { kids: [], notices: [], cur: 0, tab: 'home' };
const root = document.getElementById('root');

async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showLogin();
  await load();
}
function showLogin() {
  root.innerHTML = authFormHtml('학부모 로그인', '학부모 앱');
  bindAuthForm(root, load);
}
async function load() {
  try {
    const who = await q(sb.rpc('whoami'));
    if (!who.children) return showConnect(false);
    [P.kids, P.notices] = await Promise.all([q(sb.rpc('parent_home')), q(sb.rpc('parent_notices'))]);
    if (!P.kids.length) return showConnect(false, '연결된 아이의 수강이 종료되었어요. 센터에 문의해 주세요.');
    if (P.cur >= P.kids.length) P.cur = 0;
    render();
  } catch (e) { fail(e); showLogin(); }
}

function showConnect(canBack, msg) {
  let step = 1;
  const draw = () => {
    root.innerHTML = `<div class="p-app" style="padding-bottom:0;background:#fff"><div style="padding:22px 22px 28px;display:flex;flex-direction:column;gap:18px;min-height:100vh">
      <div class="row"><div class="logo" style="width:32px;height:32px">${LOGO}</div><b>${esc(CFG.CENTER_NAME)} 학부모</b><span class="small muted" style="margin-left:auto">${step} / 2</span></div>
      ${msg ? `<div class="okbox" style="background:var(--amber-l);color:var(--amber)">${esc(msg)}</div>` : ''}
      ${step === 1 ? `
        <div><h1 style="font-size:24px">우리 아이 연결하기</h1><p class="muted" style="margin:8px 0 0">센터에서 받은 초대코드 8자리를 입력해 주세요.</p></div>
        <label class="f">초대코드<input class="code-inp" id="code" maxlength="10" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
        <div class="p-tile small" style="line-height:1.6">코드가 없으면 센터(${esc(CFG.CONTACT)}) 또는 담당 선생님께 요청해 주세요. 코드는 한 번만 쓸 수 있어요.</div>
        <div style="margin-top:auto" class="col"><button class="btn pri block" id="next">다음</button>${canBack ? '<button class="btn block" id="back">돌아가기</button>' : '<button class="btn block" id="lo">로그아웃</button>'}</div>`
      : `
        <h1 style="font-size:20px;line-height:1.4">만 14세 미만 아동 개인정보<br>수집·이용 보호자 동의</h1>
        <div class="consent">
          <div><b style="color:var(--ink)">수집 항목</b><br>아동 이름·생년월일·성별·학교, 보호자 연락처, 셔틀 노선, 출석·진도 기록, 보호자 이메일(로그인용)</div>
          <div><b style="color:var(--ink)">이용 목적</b><br>수업 운영, 출석·진도 안내, 셔틀 운행, 수강료 결제 안내</div>
          <div><b style="color:var(--ink)">보유 기간</b><br>${esc(CFG.RETENTION_TEXT)}</div>
          <div>동의를 거부할 수 있으나, 거부하면 학부모 앱을 이용할 수 없어요. 동의 철회는 센터(${esc(CFG.CONTACT)})로 요청해 주세요.</div>
        </div>
        <label class="agree"><input type="checkbox" id="agree"><span>[필수] 본인은 위 아동의 법정대리인(보호자)이며, 개인정보 수집·이용에 동의합니다.</span></label>
        <div style="margin-top:auto;flex-wrap:nowrap" class="row"><button class="btn" style="height:52px" id="prev">이전</button><button class="btn pri" style="flex:1;height:52px" id="go" disabled>동의하고 연결하기</button></div>`}
    </div></div>`;
    const $ = (id) => document.getElementById(id);
    if (step === 1) {
      $('next').onclick = () => { const c = $('code').value.replace(/\s/g, '').toUpperCase(); if (c.length < 6) return toast('초대코드를 확인해 주세요.', true); P.code = c; step = 2; msg = ''; draw(); };
      if ($('back')) $('back').onclick = () => render();
      if ($('lo')) $('lo').onclick = logout;
      $('code').value = P.code || ''; $('code').focus();
    } else {
      $('prev').onclick = () => { step = 1; draw(); };
      $('agree').onchange = (e) => { $('go').disabled = !e.target.checked; };
      $('go').onclick = async () => {
        $('go').disabled = true;
        try {
          const r = await q(sb.rpc('parent_redeem_invite', { p_code: P.code, p_consent_version: CFG.CONSENT_VERSION }));
          if (!r.ok) { msg = r.error; step = 1; draw(); return; }
          P.code = ''; toast('연결되었어요!'); await load();
        } catch (e) { fail(e); $('go').disabled = false; }
      };
    }
  };
  draw();
}
async function logout() { await sb.auth.signOut(); P.kids = []; showLogin(); }

function render() {
  const k = P.kids[P.cur];
  root.innerHTML = `<div class="p-app">
    <header class="p-head"><div class="spread"><b style="font-size:16px">${esc(CFG.CENTER_NAME)} ${esc(CFG.BRANCH_NAME)}</b></div>
      <div class="row" role="tablist" aria-label="자녀 선택" style="gap:6px">${P.kids.map((x, i) => `<button class="kid-tab ${i === P.cur ? 'on' : ''}" role="tab" aria-selected="${i === P.cur}" data-kid="${i}">${esc(x.name)}</button>`).join('')}
        <button class="kid-tab" data-act="add">+ 아이 추가</button></div></header>
    <div class="p-body" id="pbody"></div>
    <nav class="p-nav" aria-label="학부모 메뉴">${[['home', '홈', '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'], ['news', '소식', '<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/>'], ['me', '내 정보', '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>']].map(([id, l, ic]) =>
      `<button class="${P.tab === id ? 'on' : ''}" data-tab="${id}"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${ic}</svg>${l}</button>`).join('')}</nav></div>`;
  const body = document.getElementById('pbody');
  body.innerHTML = P.tab === 'home' ? homeHtml(k) : P.tab === 'news' ? newsHtml() : meHtml();
  root.onclick = (e) => {
    const t = e.target.closest('[data-kid],[data-tab],[data-act]'); if (!t) return;
    if (t.dataset.kid) { P.cur = +t.dataset.kid; render(); }
    else if (t.dataset.tab) { P.tab = t.dataset.tab; render(); window.scrollTo(0, 0); }
    else if (t.dataset.act === 'add') showConnect(true);
    else if (t.dataset.act === 'logout') logout();
    else if (t.dataset.act === 'refresh') load();
  };
}
function homeHtml(k) {
  const cls = k.classes || [], today = todayStr();
  const left = k.pass_end ? daysBetween(today, k.pass_end) : null;
  const att = k.attendance || [];
  const present = att.filter(a => a.status !== '결석').length;
  const step = Math.min(6, Math.max(0, k.step || 0));
  const color = (s) => s === '출석' ? 'background:var(--ok-l);color:var(--ok)' : s === '결석' ? 'background:var(--warn-l);color:var(--warn)' : 'background:var(--pur-l);color:var(--pur)';
  const now = new Date();
  return `
  <section class="p-card hero"><div class="small muted">우리 아이 수업${k.status === '휴회' ? ' · <b style="color:var(--amber)">휴회 중</b>' : ''}</div>
    ${cls.length ? `<div class="col" style="gap:8px;margin-top:10px">${cls.map(c => `<div class="p-tile spread" style="background:${esc(c.color)}40;border-left:6px solid ${esc(c.color)}"><div><div class="v" style="margin:0">${esc(daysText(c.days))} ${esc(c.start_time)}</div><div class="l">${esc(c.name)} · ${esc(c.level)}</div></div><div style="text-align:right"><div class="l">선생님</div><div class="v" style="margin:0"><span class="t-chip" style="background:${esc(c.color)}">${esc(c.teacher || '배정 예정')}</span></div></div></div>`).join('')}</div>` : '<div style="font-size:18px;font-weight:700;margin-top:4px">반 배정 전</div>'}</section>
  <section class="p-card"><div class="spread"><h2 style="font-size:16px">진도</h2><span class="small bold" style="color:var(--pri)">지금: ${esc(STEPS[step])}</span></div>
    <div class="stp">${STEPS.map((s, i) => `<div><i class="${i < step ? 'done' : i === step ? 'cur' : ''}" aria-hidden="true">${i < step ? '✓' : i === step ? '●' : ''}</i><span class="${i === step ? 'cur' : ''}">${s}</span></div>`).join('')}</div></section>
  <section class="p-card"><div class="spread"><h2 style="font-size:16px">${now.getMonth() + 1}월 출석</h2><span><b style="font-size:18px">${present}</b> / ${att.length}회</span></div>
    ${att.length ? `<div class="att-grid">${att.map(a => `<div style="${color(a.status)};border-top:5px solid ${esc(a.color || '#EEF2F6')}" title="${esc(a.teacher || '')}"><div>${md(a.date)}</div><b>${esc(a.status)}</b>${a.teacher ? `<div style="font-size:11px;color:var(--mid)">${esc(a.teacher)}</div>` : ''}</div>`).join('')}</div>
      ${new Set(att.map(a => a.teacher)).size > 1 ? `<div class="row small" style="gap:10px;margin-top:10px">${[...new Map(att.filter(a => a.teacher).map(a => [a.teacher, a.color])).entries()].map(([t, c]) => `<span class="row" style="gap:5px"><span style="width:12px;height:12px;border-radius:3px;background:${esc(c)}"></span>${esc(t)} 선생님</span>`).join('')}</div>` : ''}` : '<div class="small muted" style="margin-top:8px">아직 이번 달 출석 기록이 없어요.</div>'}</section>
  <section class="p-card p-pay col"><div class="spread"><div><div class="small" style="color:var(--warn)">수강권 남은 기간</div>
    <div style="font-size:21px;font-weight:700;color:var(--warn)">${left === null ? '정보 없음' : left < 0 ? '만료됨' : left + '일'} <span class="small" style="font-weight:400">${k.pass_end ? '· ' + md(k.pass_end) + '까지' : ''}</span></div></div>
    ${left !== null && left >= 0 ? `<span class="badge b-warn">D-${left}</span>` : ''}</div>
    ${k.pay_url ? `<a class="btn pri block" href="${esc(safeUrl(k.pay_url))}" target="_blank" rel="noopener noreferrer">바로 결제하기</a><div class="small" style="text-align:center;color:var(--warn)">센터에서 등록한 결제 페이지로 이동해요</div>` : '<div class="small" style="color:var(--warn)">결제는 센터로 문의해 주세요.</div>'}</section>
  ${k.teacher_note ? `<section class="p-card"><h2 style="font-size:16px">선생님 한마디</h2><div style="margin-top:10px;background:var(--pri-l);border-radius:12px;padding:14px;line-height:1.6;white-space:pre-line">${esc(k.teacher_note)}</div>
    <div class="small muted" style="margin-top:8px">${esc(k.note_teacher ? k.note_teacher + ' 선생님' : '')}${k.note_updated_at ? ' · ' + md(k.note_updated_at.slice(0, 10)) : ''}</div></section>` : ''}
  <section class="p-card"><div class="spread"><h2 style="font-size:16px">센터 소식</h2><button class="btn sm" data-tab="news">전체 보기</button></div>
    ${P.notices.length ? P.notices.slice(0, 3).map(n => `<div class="notice">${n.pinned ? '<span class="badge b-navy">고정</span> ' : ''}<b>${esc(n.title)}</b><div class="small muted">${md(n.created_at.slice(0, 10))}</div></div>`).join('') : '<div class="small muted" style="margin-top:8px">새 소식이 없어요.</div>'}</section>
  <section class="p-card"><h2 style="font-size:16px">셔틀 정보</h2>
    <div class="p-tile" style="margin-top:12px"><div class="l">노선</div><div class="v">${esc(k.shuttle_route || '이용 안 함')}</div></div>
    ${k.shuttle_route ? '<div class="small muted" style="margin-top:8px">탑승 장소·시간은 센터 안내를 확인해 주세요.</div>' : ''}</section>`;
}
function newsHtml() {
  return `<section class="p-card hero"><div class="spread"><h2 style="font-size:16px">센터 소식</h2><button class="btn sm" data-act="refresh">새로고침</button></div>
    ${P.notices.length ? P.notices.map(n => `<div class="notice">${n.pinned ? '<span class="badge b-navy">고정</span> ' : ''}<b>${esc(n.title)}</b><div class="small muted">${md(n.created_at.slice(0, 10))}</div>
    <div style="margin-top:8px;white-space:pre-line;line-height:1.7">${esc(n.body)}</div></div>`).join('') : '<div class="small muted">새 소식이 없어요.</div>'}</section>`;
}
function meHtml() {
  return `<section class="p-card hero col"><h2 style="font-size:16px">내 정보</h2>
    <div class="small">연결된 아이: ${P.kids.map(k => esc(k.name)).join(', ')}</div>
    <div class="p-tile small" style="line-height:1.7"><b>휴대폰 홈 화면에 추가하기</b><br>· 아이폰(사파리): 아래 공유 버튼 → '홈 화면에 추가'<br>· 안드로이드(크롬): 오른쪽 위 ⋮ → '홈 화면에 추가'</div>
    <div class="small muted" style="line-height:1.7">개인정보 열람·정정·동의 철회는 센터(${esc(CFG.CONTACT)})로 요청해 주세요.</div>
    <button class="btn block" data-act="logout">로그아웃</button></section>`;
}
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') showLogin(); });
boot();
