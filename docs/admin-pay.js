'use strict';
/* 결제·매출 */
A.pf = { type: '재등록', months: 1, method: '카드', tab: '수단별', month: null };

A.pages.payments = async (v) => {
  await loadMembers();
  if (!A.pf.month) A.pf.month = monthStart().slice(0, 7);
  const ms = A.pf.month + '-01', me = addDays(addMonths(ms, 1), -1), six = addMonths(ms, -5);
  const [pays, hist, links, logs] = await Promise.all([
    q(sb.from('payments').select('*').gte('paid_at', ms).lte('paid_at', me).order('paid_at', { ascending: false }).order('created_at', { ascending: false })),
    q(sb.from('payments').select('amount,paid_at').gte('paid_at', six).lte('paid_at', me)),
    q(sb.from('payment_links').select('*').order('created_at', { ascending: false })),
    q(sb.from('member_status_log').select('refund_amount').gte('effective_date', ms).lte('effective_date', me))
  ]);
  A.pdata = { pays, hist, links, logs, ms };
  const pre = A.payIntent && A.members.find(m => m.id === A.payIntent); A.payIntent = null;
  v.innerHTML = `
  <header class="spread"><div><h1>결제·매출</h1><div class="muted small">결제를 등록하면 수강권 만료일이 자동으로 늘어나요.</div></div>
    <label class="row small">조회 월 <input class="inp" style="width:auto" type="month" id="pmonth" value="${A.pf.month}"></label></header>
  <div class="wrap2">
    <section class="card side"><form id="pForm" class="col" autocomplete="off"><h2>결제 등록</h2>
      <label class="f">회원 (이름으로 검색) *<input name="member" list="memList" required value="${pre ? esc(memLabel(pre)) : ''}" placeholder="이름 입력 후 목록에서 선택"></label>
      <datalist id="memList">${A.members.filter(m => m.status !== '탈회').map(m => `<option value="${esc(memLabel(m))}">`).join('')}</datalist>
      <div class="small muted" id="memInfo"></div>
      <div class="row"><div class="col" style="gap:6px;flex:1 1 140px"><span class="small" style="color:var(--mid)">구분</span><div class="seg">${['신규', '재등록'].map(t => `<button type="button" data-pt="${t}" class="${A.pf.type === t ? 'on' : ''}">${t}</button>`).join('')}</div></div>
        <div class="col" style="gap:6px;flex:1 1 180px"><span class="small" style="color:var(--mid)">개월</span><div class="seg">${[1, 3, 6, 12].map(n => `<button type="button" data-pm="${n}" class="${A.pf.months === n ? 'on' : ''}">${n}개월</button>`).join('')}</div></div></div>
      <div class="col" style="gap:6px"><span class="small" style="color:var(--mid)">결제수단</span><div class="row" style="gap:6px">${METHODS.map(m => `<button type="button" class="chip ${A.pf.method === m ? 'on' : ''}" data-pmeth="${m}">${m}</button>`).join('')}</div></div>
      <div class="form-grid"><label class="f">금액 (원) *<input name="amount" inputmode="numeric" required placeholder="예: 230000"></label><label class="f">결제일<input name="paid_at" type="date" value="${todayStr()}"></label></div>
      <label class="f">메모<input name="memo" maxlength="200"></label>
      <button class="btn pri block">결제 등록</button></form></section>
    <section class="card main col" id="sum"></section>
  </div>
  <div class="wrap2">
    <section class="card tight main"><div class="spread" style="padding:16px 20px 6px"><h2>${+A.pf.month.slice(5)}월 결제 내역 <span class="small muted">${pays.length}건</span></h2></div>
      ${pays.length ? `<div class="tbl-wrap"><table class="tbl" style="min-width:640px"><thead><tr><th>날짜</th><th>회원</th><th>구분</th><th>개월</th><th>수단</th><th>강사</th><th style="text-align:right">금액</th><th></th></tr></thead><tbody>
      ${pays.slice(0, 200).map(p => { const m = A.members.find(x => x.id === p.member_id) || {};
        return `<tr><td>${md(p.paid_at)}</td><td class="bold">${esc(m.name || '(삭제됨)')}</td><td>${esc(p.type)}</td><td>${p.months}</td><td>${esc(p.method)}</td><td>${esc(p.teacher_id ? staffName(p.teacher_id) : '—')}</td><td style="text-align:right" class="bold">${won(p.amount)}</td>
        <td><button class="btn sm" data-delpay="${p.id}" aria-label="결제 삭제">삭제</button></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">결제 내역이 없어요.</div>'}
    </section>
    <section class="card side col"><h2>결제 링크</h2>
      <p class="small muted" style="margin:0">결제선생 등에서 만든 링크를 등록하면 학부모 앱 '바로 결제하기' 버튼에 연결돼요. (반 지정 → 구분 지정 → 전체 순서로 연결)</p>
      ${links.map(l => `<div style="border:1px solid var(--line);border-radius:10px;padding:12px" class="col"><div class="spread"><b class="small">${esc(l.name)}</b><span class="badge ${l.active ? 'b-ok' : 'b-gray'}">${l.target_class_id ? esc((clsById(l.target_class_id) || {}).name || '반') : l.target_kind ? KIND[l.target_kind] : '전체'}${l.active ? '' : ' · 꺼짐'}</span></div>
        <div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.url)}</div>
        <div class="row"><button class="btn sm" data-togglelink="${l.id}" data-on="${l.active}">${l.active ? '끄기' : '켜기'}</button><button class="btn sm" data-dellink="${l.id}">삭제</button></div></div>`).join('')}
      <form id="lForm" class="col" style="border:1px dashed #9CB3C9;border-radius:10px;padding:12px">
        <label class="f">이름<input name="name" required placeholder="예: 어린이 1:5 소그룹 1개월"></label>
        <label class="f">링크 (https://…)<input name="url" type="url" required placeholder="https://"></label>
        <label class="f">대상<select name="target"><option value="">전체</option><option value="k:child">어린이 전체</option><option value="k:adult">성인 전체</option>${A.classes.map(c => `<option value="c:${c.id}">${esc(c.name)} 반</option>`).join('')}</select></label>
        <button class="btn">+ 결제 링크 등록</button></form>
    </section>
  </div>`;
  renderSum(); if (pre) showMemInfo(v.querySelector('[name=member]').value);

  v.onclick = async (e) => {
    const t = e.target.closest('[data-pt],[data-pm],[data-pmeth],[data-tab],[data-delpay],[data-dellink],[data-togglelink]'); if (!t) return;
    const d = t.dataset;
    if (d.pt) { A.pf.type = d.pt; v.querySelectorAll('[data-pt]').forEach(b => b.classList.toggle('on', b === t)); }
    else if (d.pm) { A.pf.months = +d.pm; v.querySelectorAll('[data-pm]').forEach(b => b.classList.toggle('on', b === t)); showMemInfo(v.querySelector('[name=member]').value); }
    else if (d.pmeth) { A.pf.method = d.pmeth; v.querySelectorAll('[data-pmeth]').forEach(b => b.classList.toggle('on', b === t)); }
    else if (d.tab) { A.pf.tab = d.tab; renderSum(); }
    else try {
      if (d.delpay) { if (!confirm('이 결제를 삭제할까요? 수강권 만료일은 자동으로 되돌아가지 않으니 회원 정보에서 직접 고쳐 주세요.')) return; await q(sb.from('payments').delete().eq('id', d.delpay)); }
      else if (d.dellink) { if (!confirm('결제 링크를 삭제할까요?')) return; await q(sb.from('payment_links').delete().eq('id', d.dellink)); }
      else if (d.togglelink) await q(sb.from('payment_links').update({ active: d.on !== 'true' }).eq('id', d.togglelink));
      toast('반영했어요'); route();
    } catch (err) { fail(err); }
  };
  v.oninput = (e) => { if (e.target.name === 'member') showMemInfo(e.target.value); };
  v.onchange = (e) => { if (e.target.id === 'pmonth' && e.target.value) { A.pf.month = e.target.value; route(); } };
  v.onsubmit = async (e) => {
    e.preventDefault(); const f = formData(e.target);
    try {
      if (e.target.id === 'pForm') {
        const m = A.members.find(x => memLabel(x) === f.member); if (!m) return toast('회원을 목록에서 골라 주세요.', true);
        const amount = parseInt(String(f.amount).replace(/[^0-9]/g, ''), 10); if (!amount && amount !== 0) return toast('금액을 입력해 주세요.', true);
        const c = clsById(m.class_id);
        const end = await q(sb.rpc('admin_add_payment', { p_member: m.id, p_type: A.pf.type, p_months: A.pf.months, p_amount: amount, p_method: A.pf.method, p_paid_at: f.paid_at || todayStr(), p_teacher: c ? c.teacher_id : null, p_memo: f.memo || null }));
        toast(`${m.name} 결제 등록 · 수강권 ${dot(end)}까지`); route();
      } else if (e.target.id === 'lForm') {
        if (!/^https:\/\/[^\s<>"]+$/.test(f.url)) return toast('https:// 로 시작하는 링크만 등록할 수 있어요.', true);
        const row = { name: f.name, url: f.url, target_kind: f.target.startsWith('k:') ? f.target.slice(2) : null, target_class_id: f.target.startsWith('c:') ? f.target.slice(2) : null };
        await q(sb.from('payment_links').insert(row)); toast('등록했어요'); route();
      }
    } catch (err) { fail(err); }
  };
};
function memLabel(m) { const c = clsById(m.class_id); return `${m.name} (${c ? c.name : KIND[m.kind]} · ${m.birth ? m.birth.slice(0, 4) : '—'})`; }
function showMemInfo(val) {
  const el = document.getElementById('memInfo'); if (!el) return;
  const m = A.members.find(x => memLabel(x) === val);
  if (!m) { el.textContent = ''; return; }
  const today = todayStr();
  const base = m.pass_end && m.pass_end >= today ? m.pass_end : addDays(today, -1);
  el.textContent = `현재 수강권 ${m.pass_end ? dot(m.pass_end) + '까지' : '없음'} → 등록 후 약 ${dot(addMonths(base, A.pf.months))}까지`;
}
function renderSum() {
  const { pays, hist, logs, ms } = A.pdata, el = document.getElementById('sum');
  const total = pays.reduce((s, p) => s + p.amount, 0), nw = pays.filter(p => p.type === '신규').reduce((s, p) => s + p.amount, 0);
  const refund = logs.reduce((s, l) => s + (l.refund_amount || 0), 0);
  let rows;
  if (A.pf.tab === '수단별') rows = METHODS.map(m => [m, pays.filter(p => p.method === m).reduce((s, p) => s + p.amount, 0)]);
  else if (A.pf.tab === '강사별') { const g = {}; pays.forEach(p => { const k = p.teacher_id ? staffName(p.teacher_id) : '미배정'; g[k] = (g[k] || 0) + p.amount; }); rows = Object.entries(g).sort((a, b) => b[1] - a[1]); }
  else rows = [5, 4, 3, 2, 1, 0].map(i => { const m0 = addMonths(ms, -i).slice(0, 7); return [+m0.slice(5) + '월', hist.filter(p => p.paid_at.slice(0, 7) === m0).reduce((s, p) => s + p.amount, 0)]; });
  const max = Math.max(1, ...rows.map(r => r[1]));
  el.innerHTML = `<div class="spread"><h2>매출 합계 <span class="small muted">${ms.slice(0, 4)}년 ${+ms.slice(5, 7)}월</span></h2>
    <div class="seg" role="tablist">${['월별', '강사별', '수단별'].map(t => `<button type="button" role="tab" data-tab="${t}" class="${A.pf.tab === t ? 'on' : ''}">${t}</button>`).join('')}</div></div>
    <div class="row" style="gap:26px"><div><div class="small muted">총 매출</div><div class="kpi-n" style="font-size:26px">${won(total)}</div></div>
      <div><div class="small muted">신규</div><div class="bold" style="font-size:18px;margin-top:6px">${won(nw)}</div></div>
      <div><div class="small muted">재등록</div><div class="bold" style="font-size:18px;margin-top:6px">${won(total - nw)}</div></div>
      <div><div class="small muted">환불 (탈회 처리)</div><div class="bold" style="font-size:18px;margin-top:6px;color:#B4471A">${refund ? '−' + won(refund) : '₩0'}</div></div></div>
    <div class="col" style="gap:10px">${rows.length ? rows.map(([l, a]) => `<div style="display:grid;grid-template-columns:84px 1fr 120px;gap:10px;align-items:center" class="small"><span>${esc(l)}</span><div class="bar" style="height:12px"><i style="width:${a ? Math.max(2, Math.round(a / max * 100)) : 0}%"></i></div><b style="text-align:right">${won(a)}</b></div>`).join('') : '<div class="empty">자료가 없어요.</div>'}</div>`;
}
