'use strict';
/* 학부모 공지 · 엑셀 가져오기 · 직원 권한 */

/* ---------- 공지 ---------- */
A.pages.notices = async (v) => {
  const list = await q(sb.from('notices').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100));
  const tgt = (n) => n.target === 'all' ? '전체' : n.target === 'class' ? esc((clsById(n.target_class_id) || {}).name || '반') + ' 반' : KIND[n.target] + ' 전체';
  v.innerHTML = `<header><h1>학부모 공지</h1><div class="muted small">게시한 공지는 대상 학부모의 앱 '센터 소식'에 바로 보여요.</div></header>
  <div class="wrap2">
    <section class="card side"><form id="nForm" class="col"><h2>공지 작성</h2>
      <label class="f">제목 *<input name="title" required maxlength="100"></label>
      <label class="f">받는 대상<select name="target"><option value="all">전체</option><option value="child">어린이 전체</option><option value="adult">성인 전체</option>${A.classes.filter(c => c.active).map(c => `<option value="c:${c.id}">${esc(c.name)} 반</option>`).join('')}</select></label>
      <label class="f">내용 *<textarea name="body" rows="8" required maxlength="5000"></textarea></label>
      <label class="row small"><input type="checkbox" name="pinned"> 학부모 앱 상단에 고정</label>
      <button class="btn pri block">게시하기</button></form></section>
    <section class="card tight main">${list.length ? list.map(n => `<div style="padding:16px 20px;border-bottom:1px solid var(--line2)" class="col">
      <div class="spread"><div>${n.pinned ? '<span class="badge b-navy">고정</span> ' : ''}<b>${esc(n.title)}</b> <span class="badge b-gray">${tgt(n)}</span>${n.published ? '' : ' <span class="badge b-amber">숨김</span>'}</div><span class="small muted">${dot(n.created_at.slice(0, 10))}</span></div>
      <div class="small" style="white-space:pre-line;color:var(--mid)">${esc(n.body)}</div>
      <div class="row"><button class="btn sm" data-pin="${n.id}" data-v="${n.pinned}">${n.pinned ? '고정 해제' : '상단 고정'}</button><button class="btn sm" data-pub="${n.id}" data-v="${n.published}">${n.published ? '숨기기' : '다시 게시'}</button><button class="btn sm" data-del="${n.id}">삭제</button></div></div>`).join('') : '<div class="empty">공지가 없어요.</div>'}</section>
  </div>`;
  v.onsubmit = async (e) => {
    e.preventDefault(); const f = formData(e.target);
    const row = { title: f.title, body: f.body, pinned: !!f.pinned, target: f.target.startsWith('c:') ? 'class' : f.target, target_class_id: f.target.startsWith('c:') ? f.target.slice(2) : null };
    try { await q(sb.from('notices').insert(row)); toast('게시했어요'); route(); } catch (err) { fail(err); }
  };
  v.onclick = async (e) => {
    const t = e.target.closest('[data-pin],[data-pub],[data-del]'); if (!t) return;
    try {
      if (t.dataset.pin) await q(sb.from('notices').update({ pinned: t.dataset.v !== 'true' }).eq('id', t.dataset.pin));
      if (t.dataset.pub) await q(sb.from('notices').update({ published: t.dataset.v !== 'true' }).eq('id', t.dataset.pub));
      if (t.dataset.del) { if (!confirm('공지를 삭제할까요?')) return; await q(sb.from('notices').delete().eq('id', t.dataset.del)); }
      route();
    } catch (err) { fail(err); }
  };
};

