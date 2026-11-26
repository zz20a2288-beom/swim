'use strict';
/* 매출 (다짐매니저 매출 화면 형식) + 결제 링크 */
const SALE_TYPES = ['수강권', '특강', '용품', '기타'];
const PAY_METHODS = METHODS.concat(['서비스']);
A.sf = null;
function sfReset() {
  const ms = monthStart();
  A.sf = { tab: 'sales', from: ms, to: addDays(addMonths(ms, 1), -1), preset: '이번 달', q: '', product: '', stype: '', method: '', unpaid: '', re: '', handler: '', page: 1, per: 10, showForm: false, fType: '재등록', fMethod: '카드' };
}
function presetRange(p) {
  const t = todayStr(), d = new Date(), ms = monthStart(), w = dow(t);
  return {
    '이번 달': [ms, addDays(addMonths(ms, 1), -1)], '지난 달': [addMonths(ms, -1), addDays(ms, -1)],
    '오늘': [t, t], '어제': [addDays(t, -1), addDays(t, -1)],
    '이번 주': [addDays(t, -w), addDays(t, 6 - w)], '지난 주': [addDays(t, -w - 7), addDays(t, -w - 1)],
    '올해': [d.getFullYear() + '-01-01', d.getFullYear() + '-12-31'], '작년': [(d.getFullYear() - 1) + '-01-01', (d.getFullYear() - 1) + '-12-31']
  }[p];
}
const saleNo = (p) => p.id.replace(/-/g, '').slice(0, 8);
const methodBadge = (m) => `<span class="badge ${m === '서비스' ? 'b-gray' : m === '계좌이체' ? 'b-warn' : m === '현금' ? 'b-ok' : 'b-kid'}">${esc(m)}</span>`;
const productOf = (p) => p.product_name || (p.sale_type === '수강권' ? '수강권 ' + p.months + '개월' : p.sale_type);

A.pages.payments = async (v) => {
  if (!A.sf) sfReset();
  if (!A.myId) A.myId = (await sb.auth.getUser()).data.user.id;
  await loadMembers();
  if (A.payIntent) { A.sf.showForm = true; A.sf.tab = 'sales'; }
  if (A.sf.tab === 'links') return linksTab(v);
  const all = []; let from = 0;
  while (true) {
    const page = await q(sb.from('payments').select('*,members!inner(name,kind)').eq('members.kind', 'child')
      .gte('paid_at', A.sf.from).lte('paid_at', A.sf.to).order('paid_at', { ascending: false }).order('created_at', { ascending: false }).range(from, from + 999));
    all.push(...page); if (page.length < 1000) break; from += 1000;
  }
  const unpaidAll = await q(sb.from('payments').select('unpaid,members!inner(kind)').eq('members.kind', 'child').gt('unpaid', 0));
  A.sdata = { all, unpaidTotal: unpaidAll.reduce((s, p) => s + p.unpaid, 0) };
  renderSales(v);
};

