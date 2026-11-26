'use strict';
/* 반·시간표 · 출석 · 진도 */
A.cs = { sel: null, date: null, teacher: null };

A.pages.classes = async (v) => {
  await loadMembers();
  A.classes = await q(sb.from('classes').select('*').order('start_time'));
  if (!A.myId) A.myId = (await sb.auth.getUser()).data.user.id;
  if (A.cs.teacher === null) A.cs.teacher = isAdmin() ? '' : A.myId;
  const list = A.classes.filter(c => c.active && (!A.cs.teacher || (A.cs.teacher === 'none' ? !c.teacher_id : c.teacher_id === A.cs.teacher)));
  if (!A.cs.date) A.cs.date = todayStr();
  if (!A.cs.sel || !list.find(c => c.id === A.cs.sel)) {
    const td = dow(todayStr());
    A.cs.sel = (list.find(c => c.days.includes(td)) || list[0] || {}).id || null;
  }
  const times = [...new Set(list.map(c => hm(c.start_time)))].sort();
  const td = dow(todayStr());
  const useSun = list.some(c => c.days.includes(6));
  const cols = useSun ? 7 : 6;
  v.innerHTML = `
  <header class="spread"><div><h1>반·시간표</h1><div class="muted small">반을 누르면 명단·출석·진도가 열려요. 시간표는 매달 복사할 필요 없이 그대로 이어져요.</div></div>
    <div class="row"><select class="inp" style="width:auto" id="tfilter" aria-label="담당 선생님"><option value="">모든 선생님</option>${A.staff.filter(s => s.active).map(s => `<option value="${s.user_id}" ${A.cs.teacher === s.user_id ? 'selected' : ''}>${esc(s.name)}${s.user_id === A.myId ? ' (나)' : ''}</option>`).join('')}<option value="none" ${A.cs.teacher === 'none' ? 'selected' : ''}>담당 없음</option></select>
    ${isAdmin() ? '<button class="btn pri" data-act="newcls">+ 반 추가</button>' : ''}</div></header>
  <div class="row small" style="gap:16px"><span class="row" style="gap:6px"><span class="cls lv-초급" style="width:14px;height:14px;padding:0"></span>초급</span><span class="row" style="gap:6px"><span class="cls lv-중급" style="width:14px;height:14px;padding:0"></span>중급</span><span class="row" style="gap:6px"><span class="cls lv-상급" style="width:14px;height:14px;padding:0"></span>상급</span><span class="muted">· 숫자는 재원 인원/정원</span></div>
  <div class="wrap2">
    <section class="card tight main"><div class="tbl-wrap">${list.length ? `<div class="tt">
      <div class="tr" style="grid-template-columns:64px repeat(${cols},minmax(0,1fr))"><div class="th"></div>${DAYS.slice(0, cols).map((d, i) => `<div class="th ${i === td ? 'today' : ''}">${d}${i === td ? ' (오늘)' : ''}</div>`).join('')}</div>
      ${times.map(t => `<div class="tr" style="grid-template-columns:64px repeat(${cols},minmax(0,1fr))"><div class="tm">${t}</div>${[...Array(cols).keys()].map(d => `<div class="cell">${list.filter(c => hm(c.start_time) === t && c.days.includes(d)).map(c => {
        const n = A.members.filter(m => m.class_id === c.id && m.status === '재원').length;
        return `<button type="button" class="cls lv-${c.level} ${A.cs.sel === c.id ? 'on' : ''}" data-cls="${c.id}"><b>${esc(c.name)}</b><span style="opacity:.85">${esc(staffName(c.teacher_id))} · ${n}/${c.capacity}</span></button>`; }).join('')}</div>`).join('')}</div>`).join('')}
    </div>` : `<div class="empty">${isAdmin() ? '반이 없어요. + 반 추가를 눌러 주세요.' : '이 선생님이 맡은 반이 없어요. 위에서 다른 선생님을 골라 보세요.'}</div>`}</div></section>
    <aside class="card side" id="roster" aria-label="반 명단"></aside>
  </div>`;
  renderRoster();
  v.onclick = (e) => {
    const t = e.target.closest('[data-cls],[data-act],[data-att],[data-step]'); if (!t) return;
    if (t.dataset.cls) { A.cs.sel = t.dataset.cls; v.querySelectorAll('[data-cls]').forEach(b => b.classList.toggle('on', b === t)); renderRoster(); }
    else if (t.dataset.att) { const r = A.cs.rows[t.dataset.i]; r.att = r.att === t.dataset.att ? null : t.dataset.att; paintRow(t.dataset.i); }
    else if (t.dataset.step !== undefined) { const r = A.cs.rows[t.dataset.i]; r.step = +t.dataset.step; paintRow(t.dataset.i); }
    else classAction(t.dataset.act);
  };
  v.onchange = (e) => {
    if (e.target.id === 'rdate') { A.cs.date = e.target.value; renderRoster(); }
    if (e.target.id === 'tfilter') { A.cs.teacher = e.target.value; A.cs.sel = null; route(); }
    if (e.target.dataset.note !== undefined) A.cs.rows[e.target.dataset.note].note = e.target.value.trim();
  };
  v.onsubmit = (e) => { e.preventDefault(); if (e.target.id === 'cForm') saveClass(e.target); };
};