/* ---------- 엑셀 가져오기 (브라우저 안에서만 읽음) ---------- */
const IMPORT_FIELDS = {
  members: [['name', '이름 *', /이름|성명|회원명|원생/], ['birth', '생년월일', /생년|생일|출생/], ['gender', '성별', /성별/], ['school', '학교', /학교|학년|유치원/],
    ['guardian_phone1', '보호자 전화 1', /(엄마|모|보호자|부모|연락처|전화|핸드폰|HP|휴대)/i], ['guardian_phone2', '보호자 전화 2', /(아빠|부\b|부 |비상|연락처2|전화2)/i],
    ['shuttle_route', '셔틀 노선', /셔틀|차량|노선|버스/], ['class_name', '반 이름', /^반$|반명|클래스|수업/], ['address', '주소 (직원 전용)', /주소/], ['memo', '메모 (직원 전용)', /메모|비고|특이/],
    ['first_registered', '최초 등록일', /최초|등록일|입회|가입/], ['pass_end', '수강권 만료일', /만료|종료|마감/]],
  payments: [['name', '이름 *', /이름|성명|회원명/], ['birth', '생년월일 (동명이인 구분)', /생년|생일/], ['paid_at', '결제일 *', /결제일|날짜|일자/], ['amount', '금액 *', /금액|결제액|수강료/],
    ['method', '결제수단', /수단|결제방법|카드|구분/], ['months', '개월', /개월|기간/], ['type', '신규/재등록', /신규|재등록|등록구분/]]
};
A.imp = null;

