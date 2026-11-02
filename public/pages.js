// UX-4d: các trang mới trên cột trái — 🛡 Kiểm toán, 📦 Sản phẩm, 🧩 Kỹ năng & Kết nối, 🔁 Việc định kỳ.
// Mỗi trang có đường dẫn riêng (#/audit, #/artifacts, #/skills, #/routines) và API riêng (/api/audit, /api/artifacts,
// /api/skills, /api/routines). Dùng cầu nối window.CC (app.js) và Director.modal cho form.
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  let C = null;
  const esc = (s) => C.esc(s);
  const P = { audit: { cat: '', q: '', rows: [], more: true }, art: { kind: '', project: '', agent: '', q: '', sel: null }, skills: { q: '' } };
  const TABS = ['audit', 'artifacts', 'skills', 'routines'];

  const rel = (iso) => {
    const ms = Date.now() - Date.parse(iso);
    if (!(ms >= -60000)) return C.dateTime(iso);
    const m = Math.round(ms / 60000);
    if (m < 1) return 'vừa xong';
    if (m < 60) return `${m} phút trước`;
    const h = Math.round(m / 60);
    return h < 24 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước`;
  };
  const until = (iso) => {
    const ms = Date.parse(iso) - Date.now();
    if (!(ms > 0)) return 'tới giờ';
    const m = Math.round(ms / 60000);
    if (m < 60) return `${m} phút nữa`;
    const h = Math.round(m / 60);
    return h < 48 ? `${h} giờ nữa` : `${Math.round(h / 24)} ngày nữa`;
  };
  const taskLink = (id, seq) => {
    const t = C.S.tasks.get(id);
    const code = t ? C.code(t) : seq ? `${C.S.prefix || 'CC'}-${seq}` : id;
    return `<a class="tref" href="#/task/${esc(code)}" data-task="${esc(id)}"${t ? ` title="${esc(t.title)}"` : ''}>${esc(code)}</a>`;
  };
  const who = (actor) => (actor === 'director' ? '<span class="pg-who">👤 Giám đốc</span>' : actor === 'system' ? '<span class="pg-who sys">⚙ Hệ thống</span>' : `<span class="pg-who">${C.av(actor, 'av xs')} ${esc(C.agentName(actor))}</span>`);
  const size = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n || 0} B`);
  const box = (tab) => $(`#${tab}-view`);
  const loading = (el) => (el.innerHTML = '<div class="empty">Đang tải…</div>');
  const fail = (el, e) => (el.innerHTML = `<div class="empty">${esc(e.message)}</div>`);

  // ── 🛡 Kiểm toán ───────────────────────────────────────────────────────────
  async function renderAudit(append) {
    const el = box('audit');
    if (!el) return;
    const st = P.audit;
    if (!append) loading(el);
    try {
      const q = new URLSearchParams({ limit: '200' });
      if (st.cat) q.set('cat', st.cat);
      if (st.q) q.set('q', st.q);
      if (append && st.rows.length) q.set('before', st.rows.at(-1).ts);
      const d = await C.api(`/api/audit?${q}`);
      st.rows = append ? [...st.rows, ...d.rows] : d.rows;
      st.more = d.rows.length >= 200;
      st.meta = d;
    } catch (e) {
      return fail(el, e);
    }
    const d = st.meta;
    const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
    el.innerHTML = `<div class="dv-head"><h1>🛡 Kiểm toán</h1><button type="button" class="btn ghost sm" data-verify title="Đọc lại toàn bộ nhật ký hệ thống và kiểm chuỗi băm (phát hiện dòng bị sửa/xóa)">🔗 Kiểm chuỗi băm</button></div>
      <p class="pg-sub">Ai làm gì, lúc nào: giao/hủy/tiếp tục nhiệm vụ, duyệt kế hoạch và kết quả, đẩy nhánh, cấu hình dự án, góp ý agent, việc định kỳ, tải tệp, lệnh bị chặn. Đọc từ nhật ký hệ thống có chuỗi băm.</p>
      <div class="pg-verify" hidden></div>
      <div class="dv-toolbar"><div class="chips">${[['', 'Tất cả', total], ...Object.entries(d.cats).map(([k, l]) => [k, l, d.counts[k] || 0])]
        .map(([k, l, n]) => `<button type="button" data-cat="${esc(k)}" class="${st.cat === k ? 'on' : ''}">${esc(l)} <em>${n || ''}</em></button>`)
        .join('')}</div><span class="grow"></span><input type="search" class="pg-q" data-q placeholder="Lọc theo nội dung, mã nhiệm vụ…" value="${esc(st.q)}" aria-label="Lọc nhật ký kiểm toán" /></div>
      ${
        st.rows.length
          ? `<div class="pg-tbl-wrap"><table class="pg-tbl"><thead><tr><th>Thời gian</th><th>Ai</th><th>Hành động</th><th>Nội dung</th><th>Nhiệm vụ</th></tr></thead><tbody>${st.rows
              .map(
                (r) => `<tr class="lv-${esc(r.level)}"><td title="${esc(new Date(r.ts).toLocaleString('vi-VN'))}">${esc(C.dateTime(r.ts))}</td><td>${who(r.actor)}</td><td><span class="pg-cat c-${esc(r.cat)}">${esc(r.label)}</span></td><td class="pg-msg">${esc(r.msg)}</td><td>${r.taskId ? taskLink(r.taskId) : r.projectId ? `<small>📁 ${esc(r.projectId)}</small>` : ''}</td></tr>`,
              )
              .join('')}</tbody></table></div>${st.more ? '<div class="pg-more"><button type="button" class="btn ghost sm" data-more>Xem thêm cũ hơn</button></div>' : ''}`
          : '<div class="empty">Chưa có sự kiện nào khớp.</div>'
      }`;
    $$('[data-cat]', el).forEach((b) => (b.onclick = () => ((st.cat = b.dataset.cat), renderAudit())));
    const q = $('[data-q]', el);
    q.onkeydown = (e) => e.key === 'Enter' && ((st.q = q.value.trim()), renderAudit());
    q.onsearch = () => ((st.q = q.value.trim()), renderAudit());
    const more = $('[data-more]', el);
    if (more) more.onclick = () => renderAudit(true);
    $('[data-verify]', el).onclick = async () => {
      const v = $('.pg-verify', el);
      v.hidden = false;
      v.className = 'pg-verify';
      v.textContent = 'Đang kiểm chuỗi băm…';
      try {
        const r = await C.api('/api/audit/verify');
        v.className = `pg-verify ${r.ok ? 'ok' : 'bad'}`;
        v.innerHTML = r.ok
          ? `✓ Chuỗi băm toàn vẹn: <b>${C.fmt(r.lines)}</b> dòng trong <code>${esc(r.file)}</code> — không dòng nào bị sửa hay xóa giữa chừng.`
          : `✗ Chuỗi băm hỏng tại dòng <b>${C.fmt(r.brokenAt)}</b> / ${C.fmt(r.lines)} (${esc(r.reason || '')}) trong <code>${esc(r.file)}</code> — nhật ký đã bị sửa từ dòng này.`;
      } catch (e) {
        v.className = 'pg-verify bad';
        v.textContent = e.message;
      }
    };
  }

  // ── 📦 Sản phẩm ────────────────────────────────────────────────────────────
  const KIND = { report: ['📄', 'Báo cáo'], output: ['🧩', 'Sản phẩm hạng mục'], acceptance: ['✅', 'Nghiệm thu'], code: ['🧬', 'Thay đổi mã'] };
  async function renderArtifacts() {
    const el = box('artifacts');
    if (!el) return;
    const st = P.art;
    loading(el);
    let d;
    try {
      const q = new URLSearchParams({ limit: '400' });
      for (const k of ['kind', 'project', 'agent', 'q']) if (st[k]) q.set(k, st[k]);
      d = await C.api(`/api/artifacts?${q}`);
    } catch (e) {
      return fail(el, e);
    }
    st.items = d.items;
    const agents = [...C.S.agents.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    el.innerHTML = `<div class="dv-head"><h1>📦 Sản phẩm</h1><small class="pg-n">${d.total} mục</small></div>
      <p class="pg-sub">Mọi thứ agent làm ra: báo cáo tổng hợp, sản phẩm từng hạng mục, kết luận nghiệm thu của CTO, thay đổi mã trên nhánh git.</p>
      <div class="dv-toolbar"><div class="chips">${[['', 'Tất cả'], ...Object.entries(KIND).map(([k, [i, l]]) => [k, `${i} ${l}`])]
        .map(([k, l]) => `<button type="button" data-kind="${esc(k)}" class="${st.kind === k ? 'on' : ''}">${esc(l)}</button>`)
        .join('')}</div><span class="grow"></span>
        <select data-proj aria-label="Dự án"><option value="">Mọi dự án</option><option value="_none"${st.project === '_none' ? ' selected' : ''}>Ngoài dự án</option>${C.S.projects.map((p) => `<option value="${esc(p.id)}"${st.project === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        <select data-agent aria-label="Agent"><option value="">Mọi agent</option>${agents.map((a) => `<option value="${esc(a.id)}"${st.agent === a.id ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
        <input type="search" class="pg-q" data-q placeholder="Tìm tên, nhiệm vụ…" value="${esc(st.q)}" aria-label="Tìm sản phẩm" /></div>
      <div class="art-wrap"><div class="art-list" role="list">${
        d.items.length
          ? d.items
              .map((a, i) => {
                const [ic, kl] = KIND[a.kind] || ['•', a.kind];
                return `<button type="button" class="art-card${st.sel === i ? ' on' : ''}" data-i="${i}" role="listitem"><span class="art-ic" title="${esc(kl)}">${ic}</span><span class="art-m"><b>${esc(a.name)}</b><small>${esc(a.seq ? `${C.S.prefix || 'CC'}-${a.seq}` : a.taskId)} · ${esc(a.task)}</small><small>${a.agent ? `${esc(C.agentName(a.agent))} · ` : ''}${a.size != null ? `${size(a.size)} · ` : ''}${esc(rel(a.at))}</small></span></button>`;
              })
              .join('')
          : '<div class="empty">Chưa có sản phẩm nào khớp.</div>'
      }</div><section class="art-pv" aria-label="Xem trước">${st.sel != null && d.items[st.sel] ? '' : '<div class="empty">Chọn một mục để xem trước.</div>'}</section></div>`;
    $$('[data-kind]', el).forEach((b) => (b.onclick = () => ((st.kind = b.dataset.kind), (st.sel = null), renderArtifacts())));
    $('[data-proj]', el).onchange = (e) => ((st.project = e.target.value), (st.sel = null), renderArtifacts());
    $('[data-agent]', el).onchange = (e) => ((st.agent = e.target.value), (st.sel = null), renderArtifacts());
    const q = $('[data-q]', el);
    q.onkeydown = (e) => e.key === 'Enter' && ((st.q = q.value.trim()), (st.sel = null), renderArtifacts());
    q.onsearch = () => ((st.q = q.value.trim()), (st.sel = null), renderArtifacts());
    $$('.art-card', el).forEach((b) => (b.onclick = () => preview(el, Number(b.dataset.i))));
    if (st.sel != null && d.items[st.sel]) preview(el, st.sel);
  }
  async function preview(el, i) {
    const st = P.art;
    const a = st.items[i];
    if (!a) return;
    st.sel = i;
    $$('.art-card', el).forEach((b) => b.classList.toggle('on', Number(b.dataset.i) === i));
    const pv = $('.art-pv', el);
    const head = `<div class="art-pvh"><div><b>${esc(a.name)}</b><small>${taskLink(a.taskId, a.seq)} · ${esc(a.task)}${a.projectId ? ` · 📁 ${esc(a.projectId)}` : ''}</small></div><div class="pb-actions">${
      a.kind === 'code' ? '<button type="button" class="btn ghost sm" data-diff>🧬 Xem thay đổi</button>' : '<button type="button" class="btn ghost sm" data-dl>⬇ Tải xuống</button>'
    }<button type="button" class="btn ghost sm" data-open>📋 Trang nhiệm vụ</button></div></div>`;
    if (a.kind === 'code') {
      pv.innerHTML = `${head}<div class="md"><p>Nhánh <code>${esc(a.branch)}</code>${a.commit ? ` · commit <code>${esc(String(a.commit).slice(0, 12))}</code>` : ''}</p>${a.summary ? `<p>${esc(a.summary)}</p>` : ''}</div>`;
    } else {
      pv.innerHTML = `${head}<div class="empty">Đang tải…</div>`;
      try {
        const text = await C.api(`/api/tasks/${encodeURIComponent(a.taskId)}/file?path=${encodeURIComponent(a.path)}`);
        if (st.sel !== i) return;
        a.text = typeof text === 'string' ? text : JSON.stringify(text, null, 2);
        pv.innerHTML = `${head}<div class="md art-md">${C.md(a.text.replace(/^<!--[\s\S]*?-->\s*/, ''))}</div>`;
      } catch (e) {
        pv.innerHTML = `${head}<div class="empty">${esc(e.message)}</div>`;
      }
    }
    const open = $('[data-open]', pv);
    if (open) open.onclick = () => C.openTask(a.taskId);
    const diff = $('[data-diff]', pv);
    if (diff) diff.onclick = () => C.openTask(a.taskId, 'diff');
    const dl = $('[data-dl]', pv);
    if (dl)
      dl.onclick = () => {
        if (a.text == null) return;
        const name = `${a.seq ? `${C.S.prefix || 'CC'}-${a.seq}` : a.taskId}-${a.path.split('/').pop()}`;
        const url = URL.createObjectURL(new Blob([a.text], { type: 'text/markdown;charset=utf-8' }));
        const x = document.createElement('a');
        x.href = url;
        x.download = name;
        document.body.appendChild(x);
        x.click();
        x.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      };
  }

  // ── 🧩 Kỹ năng & Kết nối ───────────────────────────────────────────────────
  const TOOL_VI = {
    Read: ['Đọc tệp', 'đọc'],
    Glob: ['Liệt kê tệp', 'đọc'],
    Grep: ['Tìm trong tệp', 'đọc'],
    Write: ['Ghi tệp', 'ghi'],
    Edit: ['Sửa tệp', 'ghi'],
    Bash: ['Chạy lệnh (test, typecheck, migration)', 'chạy lệnh'],
    WebSearch: ['Tìm web, bài báo (OpenAlex)', 'web'],
    WebFetch: ['Đọc trang web công khai', 'web'],
  };
  const ACCESS_VI = { none: 'không công cụ', read: 'chỉ đọc', write: 'đọc/ghi tệp', exec: 'đọc/ghi + chạy lệnh' };
  async function renderSkills() {
    const el = box('skills');
    if (!el) return;
    loading(el);
    let d;
    try {
      d = await C.api('/api/skills');
    } catch (e) {
      return fail(el, e);
    }
    const st = P.skills;
    const avs = (ids, max = 8) => `<span class="pg-avs">${ids.slice(0, max).map((id) => `<button type="button" class="pg-av" data-agent="${esc(id)}" title="${esc(C.agentName(id))}">${C.av(id, 'av xs')}</button>`).join('')}${ids.length > max ? `<small>+${ids.length - max}</small>` : ''}</span>`;
    const skills = d.skills.filter((s) => !st.q || s.name.includes(st.q.toLowerCase()) || s.agents.some((id) => C.agentName(id).toLowerCase().includes(st.q.toLowerCase())));
    const CLS = Object.entries(C.CLS_VI);
    el.innerHTML = `<div class="dv-head"><h1>🧩 Kỹ năng & Kết nối</h1></div>
      <p class="pg-sub">Kỹ năng khai báo trong hồ sơ từng agent (trưởng phòng dựa vào đây để giao việc), công cụ agent được dùng, và các kết nối của văn phòng: runtime chạy model, dự án git, herdr.</p>
      <section class="pg-sec"><div class="sec-head"><h2>Kỹ năng <small>${d.skills.length}</small></h2><input type="search" class="pg-q" data-q placeholder="Lọc kỹ năng hoặc agent…" value="${esc(st.q)}" aria-label="Lọc kỹ năng" /></div>
        <div class="sk-grid">${skills.map((s) => `<div class="sk-item"><code>${esc(s.name)}</code>${avs(s.agents, 6)}</div>`).join('') || '<div class="empty">Không có kỹ năng nào khớp.</div>'}</div></section>
      <section class="pg-sec"><div class="sec-head"><h2>Công cụ của agent</h2></div>
        <p class="pg-sub">Quyền mặc định: <b>${esc(ACCESS_VI[d.access.default] || d.access.default)}</b> · trong dự án: <b>${esc(ACCESS_VI[d.access.project] || d.access.project)}</b> · tra cứu web: <b>${d.access.web ? 'bật (chỉ dữ liệu Công khai/Nội bộ)' : 'tắt'}</b>${d.access.deny ? ` · ${d.access.deny} mẫu lệnh cấm thêm` : ''}. Pha lập kế hoạch/review/tổng hợp/nghiệm thu chỉ có công cụ đọc.</p>
        <table class="pg-tbl"><thead><tr><th>Công cụ</th><th>Loại</th><th>Agent được dùng</th></tr></thead><tbody>${d.tools
          .map((t) => `<tr><td><b>${esc((TOOL_VI[t.name] || [t.name])[0])}</b> <code>${esc(t.name)}</code></td><td><span class="pg-cat">${esc((TOOL_VI[t.name] || ['', '—'])[1])}</span></td><td>${avs(t.agents, 14)} <small>${t.agents.length}</small></td></tr>`)
          .join('')}</tbody></table></section>
      <section class="pg-sec"><div class="sec-head"><h2>Kết nối</h2><button type="button" class="btn ghost sm" data-quota>⛽ Hạn mức chi tiết</button></div>
        <div class="cn-grid">${d.runtimes
          .map(
            (r) => `<div class="cn-card${r.ok ? '' : ' off'}"><div class="cn-h"><b>${r.ok ? '●' : '○'} ${esc(r.id)}</b>${r.inOrder ? '<span class="pg-cat">trong thứ tự chạy</span>' : ''}</div><small>${esc(r.detail || '')}</small><div class="cn-cls">${CLS.map(([k, l]) => `<span class="${r.allowed[k] ? 'ok' : 'no'}" title="${r.allowed[k] ? 'Được xử lý' : 'Không được xử lý'} dữ liệu ${esc(l)}">${r.allowed[k] ? '✓' : '✗'} ${esc(l)}</span>`).join('')}</div></div>`,
          )
          .join('')}
          ${d.projects
            .map((p) => `<div class="cn-card"><div class="cn-h"><b>📁 ${esc(p.name)}</b>${p.workspace ? '<span class="pg-cat">git</span>' : ''}</div><small>${p.baseRef ? `nhánh xuất phát <code>${esc(p.baseRef)}</code> · ` : ''}${p.checks} lệnh kiểm tra${p.access ? ` · quyền ${esc(ACCESS_VI[p.access] || p.access)}` : ''}</small></div>`)
            .join('')}
          <div class="cn-card${d.herdr.inside ? '' : ' off'}"><div class="cn-h"><b>${d.herdr.inside ? '●' : '○'} herdr</b></div><small>phiên <code>${esc(d.herdr.session)}</code>${d.herdr.inside ? ' · server đang chạy trong herdr' : ' · không chạy trong herdr'}</small></div></div></section>`;
    const q = $('[data-q]', el);
    q.oninput = () => {
      st.q = q.value.trim();
      clearTimeout(P.skT);
      P.skT = setTimeout(() => renderSkills().then(() => $('[data-q]', box('skills'))?.focus()), 250);
    };
    $$('[data-agent]', el).forEach((b) => (b.onclick = () => C.openAgent(b.dataset.agent)));
    $('[data-quota]', el).onclick = () => C.setTab('quota');
  }

  // ── 🔁 Việc định kỳ ────────────────────────────────────────────────────────
  const DAYS = [
    [1, 'T2'],
    [2, 'T3'],
    [3, 'T4'],
    [4, 'T5'],
    [5, 'T6'],
    [6, 'T7'],
    [0, 'CN'],
  ];
  async function renderRoutines() {
    const el = box('routines');
    if (!el) return;
    loading(el);
    let list;
    try {
      list = await C.api('/api/routines');
    } catch (e) {
      return fail(el, e);
    }
    P.routines = list;
    const mode = (r) => {
      const t = r.template;
      if (t.mode === 'department') return `Phòng ${C.deptShort(t.department)}`;
      if (t.mode === 'project') return `📁 ${(C.S.projects.find((p) => p.id === t.projectId) || {}).name || t.projectId}`;
      if (t.mode === 'agent') return `📌 ${C.agentName(t.agentId)}`;
      return C.MODE_VI[t.mode] || t.mode;
    };
    el.innerHTML = `<div class="dv-head"><h1>🔁 Việc định kỳ</h1><button type="button" class="btn primary sm" data-rt-new>＋ Việc định kỳ mới</button></div>
      <p class="pg-sub">Giao lại một nhiệm vụ mẫu theo lịch (giờ của máy chạy CCoding). Lần trước chưa xong thì bỏ qua lần này; server tắt lỡ lịch quá 6 giờ thì bỏ qua tới lịch kế tiếp. Mỗi lần chạy là một nhiệm vụ bình thường (token, ngân sách, nhãn dữ liệu, nghiệm thu như giao tay).</p>
      ${
        list.length
          ? `<div class="rt-list">${list
              .map(
                (r) => `<div class="rt-row${r.enabled ? '' : ' off'}" data-id="${esc(r.id)}">
                <label class="rt-sw" title="${r.enabled ? 'Đang bật — bấm để tắt' : 'Đang tắt — bấm để bật'}"><input type="checkbox" data-toggle ${r.enabled ? 'checked' : ''} aria-label="Bật/tắt ${esc(r.name)}" /><i></i></label>
                <div class="rt-m"><b>${esc(r.name)}</b><small>${esc(r.scheduleText)} · ${esc(mode(r))}${r.template.title && r.template.title !== r.name ? ` · ${esc(r.template.title)}` : ''}</small>
                  <small>${r.enabled && r.nextRunAt ? `⏭ lần tới ${esc(C.dateTime(r.nextRunAt))} (${esc(until(r.nextRunAt))})` : 'đang tắt'}${r.lastRunAt ? ` · lần trước ${esc(rel(r.lastRunAt))}${r.lastTask ? ` → ${taskLink(r.lastTask.id, r.lastTask.seq)} <span class="status ${esc(r.lastTask.status)}">${esc(C.TASK_VI[r.lastTask.status] || r.lastTask.status)}</span>` : ''}` : ''}</small>
                  ${r.lastSkip ? `<small class="rt-skip">⚠ ${esc(rel(r.lastSkip.at))}: ${esc(r.lastSkip.reason)}</small>` : ''}</div>
                <div class="pb-actions"><button type="button" class="btn ghost sm" data-run title="Giao nhiệm vụ từ mẫu ngay bây giờ">▶ Chạy ngay</button><button type="button" class="btn ghost sm" data-edit>✎ Sửa</button><button type="button" class="btn ghost sm danger" data-del>🗑</button></div></div>`,
              )
              .join('')}</div>`
          : '<div class="empty">Chưa có việc định kỳ nào. Bấm <b>＋ Việc định kỳ mới</b>, hoặc chuột phải một nhiệm vụ → <b>Lặp lại định kỳ…</b></div>'
      }`;
    $('[data-rt-new]', el).onclick = () => P.editRoutine();
    $$('.rt-row', el).forEach((row) => {
      const r = list.find((x) => x.id === row.dataset.id);
      $('[data-toggle]', row).onchange = (e) => save(r.id, { enabled: e.target.checked }, e.target.checked ? 'Đã bật' : 'Đã tắt');
      $('[data-run]', row).onclick = async () => {
        try {
          const x = await C.api(`/api/routines/${encodeURIComponent(r.id)}/run`, { method: 'POST', body: '{}' });
          C.toast({ level: 'info', title: `Đã giao "${r.name}"`, msg: x.taskId });
          renderRoutines();
        } catch (e) {
          C.toast({ level: 'warn', title: 'Không chạy được', msg: e.message });
        }
      };
      $('[data-edit]', row).onclick = () => P.editRoutine(r);
      $('[data-del]', row).onclick = async () => {
        if (!confirm(`Xóa việc định kỳ "${r.name}"? Các nhiệm vụ đã giao vẫn giữ nguyên.`)) return;
        try {
          await C.api(`/api/routines/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
          renderRoutines();
        } catch (e) {
          C.toast({ level: 'error', title: 'Không xóa được', msg: e.message });
        }
      };
    });
  }
  async function save(id, body, ok) {
    try {
      await C.api(`/api/routines${id ? `/${encodeURIComponent(id)}` : ''}`, { method: 'POST', body: JSON.stringify(body) });
      if (ok) C.toast({ level: 'info', title: ok, msg: '' });
      if (C.S.tab === 'routines') renderRoutines();
      return true;
    } catch (e) {
      C.toast({ level: 'error', title: 'Không lưu được', msg: e.message });
      return false;
    }
  }
  /** Form tạo/sửa việc định kỳ; `r` có id = sửa, không có = tạo mới (có thể soạn sẵn từ một nhiệm vụ). */
  P.editRoutine = (r = {}) => {
    const s = r.schedule || { kind: 'daily', time: '08:00', days: [1, 2, 3, 4, 5], everyHours: 6 };
    const t = r.template || { mode: 'auto', options: {} };
    const o = t.options || {};
    const sel = (v, x) => (v === x ? ' selected' : '');
    const depts = C.S.departments.map((d) => `<option value="${esc(d.id)}"${sel(t.department, d.id)}>${esc(d.name)}</option>`).join('');
    const projs = C.S.projects.map((p) => `<option value="${esc(p.id)}"${sel(t.projectId, p.id)}>${esc(p.name)}</option>`).join('');
    const workers = [...C.S.agents.values()].filter((a) => C.S.departments.some((d) => d.id === a.department)).map((a) => `<option value="${esc(a.id)}"${sel(t.agentId, a.id)}>${esc(a.name)}</option>`).join('');
    window.Director.modal({
      title: r.id ? '✎ Sửa việc định kỳ' : '🔁 Việc định kỳ mới',
      wide: true,
      body: `<form class="form rt-form">
        <div class="grid2"><label>Tên<input name="name" required maxlength="120" value="${esc(r.name || '')}" placeholder="vd. Tổng hợp tin buổi sáng" /></label>
          <label>Lịch<select name="kind"><option value="daily"${sel(s.kind, 'daily')}>Hằng ngày</option><option value="weekly"${sel(s.kind, 'weekly')}>Theo thứ trong tuần</option><option value="interval"${sel(s.kind, 'interval')}>Mỗi N giờ</option></select></label></div>
        <div class="grid2 rt-when"><label data-k="time">Giờ chạy<input type="time" name="time" value="${esc(s.time || '08:00')}" /></label>
          <label data-k="interval">Mỗi (giờ)<input type="number" name="everyHours" min="1" max="168" value="${esc(s.everyHours || 6)}" /></label></div>
        <fieldset class="rt-days" data-k="weekly"><legend>Các thứ</legend>${DAYS.map(([v, l]) => `<label class="check"><input type="checkbox" name="day" value="${v}"${(s.days || []).includes(v) ? ' checked' : ''} /> ${l}</label>`).join('')}</fieldset>
        <div class="grid2"><label>Giao cho<select name="mode">${['auto', 'department', 'project', 'joint', 'agent'].map((m) => `<option value="${m}"${sel(t.mode || 'auto', m)}>${esc(C.MODE_VI[m] || m)}</option>`).join('')}</select></label>
          <label data-m="department">Phòng ban<select name="department">${depts}</select></label>
          <label data-m="project">Dự án<select name="projectId"><option value="">— Không gắn dự án —</option>${projs}</select></label>
          <label data-m="agent">Agent<select name="agentId">${workers}</select></label></div>
        <label>Tiêu đề nhiệm vụ <small>(để trống: dùng tên)</small><input name="title" maxlength="120" value="${esc(t.title || '')}" /></label>
        <label>Nội dung nhiệm vụ mẫu<textarea name="brief" rows="5" required placeholder="Mục tiêu, phạm vi, tiêu chí hoàn thành — giao lại y nguyên mỗi lần chạy">${esc(t.brief || '')}</textarea></label>
        <div class="grid2"><label>Ngân sách token <small>(để trống: mặc định)</small><input type="number" name="budgetTokens" min="1000" step="1000" value="${esc(o.budgetTokens || '')}" /></label>
          <label>Vòng họp<select name="discussionRounds"><option value="">Mặc định</option>${[0, 1, 2, 3].map((n) => `<option value="${n}"${o.discussionRounds === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
        <div class="rt-opts"><label class="check"><input type="checkbox" name="review"${o.review === false ? '' : ' checked'} /> Review</label><label class="check"><input type="checkbox" name="acceptance"${o.acceptance === false ? '' : ' checked'} /> CTO nghiệm thu</label><label class="check"><input type="checkbox" name="enabled"${r.enabled === false ? '' : ' checked'} /> Bật</label></div>
        <p class="form-msg" data-msg></p>
        <div class="pb-actions"><button type="submit" class="btn primary sm">${r.id ? 'Lưu' : 'Tạo việc định kỳ'}</button><button type="button" class="btn ghost sm" data-cancel>Hủy</button></div></form>`,
      onMount: (el, close) => {
        const f = $('form', el);
        const sync = () => {
          const k = f.kind.value;
          $('[data-k="time"]', f).hidden = k === 'interval';
          $('[data-k="interval"]', f).hidden = k !== 'interval';
          $('[data-k="weekly"]', f).hidden = k !== 'weekly';
          for (const m of ['department', 'project', 'agent']) $(`[data-m="${m}"]`, f).hidden = f.mode.value !== m && !(m === 'project' && f.mode.value === 'agent');
        };
        f.kind.onchange = sync;
        f.mode.onchange = sync;
        sync();
        $('[data-cancel]', f).onclick = close;
        f.onsubmit = async (e) => {
          e.preventDefault();
          const k = f.kind.value;
          const options = { review: f.review.checked, acceptance: f.acceptance.checked };
          if (f.budgetTokens.value) options.budgetTokens = Number(f.budgetTokens.value);
          if (f.discussionRounds.value !== '') options.discussionRounds = Number(f.discussionRounds.value);
          const body = {
            name: f.name.value,
            enabled: f.enabled.checked,
            schedule: { kind: k, time: f.time.value, everyHours: Number(f.everyHours.value), days: $$('[name=day]:checked', f).map((x) => Number(x.value)) },
            template: { brief: f.brief.value, title: f.title.value, mode: f.mode.value, department: f.department.value, projectId: f.projectId.value, agentId: f.agentId.value, options },
          };
          try {
            await C.api(`/api/routines${r.id ? `/${encodeURIComponent(r.id)}` : ''}`, { method: 'POST', body: JSON.stringify(body) });
            close();
            C.toast({ level: 'info', title: r.id ? 'Đã lưu việc định kỳ' : 'Đã tạo việc định kỳ', msg: body.name });
            if (C.S.tab === 'routines') renderRoutines();
            else C.setTab('routines');
          } catch (err) {
            $('[data-msg]', f).textContent = err.message;
            $('[data-msg]', f).className = 'form-msg err';
          }
        };
      },
    });
  };
  /** Soạn sẵn việc định kỳ từ một nhiệm vụ (menu chuột phải "Lặp lại định kỳ…"). */
  P.routineFromTask = (t) =>
    P.editRoutine({
      name: t.title,
      template: { brief: (t.brief || '').split('\n\n---\nTiếp nối nhiệm vụ')[0], title: t.title, mode: t.mode === 'joint' || t.mode === 'auto' ? t.mode : t.mode, department: t.department, projectId: t.projectId, agentId: t.agentId, options: { review: t.options?.review, acceptance: t.options?.acceptance } },
    });

  P.render = (tab) => {
    if (!C || !TABS.includes(tab)) return;
    if (tab === 'audit') return renderAudit();
    if (tab === 'artifacts') return renderArtifacts();
    if (tab === 'skills') return renderSkills();
    if (tab === 'routines') return renderRoutines();
  };
  P.tabs = TABS;
  P.init = () => {
    C = window.CC;
  };
  window.Pages = P;
})();