async function renderRoster() {
  const box = document.getElementById('roster');
  const c = clsById(A.cs.sel);
  if (!c) { box.innerHTML = '<div class="empty">반을 골라 주세요.</div>'; return; }
  box.innerHTML = '<div class="loading">불러오는 중…</div>';
  const kids = A.members.filter(m => m.class_id === c.id && m.status !== '탈회').sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const ids = kids.map(k => k.id);
  const [att, prog] = ids.length ? await Promise.all([
    q(sb.from('attendance').select('member_id,status').eq('class_id', c.id).eq('date', A.cs.date)),
    q(sb.from('progress').select('*').in('member_id', ids))
  ]) : [[], []];
  A.cs.rows = kids.map(k => { const p = prog.find(x => x.member_id === k.id) || {};
    return { id: k.id, name: k.name, status: k.status, birth: k.birth, kind: k.kind, att: (att.find(a => a.member_id === k.id) || {}).status || null,
      step: p.step || 0, note: p.teacher_note || '', note0: p.teacher_note || '', step0: p.step || 0 }; });
  const meets = c.days.includes(dow(A.cs.date));
  box.innerHTML = `<div class="col" style="gap:12px">
    <div class="spread"><div><div style="font-size:19px;font-weight:700">${esc(c.name)} <span class="badge ${c.kind === 'child' ? 'b-kid' : 'b-adult'}">${KIND[c.kind]}</span></div>
      <div class="small muted">${esc(staffName(c.teacher_id))} 강사 · ${daysText(c.days)} ${hm(c.start_time)} · ${kids.filter(k => k.status === '재원').length}/${c.capacity}명</div></div>
      ${isAdmin() ? '<button class="btn sm" data-act="editcls">반 수정</button>' : ''}</div>
    <label class="f" style="max-width:200px">출석 날짜<input type="date" id="rdate" value="${A.cs.date}"></label>
    ${meets ? '' : `<div class="small" style="color:var(--amber)">이 날짜(${DAYS[dow(A.cs.date)]})는 정규 수업 요일이 아니에요. 보강 기록에만 쓰세요.</div>`}
    <div class="small muted" id="tally"></div>
    ${c.kind === 'child' ? `<div class="small muted" style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;text-align:center;margin-left:auto;width:min(100%,330px)">${STEPS.map(s => `<span>${s}</span>`).join('')}</div>` : ''}
    ${A.cs.rows.length ? A.cs.rows.map((r, i) => `<div class="kid-row" id="kr${i}"></div>`).join('') : '<div class="empty">이 반에 회원이 없어요.</div>'}
    ${A.cs.rows.length ? '<button class="btn dark block" data-act="saveatt">출석·진도 저장</button>' : ''}
  </div>`;
  A.cs.rows.forEach((r, i) => paintRow(i));
}
function paintRow(i) {
  const r = A.cs.rows[i], el = document.getElementById('kr' + i); if (!el) return;
  const c = clsById(A.cs.sel);
  const age = r.birth ? (new Date().getFullYear() - +r.birth.slice(0, 4)) + 1 + '세' : '';
  el.innerHTML = `<div class="row" style="flex-wrap:wrap"><div style="flex:1 1 110px;font-weight:700">${esc(r.name)} <span class="small muted" style="font-weight:400">${r.kind === 'child' ? esc(age) : ''}${r.status === '휴회' ? ' · 휴회' : ''}</span></div>
    ${c.kind === 'child' ? `<div class="steps" style="flex:0 1 330px">${STEPS.map((s, si) => `<button type="button" class="${si <= r.step ? 'on' : ''}" data-step="${si}" data-i="${i}" aria-label="${esc(r.name)} ${s}${si <= r.step ? ' 완료' : ''}"></button>`).join('')}</div>` : ''}</div>
    <div class="row" style="gap:6px;flex-wrap:nowrap"><div class="att row" style="gap:4px;flex-wrap:nowrap">${['출석', '결석', '보강'].map((a, ai) => `<button type="button" class="a${ai + 1} ${r.att === a ? 'on' : ''}" data-att="${a}" data-i="${i}" aria-pressed="${r.att === a}">${a}</button>`).join('')}</div>
    ${c.kind === 'child' ? `<input class="inp" style="height:34px;font-size:13px" data-note="${i}" maxlength="300" placeholder="강사 한마디 (학부모 앱에 표시)" aria-label="${esc(r.name)} 강사 한마디" value="${esc(r.note)}">` : ''}</div>`;
  const rows = A.cs.rows, t = document.getElementById('tally');
  if (t) t.textContent = `출석 ${rows.filter(x => x.att === '출석').length} · 결석 ${rows.filter(x => x.att === '결석').length} · 보강 ${rows.filter(x => x.att === '보강').length} · 미체크 ${rows.filter(x => !x.att).length}`;
}
async function saveAttendance() {
  const c = clsById(A.cs.sel), date = A.cs.date;
  const ups = A.cs.rows.filter(r => r.att).map(r => ({ member_id: r.id, class_id: c.id, date, status: r.att }));
  const dels = A.cs.rows.filter(r => !r.att).map(r => r.id);
  const prog = A.cs.rows.filter(r => r.kind === 'child' && (r.step !== r.step0 || r.note !== r.note0)).map(r => ({
    member_id: r.id, step: r.step, teacher_note: r.note || null, note_updated_at: r.note !== r.note0 ? new Date().toISOString() : undefined }));
  try {
    if (ups.length) await q(sb.from('attendance').upsert(ups, { onConflict: 'member_id,class_id,date' }));
    if (dels.length) await q(sb.from('attendance').delete().eq('class_id', c.id).eq('date', date).in('member_id', dels));
    for (const p of prog) { if (p.note_updated_at === undefined) delete p.note_updated_at; await q(sb.from('progress').upsert(p)); }
    toast('저장했어요'); renderRoster();
  } catch (e) { fail(e); }
}
function classForm(c) {
  return `<form id="cForm" class="col"><h2>${c.id ? '반 수정' : '새 반'}</h2><input type="hidden" name="id" value="${esc(c.id || '')}">
    <div class="form-grid">
      <label class="f">반 이름 *<input name="name" required value="${esc(c.name || '')}" placeholder="예: 초급 A"></label>
      <label class="f">구분<select name="kind"><option value="child" ${c.kind !== 'adult' ? 'selected' : ''}>어린이</option><option value="adult" ${c.kind === 'adult' ? 'selected' : ''}>성인</option></select></label>
      <label class="f">레벨<select name="level">${['초급', '중급', '상급'].map(l => `<option ${c.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="f">시작 시간<input name="start_time" type="time" required value="${esc(hm(c.start_time) || '16:00')}"></label>
      <label class="f">정원<input name="capacity" type="number" min="1" max="100" required value="${esc(c.capacity || 5)}"></label>
      <label class="f">강사<select name="teacher_id"><option value="">미배정</option>${A.staff.filter(s => s.active).map(s => `<option value="${s.user_id}" ${c.teacher_id === s.user_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
    </div>
    <fieldset style="border:0;padding:0;margin:0"><legend class="small" style="color:var(--mid);margin-bottom:6px">요일</legend><div class="row">${DAYS.map((d, i) => `<label class="row small" style="gap:4px"><input type="checkbox" name="d${i}" ${(c.days || []).includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div></fieldset>
    ${c.id ? `<label class="row small"><input type="checkbox" name="inactive" ${c.active === false ? 'checked' : ''}> 운영 종료 (시간표에서 숨김)</label>` : ''}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="cancelcls">취소</button><button class="btn pri">저장</button></div></form>`;
}
async function classAction(act) {
  const box = document.getElementById('roster');
  if (act === 'newcls') box.innerHTML = classForm({});
  else if (act === 'editcls') box.innerHTML = classForm(clsById(A.cs.sel));
  else if (act === 'cancelcls') renderRoster();
  else if (act === 'saveatt') saveAttendance();
}
async function saveClass(form) {
  const f = formData(form);
  const days = DAYS.map((d, i) => f['d' + i] ? i : null).filter(x => x !== null);
  if (!days.length) return toast('요일을 하나 이상 골라 주세요.', true);
  const row = { name: f.name, kind: f.kind, level: f.level, start_time: f.start_time, capacity: +f.capacity, teacher_id: f.teacher_id || null, days, active: !f.inactive };
  try {
    if (f.id) await q(sb.from('classes').update(row).eq('id', f.id));
    else A.cs.sel = (await q(sb.from('classes').insert(row).select('id').single())).id;
    toast('저장했어요'); route();
  } catch (e) { fail(e); }
}