function salesFiltered() {
  const f = A.sf, qq = f.q.trim().toLowerCase();
  return A.sdata.all.filter(p =>
    (!qq || [p.members.name, productOf(p), saleNo(p)].some(x => (x || '').toLowerCase().includes(qq))) &&
    (!f.product || productOf(p) === f.product) && (!f.stype || p.sale_type === f.stype) && (!f.method || p.method === f.method) &&
    (!f.unpaid || (f.unpaid === 'y' ? p.unpaid > 0 : p.unpaid === 0)) && (!f.re || p.type === f.re) &&
    (!f.handler || (f.handler === 'none' ? !p.handled_by : p.handled_by === f.handler)));
}
function selBox(id, label, val, opts) {
  return `<select class="inp sel-filter ${val ? 'on' : ''}" id="${id}" aria-label="${label}"><option value="">${label}</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${val === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}
function renderSales(v) {
  const f = A.sf, rows = salesFiltered();
  const approved = rows.reduce((s, p) => s + p.amount, 0), refund = rows.reduce((s, p) => s + (p.refund_amount || 0), 0);
  const pages = Math.max(1, Math.ceil(rows.length / f.per)); if (f.page > pages) f.page = pages;
  const show = rows.slice((f.page - 1) * f.per, f.page * f.per);
  const products = [...new Set(A.sdata.all.map(productOf))].sort();
  const pageBtns = []; for (let i = Math.max(1, f.page - 3); i <= Math.min(pages, f.page + 3); i++) pageBtns.push(i);
  v.innerHTML = `
  <div class="tabs" role="tablist"><button role="tab" class="on" data-tab2="sales">매출</button><button role="tab" data-tab2="links">결제 링크</button></div>
  <div class="spread"><input class="inp" style="max-width:380px;border-radius:999px;padding-left:18px" type="search" id="sq" placeholder="🔍 매출 검색 (원생 이름, 매출 이름, 판매번호)" value="${esc(f.q)}" aria-label="매출 검색">
    <button class="btn pri" data-act="toggleForm">${f.showForm ? '결제 등록 닫기' : '+ 결제 등록'}</button></div>
  ${f.showForm ? saleForm() : ''}
  <section class="card col" style="gap:14px">
    <div class="row" style="gap:8px">
      <div class="row date-box"><input type="date" id="sfrom" value="${f.from}" aria-label="시작일"> ~ <input type="date" id="sto" value="${f.to}" aria-label="종료일"></div>
      ${['이번 달', '지난 달', '오늘', '어제', '이번 주', '지난 주', '올해', '작년'].map(p => `<button class="chip ${f.preset === p ? 'on' : ''}" data-preset="${p}">${p}</button>`).join('')}
    </div>
    <div class="filter-bar spread"><div class="row" style="gap:6px">
      ${selBox('fproduct', '매출 이름', f.product, products.map(x => [x, x]))}
      ${selBox('fstype', '매출 유형', f.stype, SALE_TYPES.map(x => [x, x]))}
      ${selBox('fmethod', '결제수단', f.method, PAY_METHODS.map(x => [x, x]))}
      ${selBox('funpaid', '미수금 여부', f.unpaid, [['y', '미수금 있음'], ['n', '미수금 없음']])}
      ${selBox('fre', '재등록 여부', f.re, [['재등록', '재등록'], ['신규', '신규']])}
      ${selBox('fhandler', '결제담당자', f.handler, A.staff.map(s => [s.user_id, s.name]).concat([['none', '미지정']]))}
    </div><div class="row" style="gap:6px"><button class="btn sm" data-act="reset">필터 초기화</button><button class="btn sm" data-act="xls">엑셀 다운로드</button></div></div>
    <div class="sum-bar">
      <span class="lbl">매출</span><b class="big">${won(approved - refund).slice(1)}원</b><span class="sep"></span>
      <span class="lbl">승인금액</span><b>${won(approved).slice(1)}원</b><span class="sep"></span>
      <span class="lbl">환불</span><b>${won(refund).slice(1)}원</b>
      <span style="width:18px"></span><span class="lbl">총 결제</span><b class="big">${rows.length}건</b><span class="sep"></span>
      ${SALE_TYPES.map(t => `<span class="lbl">${t}</span><b>${rows.filter(p => p.sale_type === t).length}건</b>`).join('<span class="sep"></span>')}
      <span style="width:18px"></span><span class="lbl">누적 미수금</span><b style="color:${A.sdata.unpaidTotal ? '#B4471A' : 'inherit'}">${won(A.sdata.unpaidTotal).slice(1)}원</b>
    </div>
  </section>
  <section class="card tight"><div class="tbl-wrap"><table class="tbl sales" style="min-width:1080px">
    <thead><tr><th>판매번호</th><th>원생 이름</th><th>매출 유형</th><th>매출 이름</th><th style="text-align:right">판매금액</th><th style="text-align:right">매출</th><th style="text-align:center">결제수단</th><th>결제/환불일</th><th>결제담당자</th><th style="text-align:center">재등록<br>여부</th><th style="text-align:center">영수증</th></tr></thead>
    <tbody>${show.length ? show.map(p => `<tr>
      <td><button class="linkbtn" data-detail="${p.id}">${saleNo(p)} ›</button></td>
      <td><a href="#members" data-open="${p.member_id}" class="bold" style="color:var(--ink);text-decoration:none">${esc(p.members.name)}</a></td>
      <td>${esc(p.sale_type)}</td><td>${esc(productOf(p))}${p.unpaid ? ` <span class="badge b-warn">미수 ${won(p.unpaid)}</span>` : ''}</td>
      <td style="text-align:right">${won(p.list_price ?? p.amount).slice(1)}원</td>
      <td style="text-align:right">${p.refund_amount ? `<s class="muted">${won(p.amount).slice(1)}원</s><br><b style="color:#B4471A">−${won(p.refund_amount).slice(1)}원</b>` : won(p.amount).slice(1) + '원'}</td>
      <td style="text-align:center">${methodBadge(p.method)}</td>
      <td>${dot(p.paid_at)}${p.refunded_at ? `<br><span class="small" style="color:#B4471A">환불 ${dot(p.refunded_at)}</span>` : ''}</td>
      <td>${esc(p.handled_by ? staffName(p.handled_by) : '-')}</td>
      <td style="text-align:center">${p.type === '재등록' ? '○' : '—'}</td>
      <td style="text-align:center"><button class="linkbtn" data-receipt="${p.id}" aria-label="영수증">🧾</button></td></tr>`).join('') : '<tr><td colspan="11" class="empty">조건에 맞는 매출이 없어요.</td></tr>'}</tbody></table></div></section>
  <div class="spread"><label class="row small">행 표시 <select class="inp" style="width:auto" id="sper">${[10, 20, 50, 100].map(n => `<option ${f.per === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <div class="row pager" style="gap:4px"><button class="btn sm" data-pg="${f.page - 1}" ${f.page <= 1 ? 'disabled' : ''} aria-label="이전">‹</button>
      ${pageBtns.map(i => `<button class="btn sm ${i === f.page ? 'pri' : ''}" data-pg="${i}">${i}</button>`).join('')}
      ${pageBtns[pageBtns.length - 1] < pages ? `<span>…</span><button class="btn sm" data-pg="${pages}">${pages}</button>` : ''}
      <button class="btn sm" data-pg="${f.page + 1}" ${f.page >= pages ? 'disabled' : ''} aria-label="다음">›</button></div></div>
  <div id="modal"></div>`;
  if (f.showForm) bindSaleForm(v);
  v.oninput = (e) => { if (e.target.id === 'sq') { f.q = e.target.value; f.page = 1; rerenderKeepFocus(v, 'sq'); } else if (e.target.closest('#saleForm')) formCalc(); };
  v.onchange = (e) => {
    const id = e.target.id, map = { fproduct: 'product', fstype: 'stype', fmethod: 'method', funpaid: 'unpaid', fre: 're', fhandler: 'handler' };
    if (map[id]) { f[map[id]] = e.target.value; f.page = 1; renderSales(v); }
    else if (id === 'sper') { f.per = +e.target.value; f.page = 1; renderSales(v); }
    else if (id === 'sfrom' || id === 'sto') { f[id === 'sfrom' ? 'from' : 'to'] = e.target.value; f.preset = ''; route(); }
    else if (e.target.closest('#saleForm')) formCalc();
  };
  v.onclick = async (e) => {
    const t = e.target.closest('[data-preset],[data-act],[data-pg],[data-detail],[data-receipt],[data-open],[data-tab2],[data-ft],[data-fm],[data-close],[data-refund],[data-settle]'); if (!t) return;
    const d = t.dataset;
    if (d.preset) { [f.from, f.to] = presetRange(d.preset); f.preset = d.preset; f.page = 1; route(); }
    else if (d.tab2) { f.tab = d.tab2; route(); }
    else if (d.pg) { f.page = +d.pg; renderSales(v); }
    else if (d.open) A.memberIntent = { open: d.open };
    else if (d.detail) showDetail(d.detail);
    else if (d.receipt) showReceipt(d.receipt);
    else if (d.close !== undefined) { if (t.classList.contains('modal-bg') && e.target !== t) return; document.getElementById('modal').innerHTML = ''; }
    else if (d.ft) { f.fType = d.ft; v.querySelectorAll('[data-ft]').forEach(b => b.classList.toggle('on', b === t)); }
    else if (d.fm) { f.fMethod = d.fm; v.querySelectorAll('[data-fm]').forEach(b => b.classList.toggle('on', b === t)); formCalc(); }
    else if (d.refund) doRefund(d.refund);
    else if (d.settle) doSettle(d.settle);
    else if (d.act === 'toggleForm') { f.showForm = !f.showForm; renderSales(v); }
    else if (d.act === 'reset') { Object.assign(f, { q: '', product: '', stype: '', method: '', unpaid: '', re: '', handler: '', page: 1 }); renderSales(v); }
    else if (d.act === 'xls') exportSales(rows);
    else if (d.act === 'print') window.print();
  };
  v.onsubmit = (e) => { e.preventDefault(); if (e.target.id === 'saleForm') submitSale(e.target); };
}
function rerenderKeepFocus(v, id) { const pos = document.getElementById(id).selectionStart; renderSales(v); const el = document.getElementById(id); el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) { } }

/* 결제 등록 */
function saleForm() {
  const f = A.sf, pre = A.payIntent && A.members.find(m => m.id === A.payIntent);
  const prods = [...new Set(['1:5 소그룹 1개월', '1:5 소그룹 3개월', '단체강습 1개월', '겨울방학특강', '수모', '수경'].concat((A.sdata ? A.sdata.all : []).map(productOf)))];
  return `<section class="card"><form id="saleForm" class="col" autocomplete="off"><h2>결제 등록</h2>
    <div class="form-grid">
      <label class="f" style="grid-column:span 2">원생 (이름으로 검색) *<input name="member" list="memList" required value="${pre ? esc(memLabel(pre)) : ''}" placeholder="이름 입력 후 목록에서 선택"></label>
      <datalist id="memList">${A.members.filter(m => m.status !== '탈회').map(m => `<option value="${esc(memLabel(m))}">`).join('')}</datalist>
      <div class="col" style="gap:5px"><span class="small" style="color:var(--mid)">재등록 여부</span><div class="seg">${['신규', '재등록'].map(t => `<button type="button" data-ft="${t}" class="${f.fType === t ? 'on' : ''}">${t}</button>`).join('')}</div></div>
      <label class="f">매출 유형<select name="sale_type">${SALE_TYPES.map(t => `<option>${t}</option>`).join('')}</select></label>
      <label class="f">매출 이름 *<input name="product" list="prodList" required maxlength="60" placeholder="예: 1:5 소그룹 1개월"></label>
      <datalist id="prodList">${prods.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
      <label class="f">수강권 기간<select name="months"><option value="0">기간 없음 (용품 등)</option>${[1, 2, 3, 6, 12].map(n => `<option value="${n}" ${n === 1 ? 'selected' : ''}>${n}개월 연장</option>`).join('')}</select></label>
      <label class="f">판매금액 (원)<input name="list_price" inputmode="numeric" placeholder="정가"></label>
      <label class="f">매출 · 실결제 (원) *<input name="amount" inputmode="numeric" required></label>
      <label class="f">미수금 (원)<input name="unpaid" inputmode="numeric" value="0"></label>
      <label class="f">결제일<input name="paid_at" type="date" value="${todayStr()}"></label>
      <label class="f">결제담당자<select name="handled_by">${A.staff.filter(s => s.active).map(s => `<option value="${s.user_id}" ${s.user_id === A.myId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label class="f">메모<input name="memo" maxlength="200"></label>
    </div>
    <div class="col" style="gap:6px"><span class="small" style="color:var(--mid)">결제수단</span><div class="row" style="gap:6px">${PAY_METHODS.map(m => `<button type="button" class="chip ${f.fMethod === m ? 'on' : ''}" data-fm="${m}">${m}</button>`).join('')}</div></div>
    <div class="spread"><div class="small muted" id="memInfo"></div><button class="btn pri">결제 등록</button></div>
  </form></section>`;
}
function bindSaleForm() { A.payIntent = null; formCalc(); }
function formCalc() {
  const form = document.getElementById('saleForm'); if (!form) return;
  const num = (n) => parseInt(String(form[n].value).replace(/[^0-9]/g, '') || '0', 10);
  if (A.sf.fMethod === '서비스' && form.amount.value === '') form.amount.value = '0';
  const lp = num('list_price'), am = num('amount');
  if (form.list_price.value && form.amount.value && document.activeElement !== form.unpaid) form.unpaid.value = Math.max(0, lp - am);
  const m = A.members.find(x => memLabel(x) === form.member.value), el = document.getElementById('memInfo');
  const months = +form.months.value;
  if (m && !form.product.value && months) { const c = enrolledClasses(m.id)[0]; if (c) form.product.value = `${c.name} ${months}개월`; }
  if (!m) { el.textContent = ''; return; }
  const today = todayStr(), base = m.pass_end && m.pass_end >= today ? m.pass_end : addDays(today, -1);
  el.textContent = `현재 수강권 ${m.pass_end ? dot(m.pass_end) + '까지' : '없음'}` + (months ? ` → 등록 후 ${dot(addMonths(base, months))}까지` : ' (기간 변동 없음)');
}
async function submitSale(form) {
  const f = formData(form), m = A.members.find(x => memLabel(x) === f.member);
  if (!m) return toast('원생을 목록에서 골라 주세요.', true);
  const num = (s) => parseInt(String(s || '').replace(/[^0-9]/g, '') || '0', 10);
  const amount = num(f.amount);
  if (f.amount === '' ) return toast('실결제 금액을 입력해 주세요.', true);
  try {
    const end = await q(sb.rpc('admin_add_sale', { p_member: m.id, p_type: A.sf.fType, p_sale_type: f.sale_type, p_product: f.product, p_months: +f.months,
      p_list_price: f.list_price ? num(f.list_price) : amount, p_amount: amount, p_unpaid: num(f.unpaid), p_method: A.sf.fMethod, p_paid_at: f.paid_at || todayStr(),
      p_handled_by: f.handled_by || null, p_memo: f.memo || null }));
    toast(`${m.name} 결제 등록` + (+f.months ? ` · 수강권 ${dot(end)}까지` : ''));
    A.sf.showForm = false; route();
  } catch (e) { fail(e); }
}

/* 상세 · 환불 · 영수증 */
function showDetail(id) {
  const p = A.sdata.all.find(x => x.id === id), mm = document.getElementById('modal');
  mm.innerHTML = `<div class="modal-bg" data-close><div class="modal" role="dialog" aria-label="매출 상세">
    <div class="spread"><h2>매출 상세 <span class="muted small">${saleNo(p)}</span></h2><button class="btn sm" data-close>닫기</button></div>
    <dl class="kv"><dt>원생</dt><dd>${esc(p.members.name)}</dd><dt>매출 유형 · 이름</dt><dd>${esc(p.sale_type)} · ${esc(productOf(p))}</dd>
      <dt>재등록 여부</dt><dd>${esc(p.type)}</dd><dt>수강권 기간</dt><dd>${p.months ? p.months + '개월' : '없음'}</dd>
      <dt>판매금액 / 매출</dt><dd>${won(p.list_price ?? p.amount)} / <b>${won(p.amount)}</b></dd><dt>결제수단 · 결제일</dt><dd>${esc(p.method)} · ${dot(p.paid_at)}</dd>
      <dt>결제담당자</dt><dd>${esc(p.handled_by ? staffName(p.handled_by) : '-')}</dd><dt>메모</dt><dd>${esc(p.memo || '—')}</dd>
      ${p.refund_amount ? `<dt>환불</dt><dd style="color:#B4471A">${won(p.refund_amount)} · ${dot(p.refunded_at)}${p.refund_reason ? ' · ' + esc(p.refund_reason) : ''}</dd>` : ''}</dl>
    <div class="col" style="border-top:1px solid var(--line);padding-top:12px">
      <div class="row"><label class="f" style="flex:1">미수금 (원)<input id="dUnpaid" inputmode="numeric" value="${p.unpaid}"></label><button class="btn" style="align-self:flex-end" data-settle="${p.id}">미수금 저장</button></div>
      <div class="row"><label class="f" style="flex:1">환불 금액 (원)<input id="dRefund" inputmode="numeric" value="${p.refund_amount || ''}" placeholder="0"></label>
        <label class="f" style="flex:1">환불일<input id="dRefundAt" type="date" value="${p.refunded_at || todayStr()}"></label></div>
      <label class="f">환불 사유<input id="dReason" value="${esc(p.refund_reason || '')}"></label>
      <div class="small muted">환불해도 수강권 만료일은 자동으로 줄지 않아요. 필요하면 원생 정보에서 고쳐 주세요.</div>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-receipt="${p.id}">영수증</button><button class="btn danger" data-refund="${p.id}">환불 저장</button></div>
    </div></div></div>`;
}
async function doRefund(id) {
  const amt = parseInt(String(document.getElementById('dRefund').value).replace(/[^0-9]/g, '') || '0', 10);
  if (!confirm(amt ? `${won(amt)} 환불로 기록할까요?` : '환불 기록을 지울까요?')) return;
  try { await q(sb.rpc('admin_refund_sale', { p_id: id, p_amount: amt, p_date: document.getElementById('dRefundAt').value || todayStr(), p_reason: document.getElementById('dReason').value })); toast('저장했어요'); route(); } catch (e) { fail(e); }
}
async function doSettle(id) {
  const n = parseInt(String(document.getElementById('dUnpaid').value).replace(/[^0-9]/g, '') || '0', 10);
  try { await q(sb.rpc('admin_settle_unpaid', { p_id: id, p_unpaid: n })); toast('저장했어요'); route(); } catch (e) { fail(e); }
}
function showReceipt(id) {
  const p = A.sdata.all.find(x => x.id === id), mm = document.getElementById('modal');
  mm.innerHTML = `<div class="modal-bg" data-close><div class="modal" role="dialog" aria-label="영수증">
    <div class="print-area receipt"><h2 style="text-align:center">영 수 증</h2><div class="small muted" style="text-align:center">${esc(CFG.CENTER_NAME)} ${esc(CFG.BRANCH_NAME)} · ${esc(CFG.CONTACT)}</div>
      <dl class="kv"><dt>판매번호</dt><dd>${saleNo(p)}</dd><dt>원생</dt><dd>${esc(p.members.name)}</dd><dt>내역</dt><dd>${esc(productOf(p))}</dd>
        <dt>결제일</dt><dd>${dot(p.paid_at)}</dd><dt>결제수단</dt><dd>${esc(p.method)}</dd><dt>금액</dt><dd><b>${won(p.amount)}</b></dd>
        ${p.refund_amount ? `<dt>환불</dt><dd>−${won(p.refund_amount)} (${dot(p.refunded_at)})</dd><dt>최종</dt><dd><b>${won(p.amount - p.refund_amount)}</b></dd>` : ''}</dl>
      <div class="small muted" style="text-align:center">위 금액을 정히 영수합니다.</div></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-close>닫기</button><button class="btn pri" data-act="print">인쇄</button></div></div></div>`;
}
function exportSales(rows) {
  const head = ['판매번호', '원생 이름', '매출 유형', '매출 이름', '판매금액', '매출', '미수금', '환불', '결제수단', '결제일', '환불일', '결제담당자', '재등록 여부', '메모'];
  const cell = (x) => { let s = String(x ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const lines = [head.map(cell).join(',')].concat(rows.map(p => [saleNo(p), p.members.name, p.sale_type, productOf(p), p.list_price ?? p.amount, p.amount, p.unpaid, p.refund_amount, p.method, p.paid_at, p.refunded_at, p.handled_by ? staffName(p.handled_by) : '', p.type, p.memo].map(cell).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `매출_${A.sf.from}_${A.sf.to}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function memLabel(m) { return `${m.name} (${clsNames(m.id) || '반 없음'} · ${m.birth ? m.birth.slice(0, 4) : '—'})`; }

/* 결제 링크 탭 */
async function linksTab(v) {
  const links = await q(sb.from('payment_links').select('*').order('created_at', { ascending: false }));
  v.innerHTML = `<div class="tabs" role="tablist"><button role="tab" data-tab2="sales">매출</button><button role="tab" class="on" data-tab2="links">결제 링크</button></div>
  <section class="card col" style="max-width:720px"><p class="small muted" style="margin:0">결제선생 등에서 만든 링크를 등록하면 학부모 앱 '바로 결제하기' 버튼에 연결돼요. 반을 지정한 링크가 있으면 그 링크, 없으면 '전체' 링크로 연결됩니다.</p>
    ${links.map(l => `<div style="border:1px solid var(--line);border-radius:10px;padding:12px" class="col"><div class="spread"><b class="small">${esc(l.name)}</b><span class="badge ${l.active ? 'b-ok' : 'b-gray'}">${l.target_class_id ? esc((clsById(l.target_class_id) || {}).name || '반') : '전체'}${l.active ? '' : ' · 꺼짐'}</span></div>
      <div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.url)}</div>
      <div class="row"><button class="btn sm" data-togglelink="${l.id}" data-on="${l.active}">${l.active ? '끄기' : '켜기'}</button><button class="btn sm" data-dellink="${l.id}">삭제</button></div></div>`).join('')}
    <form id="lForm" class="col" style="border:1px dashed #9CB3C9;border-radius:10px;padding:12px">
      <label class="f">이름<input name="name" required placeholder="예: 1:5 소그룹 1개월"></label>
      <label class="f">링크 (https://…)<input name="url" type="url" required placeholder="https://"></label>
      <label class="f">대상<select name="target"><option value="">전체</option>${A.classes.map(c => `<option value="c:${c.id}">${esc(c.name)} 반</option>`).join('')}</select></label>
      <button class="btn">+ 결제 링크 등록</button></form></section>`;
  v.onclick = async (e) => {
    const t = e.target.closest('[data-tab2],[data-dellink],[data-togglelink]'); if (!t) return; const d = t.dataset;
    if (d.tab2) { A.sf.tab = d.tab2; return route(); }
    try {
      if (d.dellink) { if (!confirm('결제 링크를 삭제할까요?')) return; await q(sb.from('payment_links').delete().eq('id', d.dellink)); }
      else if (d.togglelink) await q(sb.from('payment_links').update({ active: d.on !== 'true' }).eq('id', d.togglelink));
      toast('반영했어요'); route();
    } catch (err) { fail(err); }
  };
  v.onsubmit = async (e) => {
    e.preventDefault(); const f = formData(e.target);
    if (!/^https:\/\/[^\s<>"]+$/.test(f.url)) return toast('https:// 로 시작하는 링크만 등록할 수 있어요.', true);
    try { await q(sb.from('payment_links').insert({ name: f.name, url: f.url, target_class_id: f.target.startsWith('c:') ? f.target.slice(2) : null })); toast('등록했어요'); route(); } catch (err) { fail(err); }
  };
  v.oninput = v.onchange = null;
}
