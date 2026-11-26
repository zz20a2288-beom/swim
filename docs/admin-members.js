'use strict';
/* 회원 관리 */
A.mf = { q: '', kind: '', status: '재원', cls: '', route: '', teacher: '', expiring: false };
A.sel = null;

A.pages.members = async (v) => {
  await loadMembers();
  const intent = A.memberIntent; A.memberIntent = null;
  if (intent && intent.open) A.sel = intent.open;
  if (intent && intent.expiring) Object.assign(A.mf, { status: '재원', expiring: true });
  v.innerHTML = `
  <header class="spread"><div><h1>회원 관리</h1><div class="muted small" id="mSummary"></div></div>
    ${isAdmin() ? '<div class="row"><button class="btn" data-act="csv">엑셀(CSV)로 내보내기</button><button class="btn pri" data-act="new">+ 원생 등록</button></div>' : ''}</header>
  <div class="card row" style="padding:12px">
    <input class="inp" style="flex:1 1 220px" type="search" id="mq" placeholder="이름, 보호자 전화, 학교로 검색" aria-label="회원 검색" value="${esc(A.mf.q)}">
    <select class="inp" style="width:auto" id="mstatus" aria-label="상태">${['재원', '휴회', '탈회', ''].map(s => `<option value="${s}" ${A.mf.status === s ? 'selected' : ''}>${s || '상태 전체'}</option>`).join('')}</select>
    <select class="inp" style="width:auto" id="mcls" aria-label="반"><option value="">반 전체</option><option value="none" ${A.mf.cls === 'none' ? 'selected' : ''}>반 없음</option>${A.classes.map(c => `<option value="${c.id}" ${A.mf.cls === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
    <select class="inp" style="width:auto" id="mteacher" aria-label="담당 선생님"><option value="">담당 선생님 전체</option>${A.staff.filter(s => s.active).map(s => `<option value="${s.user_id}" ${A.mf.teacher === s.user_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="none" ${A.mf.teacher === 'none' ? 'selected' : ''}>담당 없음</option></select>
    <select class="inp" style="width:auto" id="mroute" aria-label="셔틀 노선"><option value="">셔틀 전체</option>${routes().map(r => `<option ${A.mf.route === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
    <label class="row small"><input type="checkbox" id="mexp" ${A.mf.expiring ? 'checked' : ''}> 만료 7일 이내</label>
  </div>
  <div class="wrap2"><section class="card tight main" id="mList"></section><aside class="card side" id="mDetail" aria-label="회원 상세"></aside></div>`;
  renderMemberList(); renderDetail(intent && intent.create ? 'new' : A.sel);

  v.oninput = (e) => { if (e.target.id === 'mq') { A.mf.q = e.target.value; renderMemberList(); } };
  v.onchange = (e) => {
    const id = e.target.id;
    if (id === 'mstatus') A.mf.status = e.target.value; else if (id === 'mcls') A.mf.cls = e.target.value;
    else if (id === 'mroute') A.mf.route = e.target.value; else if (id === 'mteacher') A.mf.teacher = e.target.value; else if (id === 'mexp') A.mf.expiring = e.target.checked; else return;
    renderMemberList();
  };
  v.onclick = async (e) => {
    const t = e.target.closest('[data-kind],[data-row],[data-act]'); if (!t) return;
    if (t.dataset.kind !== undefined) { A.mf.kind = t.dataset.kind; v.querySelectorAll('[data-kind]').forEach(b => b.classList.toggle('on', b === t)); renderMemberList(); }
    else if (t.dataset.row) { A.sel = t.dataset.row; renderMemberList(); renderDetail(A.sel); }
    else memberAction(t.dataset.act, t);
  };
  v.onsubmit = (e) => { e.preventDefault(); if (e.target.id === 'mForm') saveMember(e.target); if (e.target.id === 'sForm') saveStatus(e.target); };
};

function routes() { return [...new Set(A.members.map(m => m.shuttle_route).filter(Boolean))].sort(); }
function filtered() {
  const f = A.mf, qq = f.q.replace(/[-\s]/g, '').toLowerCase(), today = todayStr(), wk = addDays(today, 7);
  return A.members.filter(m =>
    (!f.kind || m.kind === f.kind) && (!f.status || m.status === f.status) &&
    (!f.cls || (f.cls === 'none' ? !A.enr.some(e => e.member_id === m.id) : A.enr.some(e => e.member_id === m.id && e.class_id === f.cls))) &&
    (!f.teacher || (f.teacher === 'none' ? !enrolledClasses(m.id).some(c => c.teacher_id) : enrolledClasses(m.id).some(c => c.teacher_id === f.teacher))) && (!f.route || m.shuttle_route === f.route) &&
    (!f.expiring || (m.pass_end && m.pass_end >= today && m.pass_end <= wk)) &&
    (!qq || [m.name, m.school, m.guardian_phone1, m.guardian_phone2].some(x => (x || '').replace(/[-\s]/g, '').toLowerCase().includes(qq))));
}
const statusBadge = (s) => `<span class="badge ${s === '재원' ? 'b-ok' : s === '휴회' ? 'b-amber' : 'b-gray'}">${esc(s)}</span>`;
const kindBadge = (k) => `<span class="badge ${k === 'child' ? 'b-kid' : 'b-adult'}">${KIND[k]}</span>`;

function renderMemberList() {
  const rows = filtered(), live = A.members.filter(m => m.status !== '탈회');
  document.getElementById('mSummary').textContent = `재원 ${A.members.filter(m => m.status === '재원').length} · 휴회 ${live.filter(m => m.status === '휴회').length} · 탈회 ${A.members.length - live.length}`;
  const today = todayStr(), show = rows.slice(0, 300);
  document.getElementById('mList').innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl" style="min-width:720px">
    <thead><tr><th>이름</th><th>생년월일</th><th>반</th><th>담당</th><th>보호자 전화</th><th>셔틀</th><th>수강권 만료</th><th>상태</th></tr></thead><tbody>
    ${show.map(m => { const left = m.pass_end ? daysBetween(today, m.pass_end) : null;
      return `<tr class="click ${A.sel === m.id ? 'sel' : ''}" data-row="${m.id}"><td><b>${esc(m.name)}</b></td><td>${dot(m.birth)}</td>
      <td>${esc(clsNames(m.id) || '—')}</td><td>${esc(teacherNames(m.id) || '—')}</td><td>${esc(m.guardian_phone1 || '—')}</td><td>${esc(m.shuttle_route || '—')}</td>
      <td>${m.pass_end ? dot(m.pass_end) + (left !== null && left >= 0 && left <= 7 ? ` <span class="badge b-warn">D-${left}</span>` : left < 0 ? ' <span class="badge b-gray">만료</span>' : '') : '—'}</td>
      <td>${statusBadge(m.status)}</td></tr>`; }).join('')}
    </tbody></table></div><div class="small muted" style="padding:10px 14px">${rows.length}명${rows.length > 300 ? ' 중 300명 표시 — 검색으로 좁혀 주세요' : ''}</div>`
    : '<div class="empty">조건에 맞는 원생이 없어요.</div>';
}

async function renderDetail(id) {
  const box = document.getElementById('mDetail');
  if (!id) { box.innerHTML = '<div class="empty">왼쪽에서 회원을 고르거나<br>+ 회원 등록을 눌러 주세요.</div>'; return; }
  if (id === 'new') { box.innerHTML = memberForm({ kind: 'child', status: '재원', first_registered: todayStr() }, {}); return; }
  const m = A.members.find(x => x.id === id); if (!m) { box.innerHTML = '<div class="empty">회원을 찾을 수 없어요.</div>'; return; }
  box.innerHTML = '<div class="loading">불러오는 중…</div>';
  const adm = isAdmin();
  const [priv, g, inv, logs] = !adm ? [null, [], [], []] : await Promise.all([
    q(sb.from('member_private').select('*').eq('member_id', id).maybeSingle()),
    q(sb.from('guardians').select('consent_at').eq('member_id', id)),
    q(sb.from('invites').select('code,expires_at').eq('member_id', id).is('used_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1)),
    q(sb.from('member_status_log').select('*').eq('member_id', id).order('created_at', { ascending: false }).limit(5))
  ]);
  A.detail = { m, priv: priv || {} };
  const cls = enrolledClasses(m.id);
  box.innerHTML = `<div class="col" style="gap:16px">
    <div class="spread"><div><div style="font-size:21px;font-weight:700">${esc(m.name)} ${statusBadge(m.status)}</div>
      <div class="small muted">${m.gender ? esc(m.gender) + ' · ' : ''}${dot(m.birth)}</div></div>
      ${adm ? '<button class="btn sm" data-act="edit">수정</button>' : ''}</div>
    <dl style="margin:0;display:grid;grid-template-columns:100px 1fr;gap:9px 12px;font-size:14px">
      ${m.kind === 'child' ? `<dt class="muted">학교</dt><dd style="margin:0">${esc(m.school || '—')}</dd>` : ''}
      <dt class="muted">수강 반 ${cls.length}</dt><dd style="margin:0">${cls.length ? cls.map(c => `<div><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${tColor(c.teacher_id)};margin-right:6px"></span>${esc(clsLabel(c))} · ${esc(staffName(c.teacher_id))}</div>`).join('') : '—'}</dd>
      <dt class="muted">${m.kind === 'child' ? '보호자 전화 1' : '전화'}</dt><dd style="margin:0">${esc(m.guardian_phone1 || '—')}</dd>
      ${m.kind === 'child' ? `<dt class="muted">보호자 전화 2</dt><dd style="margin:0">${esc(m.guardian_phone2 || '—')}</dd>
      <dt class="muted">셔틀 노선</dt><dd style="margin:0">${esc(m.shuttle_route || '미이용')}</dd>` : ''}
      <dt class="muted">최초 등록일</dt><dd style="margin:0">${dot(m.first_registered)}</dd>
      <dt class="muted">수강권</dt><dd style="margin:0">${m.pass_end ? dot(m.pass_end) + ' 까지' : '없음'}</dd>
    </dl>
    ${!adm ? '<div class="small muted">주소·메모·결제·초대코드는 관리자만 볼 수 있어요.</div>' : `<div class="note-box col" style="gap:6px"><div class="small bold" style="color:var(--amber)">🔒 직원 전용 · 학부모에게 보이지 않음</div>
      <div class="small"><span class="muted">주소</span>&nbsp; ${esc((priv && priv.address) || '—')}</div>
      <div class="small" style="white-space:pre-line"><span class="muted">메모</span>&nbsp; ${esc((priv && priv.memo) || '—')}</div></div>`}
    ${adm && m.kind === 'child' ? `<div class="info spread"><div><div class="small">학부모 앱 연결 ${g.length ? `<b>${g.length}명 연결됨</b>` : '<b>미연결</b>'}</div>
      ${inv.length ? `<div style="font-size:20px;font-weight:700;letter-spacing:3px">${esc(inv[0].code)}</div><div class="small">${md(inv[0].expires_at.slice(0, 10))}까지 사용 가능 · 1회용</div>` : '<div class="small">초대코드를 만들어 보호자에게 전달하세요</div>'}</div>
      <button class="btn sm" data-act="invite">${inv.length ? '새 코드' : '초대코드 만들기'}</button></div>` : ''}
    ${adm ? '<div class="row"><button class="btn" style="flex:1" data-act="status">휴회·탈회·복귀 처리</button><a class="btn" style="flex:1" href="#payments" data-act="pay">결제 등록</a></div>' : ''}
    <div id="statusBox"></div>
    ${logs.length ? `<div class="small muted">${logs.map(l => `${dot(l.effective_date)} ${esc(l.status)}${l.reason ? ' (' + esc(l.reason) + ')' : ''}${l.refund_amount ? ' 환불 ' + won(l.refund_amount) : ''}`).join('<br>')}</div>` : ''}
  </div>`;
}

function memberForm(m, p) {
  const opt = (v, cur) => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`;
  return `<form id="mForm" class="col" autocomplete="off"><h2>${m.id ? '원생 정보 수정' : '새 원생 등록'}</h2>
    <input type="hidden" name="id" value="${esc(m.id || '')}">
    <div class="form-grid">
      <input type="hidden" name="kind" value="child">
      <label class="f">이름 *<input name="name" required maxlength="40" value="${esc(m.name || '')}"></label>
      <label class="f">생년월일<input name="birth" type="date" value="${esc(m.birth || '')}"></label>
      <label class="f">성별<select name="gender"><option value="">—</option>${opt('남', m.gender)}${opt('여', m.gender)}</select></label>
      <label class="f">학교<input name="school" value="${esc(m.school || '')}"></label>
      <label class="f">보호자 전화 1<input name="guardian_phone1" inputmode="tel" value="${esc(m.guardian_phone1 || '')}"></label>
      <label class="f">보호자 전화 2<input name="guardian_phone2" inputmode="tel" value="${esc(m.guardian_phone2 || '')}"></label>
      <label class="f">셔틀 노선<input name="shuttle_route" list="routeList" value="${esc(m.shuttle_route || '')}"><datalist id="routeList">${['신곡', '금오', '장암', '의정부1동', '호원', '용현', ...routes()].filter((x, i, a) => a.indexOf(x) === i).map(r => `<option value="${esc(r)}">`).join('')}</datalist></label>
      <label class="f">최초 등록일<input name="first_registered" type="date" value="${esc(m.first_registered || '')}"></label>
      <label class="f">수강권 만료일<input name="pass_end" type="date" value="${esc(m.pass_end || '')}"></label>
    </div>
    <fieldset style="border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:0"><legend class="small" style="color:var(--mid);padding:0 4px">수강 반 (여러 개 선택 가능 — 요일·시간·선생님이 다르면 각각 체크)</legend>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:6px;max-height:220px;overflow:auto">${A.classes.filter(c => c.active).sort((a, b) => (a.days[0] - b.days[0]) || String(a.start_time).localeCompare(String(b.start_time))).map(c => `<label class="row small" style="gap:6px;flex-wrap:nowrap;padding:4px 6px;border-radius:6px;background:${tColor(c.teacher_id)}33"><input type="checkbox" name="cls_${c.id}" ${(m.id ? A.enr.some(e => e.member_id === m.id && e.class_id === c.id) : false) ? 'checked' : ''}>${esc(clsLabel(c))} · ${esc(staffName(c.teacher_id))}</label>`).join('')}</div></fieldset>
    <div class="note-box col"><div class="small bold" style="color:var(--amber)">🔒 직원 전용 (학부모 비공개)</div>
      <label class="f">주소<input name="address" value="${esc(p.address || '')}"></label>
      <label class="f">메모<textarea name="memo" rows="3">${esc(p.memo || '')}</textarea></label></div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="cancel">취소</button><button class="btn pri" type="submit">저장</button></div>
  </form>`;
}

async function memberAction(act, t) {
  const box = document.getElementById('mDetail');
  try {
    if (act === 'new') { A.sel = null; renderMemberList(); box.innerHTML = memberForm({ kind: 'child', status: '재원', first_registered: todayStr() }, {}); box.scrollIntoView({ behavior: 'smooth' }); }
    else if (act === 'edit') box.innerHTML = memberForm(A.detail.m, A.detail.priv);
    else if (act === 'cancel') renderDetail(A.sel);
    else if (act === 'invite') { const code = await q(sb.rpc('admin_create_invite', { p_member: A.sel })); toast('초대코드: ' + code); renderDetail(A.sel); }
    else if (act === 'pay') A.payIntent = A.sel;
    else if (act === 'status') {
      const m = A.detail.m;
      document.getElementById('statusBox').innerHTML = `<form id="sForm" class="col" style="border:1px solid var(--line);border-radius:10px;padding:14px">
        <div class="seg" role="group">${['휴회', '탈회', '재원'].filter(s => s !== m.status).map((s, i) => `<button type="button" data-st="${s}" class="${i === 0 ? 'on' : ''}">${s === '재원' ? '복귀(재원)' : s}</button>`).join('')}</div>
        <input type="hidden" name="status" value="${['휴회', '탈회', '재원'].filter(s => s !== m.status)[0]}">
        <label class="f">사유<input name="reason" list="reasonList" placeholder="예: 이사, 시간 변경"><datalist id="reasonList"><option value="이사"><option value="시간 변경 어려움"><option value="타 기관 이동"><option value="건강·개인 사정"></datalist></label>
        <div class="form-grid"><label class="f">적용일<input name="date" type="date" value="${todayStr()}" required></label><label class="f">환불액 (원)<input name="refund" inputmode="numeric" value="0"></label></div>
        <div class="small muted">탈회하면 학부모 앱 연결도 자동으로 끊겨요.</div>
        <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="cancel">취소</button><button class="btn dark" type="submit">저장</button></div></form>`;
      const f = document.getElementById('sForm');
      f.querySelectorAll('[data-st]').forEach(b => b.onclick = (ev) => { ev.stopPropagation(); f.querySelectorAll('[data-st]').forEach(x => x.classList.toggle('on', x === b)); f.status.value = b.dataset.st; });
    }
    else if (act === 'csv') exportCsv(filtered());
  } catch (e) { fail(e); }
}

async function saveMember(form) {
  const f = formData(form);
  if (!f.name) return toast('이름을 입력해 주세요.', true);
  const row = { kind: f.kind, name: f.name, birth: f.birth || null, gender: f.gender || null, school: f.school || null,
    guardian_phone1: f.guardian_phone1 || null, guardian_phone2: f.guardian_phone2 || null,
    shuttle_route: f.shuttle_route || null, pass_end: f.pass_end || null };
  if (f.first_registered) row.first_registered = f.first_registered;
  const clsIds = Object.keys(f).filter(k => k.startsWith('cls_')).map(k => k.slice(4));
  row.class_id = clsIds[0] || null; // 대표 반 (결제·담당 기준)
  try {
    let id = f.id;
    if (id) await q(sb.from('members').update(row).eq('id', id));
    else id = (await q(sb.from('members').insert(row).select('id').single())).id;
    await q(sb.from('member_private').upsert({ member_id: id, address: f.address || null, memo: f.memo || null }));
    const had = A.enr.filter(e => e.member_id === id).map(e => e.class_id);
    const drop = had.filter(c => !clsIds.includes(c)), add = clsIds.filter(c => !had.includes(c));
    if (drop.length) await q(sb.from('enrollments').delete().eq('member_id', id).in('class_id', drop));
    if (add.length) await q(sb.from('enrollments').insert(add.map(c => ({ member_id: id, class_id: c }))));
    toast('저장했어요'); await loadMembers(); A.sel = id; renderMemberList(); renderDetail(id);
  } catch (e) { fail(e); }
}
async function saveStatus(form) {
  const f = formData(form);
  const refund = parseInt(String(f.refund).replace(/[^0-9]/g, '') || '0', 10);
  if (f.status === '탈회' && !confirm('탈회 처리할까요? 학부모 앱 연결이 해제됩니다.')) return;
  try {
    await q(sb.rpc('admin_change_status', { p_member: A.sel, p_status: f.status, p_reason: f.reason || null, p_refund: refund, p_date: f.date }));
    toast(f.status + ' 처리했어요'); await loadMembers(); renderMemberList(); renderDetail(A.sel);
  } catch (e) { fail(e); }
}
function exportCsv(rows) {
  const head = ['이름', '생년월일', '성별', '학교', '반', '보호자전화1', '보호자전화2', '셔틀', '최초등록일', '수강권만료', '상태'];
  const cell = (x) => { let s = String(x ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const lines = [head.map(cell).join(',')].concat(rows.map(m => [m.name, m.birth, m.gender, m.school, clsNames(m.id), m.guardian_phone1, m.guardian_phone2, m.shuttle_route, m.first_registered, m.pass_end, m.status].map(cell).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `회원명단_${todayStr()}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
