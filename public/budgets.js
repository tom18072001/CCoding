// UI-7: ngân sách theo dự án / agent (Kiểm toán › Hạn mức) — ngưỡng mềm cảnh báo, trần cứng tạm dừng nhiệm vụ.
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  let C = null;
  const esc = (s) => C.esc(s);
  const KY = { day: 'Ngày', month: 'Tháng', total: 'Toàn bộ' };
  const B = { edit: null, list: [] };

  const targetName = (p) => (p.scope === 'project' ? C.S.projects.find((x) => x.id === p.target)?.name || p.target : C.agentName(p.target));
  function targets(scope, cur) {
    const list = scope === 'project' ? C.S.projects.map((p) => [p.id, p.name]) : [...C.S.agents.values()].filter((a) => a.role !== 'router').map((a) => [a.id, `${a.name} (@${a.id})`]);
    if (!list.length) return '<option value="">— chưa có dự án —</option>';
    return list.map(([id, n]) => `<option value="${esc(id)}"${id === cur ? ' selected' : ''}>${esc(n)}</option>`).join('');
  }
  function form(p = {}) {
    const scope = p.scope || 'project';
    return `<form class="bp-form" data-bp-form>
      <select name="scope" aria-label="Phạm vi"><option value="project"${scope === 'project' ? ' selected' : ''}>Dự án</option><option value="agent"${scope === 'agent' ? ' selected' : ''}>Agent</option></select>
      <select name="target" aria-label="Áp dụng cho">${targets(scope, p.target)}</select>
      <select name="period" aria-label="Kỳ">${Object.entries(KY).map(([k, l]) => `<option value="${k}"${(p.period || 'month') === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <label>Token<input name="tokens" type="number" min="1000" step="1000" required value="${esc(p.tokens || 1000000)}" /></label>
      <label>Ngưỡng mềm<input name="softPct" type="number" min="1" max="100" value="${esc(p.softPct || 80)}" />%</label>
      <label class="check"><input name="hard" type="checkbox"${p.hard === false ? '' : ' checked'} /> Trần cứng (tạm dừng)</label>
      <span class="grow"></span>
      ${p.id ? '<button type="button" class="btn ghost sm" data-bp-cancel>Hủy</button>' : ''}
      <button type="submit" class="btn primary sm">${p.id ? 'Lưu' : 'Thêm ngân sách'}</button>
    </form>`;
  }
  function row(p) {
    const w = Math.min(100, p.pct);
    return `<tr class="lv-${p.level}">
      <td>${p.scope === 'project' ? 'Dự án' : 'Agent'}</td>
      <td><b>${esc(targetName(p))}</b></td>
      <td>${KY[p.period]}</td>
      <td class="bp-use"><div class="bp-bar"><i style="width:${w}%"></i><s style="left:${p.softPct}%"></s></div><small>${C.fmt(p.used)} / ${C.fmt(p.tokens)} · ${Math.round(p.pct)}%</small></td>
      <td>${p.softPct}%</td>
      <td>${p.hard ? 'Tạm dừng' : 'Chỉ cảnh báo'}</td>
      <td class="bp-act"><button class="btn ghost sm" data-bp-edit="${esc(p.id)}">Sửa</button><button class="btn ghost sm danger" data-bp-del="${esc(p.id)}">Xóa</button></td></tr>`;
  }
  async function load() {
    try {
      B.list = (await C.api('/api/budgets')).policies || [];
    } catch (e) {
      B.err = e.message;
    }
  }
  function draw() {
    const el = $('#budget-policies');
    if (!el) return;
    const ed = B.list.find((p) => p.id === B.edit);
    el.innerHTML = `<div class="card-head"><h2>Ngân sách theo dự án / agent</h2></div>
      <p class="bp-note">Cộng dồn token của mọi nhiệm vụ trong kỳ. Qua ngưỡng mềm thì cảnh báo; chạm 100% với trần cứng thì nhiệm vụ tạm dừng trước lượt gọi model kế tiếp.</p>
      ${
        B.list.length
          ? `<table class="tbl bp-tbl"><thead><tr><th>Phạm vi</th><th>Áp dụng cho</th><th>Kỳ</th><th>Đã dùng</th><th>Mềm</th><th>Khi chạm trần</th><th></th></tr></thead><tbody>${B.list.map(row).join('')}</tbody></table>`
          : '<div class="empty-row">Chưa có ngân sách nào. Thêm một ngân sách cho dự án hoặc agent bên dưới.</div>'
      }
      ${form(ed || {})}`;
    bind(el);
  }
  function bind(el) {
    const f = $('[data-bp-form]', el);
    f.scope.onchange = () => (f.target.innerHTML = targets(f.scope.value));
    $('[data-bp-cancel]', f)?.addEventListener('click', () => ((B.edit = null), draw()));
    f.onsubmit = async (e) => {
      e.preventDefault();
      const body = { id: B.edit || undefined, scope: f.scope.value, target: f.target.value, period: f.period.value, tokens: Number(f.tokens.value), softPct: Number(f.softPct.value), hard: f.hard.checked };
      try {
        await C.api('/api/budgets', { method: 'POST', body: JSON.stringify(body) });
        C.toast({ level: 'info', title: 'Đã lưu ngân sách', msg: `${body.scope === 'project' ? 'Dự án' : 'Agent'} ${body.target}` });
        B.edit = null;
        await load();
        draw();
      } catch (err) {
        C.toast({ level: 'error', title: 'Không lưu được', msg: err.message });
      }
    };
    el.querySelectorAll('[data-bp-edit]').forEach((b) => (b.onclick = () => ((B.edit = b.dataset.bpEdit), draw(), $('[data-bp-form] [name=tokens]', el)?.focus())));
    el.querySelectorAll('[data-bp-del]').forEach(
      (b) =>
        (b.onclick = async () => {
          const p = B.list.find((x) => x.id === b.dataset.bpDel);
          if (!p || !confirm(`Xóa ngân sách ${KY[p.period].toLowerCase()} của ${targetName(p)}?`)) return;
          try {
            await C.api(`/api/budgets/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
            await load();
            draw();
          } catch (err) {
            C.toast({ level: 'error', title: 'Không xóa được', msg: err.message });
          }
        }),
    );
  }
  window.Budgets = {
    async render() {
      C = window.CC;
      if (!C) return;
      await load();
      draw();
    },
  };
})();