A.pages.import = async (v) => {
  await loadMembers();
  v.innerHTML = `<header><h1>엑셀 가져오기</h1><div class="muted small">기존 엑셀(회원 명단, 탈회자, 결제 내역)을 옮겨 넣어요.</div></header>
  <div class="okbox row" style="align-items:flex-start;flex-wrap:nowrap">🛡️ <span>엑셀 파일은 이 컴퓨터의 브라우저 안에서만 읽어요. 파일 자체는 어디에도 올라가지 않고, 아래에서 확인한 내용만 데이터베이스에 저장됩니다.</span></div>
  <section class="card col">
    <div class="form-grid">
      <label class="f">가져올 종류<select id="iMode"><option value="members:child:재원">어린이 회원 명단</option><option value="members:adult:재원">성인 회원 명단</option><option value="members:child:탈회">어린이 탈회자</option><option value="members:adult:탈회">성인 탈회자</option><option value="payments">결제(매출) 내역</option></select></label>
      <label class="f">엑셀 파일 (.xlsx, .xls, .csv)<input type="file" id="iFile" accept=".xlsx,.xls,.csv"></label>
    </div>
    <div id="iBody"></div>
  </section>`;
  v.onchange = async (e) => {
    if (e.target.id === 'iFile' && e.target.files[0]) readExcel(e.target.files[0]);
    else if (e.target.id === 'iMode' && A.imp) renderImport();
    else if (e.target.id === 'iSheet') { A.imp.sheet = e.target.value; A.imp.headerRow = null; buildRows(); renderImport(); }
    else if (e.target.id === 'iHead') { A.imp.headerRow = +e.target.value; buildRows(); renderImport(); }
    else if (e.target.dataset.map) { A.imp.map[e.target.dataset.map] = e.target.value === '' ? null : +e.target.value; renderImport(true); }
  };
  v.onclick = (e) => { if (e.target.id === 'iGo') doImport(); };
};
function loadXlsx() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'; s.onload = ok; s.onerror = () => no(new Error('엑셀 읽기 도구를 불러오지 못했어요')); document.head.appendChild(s); });
}
async function readExcel(file) {
  const body = document.getElementById('iBody'); body.innerHTML = '<div class="loading">파일 읽는 중… (브라우저 안에서)</div>';
  try {
    await loadXlsx();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    A.imp = { file: file.name, wb, sheet: wb.SheetNames[0], headerRow: null, map: {} };
    buildRows(); renderImport();
  } catch (e) { fail(e); body.innerHTML = ''; }
}
function buildRows() {
  const I = A.imp, ws = I.wb.Sheets[I.sheet];
  I.grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).filter(r => r.some(c => String(c).trim() !== ''));
  if (I.headerRow === null) { // 이름/성명이 들어 있는 첫 줄을 제목 줄로
    I.headerRow = Math.max(0, I.grid.slice(0, 15).findIndex(r => r.some(c => /이름|성명|회원명/.test(String(c)))));
  }
  I.map = {};
}
function guessMap(fields) {
  const head = (A.imp.grid[A.imp.headerRow] || []).map(c => String(c).trim()); const used = new Set(), map = {};
  fields.forEach(([k, , re]) => { const i = head.findIndex((h, j) => !used.has(j) && h && re.test(h)); if (i >= 0) { map[k] = i; used.add(i); } });
  return map;
}
function renderImport(keepMap) {
  const I = A.imp, mode = document.getElementById('iMode').value, kind = mode.split(':')[0];
  const fields = IMPORT_FIELDS[kind];
  if (!keepMap || I.mode !== mode) { I.map = guessMap(fields); I.mode = mode; }
  const head = (I.grid[I.headerRow] || []).map(c => String(c).trim());
  const rows = I.grid.slice(I.headerRow + 1).map(r => convertRow(r, kind, mode));
  I.ready = rows;
  const ok = rows.filter(r => r.ok && !r.dup), bad = rows.filter(r => !r.ok), dup = rows.filter(r => r.ok && r.dup);
  document.getElementById('iBody').innerHTML = `<div class="col">
    <div class="form-grid"><label class="f">시트<select id="iSheet">${I.wb.SheetNames.map(s => `<option ${s === I.sheet ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      <label class="f">제목(머리글) 줄<select id="iHead">${I.grid.slice(0, 15).map((r, i) => `<option value="${i}" ${i === I.headerRow ? 'selected' : ''}>${i + 1}번째 줄: ${esc(r.slice(0, 4).join(' | ').slice(0, 40))}</option>`).join('')}</select></label></div>
    <h3>엑셀 열 → 프로그램 항목 연결</h3>
    <div class="form-grid">${fields.map(([k, label]) => `<label class="f">${label}<select data-map="${k}"><option value="">(없음)</option>${head.map((h, i) => `<option value="${i}" ${I.map[k] === i ? 'selected' : ''}>${esc(h || (i + 1) + '번째 열')}</option>`).join('')}</select></label>`).join('')}</div>
    <div class="row small"><span class="badge b-ok">저장 가능 ${ok.length}행</span><span class="badge b-amber">확인 필요 ${bad.length}행 (저장 안 함)</span><span class="badge b-gray">이미 있음 ${dup.length}행 (건너뜀)</span></div>
    <div class="tbl-wrap" style="max-height:380px;overflow:auto"><table class="tbl" style="min-width:640px"><thead><tr><th>#</th><th>상태</th>${fields.filter(f => I.map[f[0]] != null).map(f => `<th>${esc(f[1].replace(' *', ''))}</th>`).join('')}</tr></thead><tbody>
      ${rows.slice(0, 60).map((r, i) => `<tr><td class="muted">${i + 1}</td><td>${r.ok ? (r.dup ? '<span class="badge b-gray">이미 있음</span>' : '<span class="badge b-ok">OK</span>') : `<span class="badge b-amber">${esc(r.err)}</span>`}</td>${fields.filter(f => I.map[f[0]] != null).map(f => `<td>${esc(r.v[f[0]] ?? '')}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>${rows.length > 60 ? `<div class="small muted">앞 60행만 미리 보여 줘요 (전체 ${rows.length}행)</div>` : ''}
    <button class="btn dark block" id="iGo" ${ok.length ? '' : 'disabled'}>확인 후 ${ok.length}건 저장</button></div>`;
}
function pick(r, k) { const i = A.imp.map[k]; return i == null ? '' : r[i]; }
function parseDate(v) {
  if (v === '' || v == null) return null;
  const mk = (y, m, d) => { y = +y; m = +m; d = +d; if (y < 100) y += y > 40 ? 1900 : 2000; const dt = new Date(y, m - 1, d); return dt.getMonth() === m - 1 && y > 1900 && y < 2100 ? ymd(dt) : 'X'; };
  if (typeof v === 'number') {
    if (v > 19000000 && v < 21000000) v = String(v);
    else if (v > 1000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); return d.getUTCFullYear() + '-' + z2(d.getUTCMonth() + 1) + '-' + z2(d.getUTCDate()); }
    else v = String(v);
  }
  const s = String(v).trim().replace(/\s/g, '');
  let m = s.match(/^(\d{2}|\d{4})[.\-\/년](\d{1,2})[.\-\/월](\d{1,2})/); if (m) return mk(m[1], m[2], m[3]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/); if (m) return mk(m[1], m[2], m[3]);
  m = s.match(/^(\d{2})(\d{2})(\d{2})$/); if (m) return mk(m[1], m[2], m[3]);
  return 'X';
}
function phone(v) {
  let s = String(v ?? '').replace(/[^0-9]/g, ''); if (!s) return null;
  if (s.length === 10 && s.startsWith('10')) s = '0' + s;
  if (s.length === 11) return s.slice(0, 3) + '-' + s.slice(3, 7) + '-' + s.slice(7);
  if (s.length === 10) return s.slice(0, 3) + '-' + s.slice(3, 6) + '-' + s.slice(6);
  return String(v).trim();
}
function convertRow(r, kind, mode) {
  const v = {}; let err = null;
  const name = String(pick(r, 'name')).trim();
  if (!name) return { ok: false, err: '이름 없음', v: {} };
  v.name = name.slice(0, 40);
  const date = (k, label) => { const d = parseDate(pick(r, k)); if (d === 'X') { err = err || label + ' 형식'; return null; } return d; };
  if (kind === 'members') {
    const [, k, st] = mode.split(':'); v.kind = k; v.status = st;
    v.birth = date('birth', '생년월일'); v.first_registered = date('first_registered', '등록일'); v.pass_end = date('pass_end', '만료일');
    const g = String(pick(r, 'gender')).trim(); v.gender = /^(남|남자|M|m|male)$/.test(g) ? '남' : /^(여|여자|F|f|female)$/.test(g) ? '여' : null;
    v.school = String(pick(r, 'school')).trim() || null; v.guardian_phone1 = phone(pick(r, 'guardian_phone1')); v.guardian_phone2 = phone(pick(r, 'guardian_phone2'));
    v.shuttle_route = String(pick(r, 'shuttle_route')).trim() || null; v.class_name = String(pick(r, 'class_name')).trim() || null;
    v.address = String(pick(r, 'address')).trim() || null; v.memo = String(pick(r, 'memo')).trim() || null;
    if (v.class_name && !A.classes.find(c => c.name === v.class_name)) v.memo = [v.memo, '엑셀 반: ' + v.class_name].filter(Boolean).join(' / ');
    const dup = A.members.some(m => m.name === v.name && (m.birth || null) === (v.birth || null) && m.kind === k);
    return { ok: !err, err, v, dup };
  }
  v.birth = date('birth', '생년월일'); v.paid_at = date('paid_at', '결제일');
  if (!v.paid_at && !err) err = '결제일 없음';
  v.amount = parseInt(String(pick(r, 'amount')).replace(/[^0-9\-]/g, ''), 10); if (!(v.amount >= 0)) err = err || '금액';
  const meth = String(pick(r, 'method')); v.method = METHODS.find(m => meth.includes(m)) || (/카|신용|체크/.test(meth) ? '카드' : /이체|계좌|통장/.test(meth) ? '계좌이체' : /현/.test(meth) ? '현금' : /제로/.test(meth) ? '제로페이' : /바우/.test(meth) ? '바우처' : '카드');
  v.months = Math.min(24, Math.max(1, parseInt(String(pick(r, 'months')).replace(/[^0-9]/g, ''), 10) || 1));
  v.type = /신규/.test(String(pick(r, 'type'))) ? '신규' : '재등록';
  const cands = A.members.filter(m => m.name === v.name && (!v.birth || m.birth === v.birth));
  if (!err && cands.length === 0) err = '회원 없음 (먼저 명단을 가져오세요)';
  if (!err && cands.length > 1) err = '동명이인 — 생년월일 열 필요';
  v.member_id = cands.length === 1 ? cands[0].id : null;
  return { ok: !err, err, v, dup: false };
}
async function doImport() {
  const I = A.imp, kind = I.mode.split(':')[0];
  const rows = I.ready.filter(r => r.ok && !r.dup).map(r => r.v);
  if (!rows.length || !confirm(`${rows.length}건을 저장할까요?`)) return;
  const btn = document.getElementById('iGo'); btn.disabled = true;
  try {
    let done = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      if (kind === 'members') done += await q(sb.rpc('admin_import_members', { p_rows: chunk }));
      else { await q(sb.from('payments').insert(chunk.map(v => ({ member_id: v.member_id, type: v.type, months: v.months, amount: v.amount, method: v.method, paid_at: v.paid_at, memo: '엑셀 가져오기' })))); done += chunk.length; }
      btn.textContent = `저장 중… ${done}/${rows.length}`;
    }
    toast(`${done}건 저장했어요`); await loadMembers(); I.ready = []; renderImport(true);
  } catch (e) { fail(e); btn.disabled = false; }
}

/* ---------- 직원 권한 ---------- */
A.pages.staff = async (v) => {
  A.staff = await q(sb.from('staff').select('*').order('name'));
  v.innerHTML = `<header><h1>직원 권한</h1><div class="muted small">강사는 담당 반의 명단(보호자 전화 포함)·출석·진도만 볼 수 있어요. 주소·메모·결제는 관리자만 봅니다.</div></header>
  <div class="wrap2">
    <section class="card tight main">${A.staff.length ? `<div class="tbl-wrap"><table class="tbl" style="min-width:560px"><thead><tr><th>이름</th><th>이메일</th><th>역할</th><th>담당 반</th><th>상태</th><th></th></tr></thead><tbody>
      ${A.staff.map(s => `<tr><td class="bold">${esc(s.name)}</td><td class="small">${esc(s.email || '')}</td><td><span class="badge ${s.role === 'admin' ? 'b-navy' : 'b-kid'}">${s.role === 'admin' ? '관리자' : '강사'}</span></td>
      <td class="small">${esc(A.classes.filter(c => c.teacher_id === s.user_id).map(c => c.name).join(', ') || '—')}</td><td>${s.active ? '<span class="badge b-ok">사용 중</span>' : '<span class="badge b-gray">중지</span>'}</td>
      <td><button class="btn sm" data-edit="${s.user_id}">수정</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">직원이 없어요.</div>'}</section>
    <section class="card side"><form id="stForm" class="col"><h2>직원 등록·변경</h2>
      <div class="info small">① 직원이 관리자 주소(이 화면)에서 '처음이에요 (가입)'으로 가입 → ② 여기서 그 이메일로 등록 → ③ 반·시간표에서 반 수정으로 강사 배정</div>
      <label class="f">가입한 이메일 *<input name="email" type="email" required></label>
      <label class="f">이름 *<input name="name" required maxlength="30"></label>
      <label class="f">역할<select name="role"><option value="teacher">강사</option><option value="admin">관리자</option></select></label>
      <label class="row small"><input type="checkbox" name="active" checked> 사용 (끄면 로그인해도 아무것도 볼 수 없음)</label>
      <button class="btn pri block">저장</button></form></section>
  </div>`;
  v.onclick = (e) => {
    const t = e.target.closest('[data-edit]'); if (!t) return;
    const s = A.staff.find(x => x.user_id === t.dataset.edit), f = document.getElementById('stForm');
    f.email.value = s.email || ''; f.name.value = s.name; f.role.value = s.role; f.active.checked = s.active; f.name.focus();
  };
  v.onsubmit = async (e) => {
    e.preventDefault(); const f = formData(e.target);
    try { await q(sb.rpc('admin_set_staff', { p_email: f.email, p_name: f.name, p_role: f.role, p_active: !!f.active })); toast('저장했어요'); route(); } catch (err) { fail(err); }
  };
};
