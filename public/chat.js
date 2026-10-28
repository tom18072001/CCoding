// Màn "Prompt" kiểu ứng dụng Claude: cột hội thoại (lọc theo dự án) | luồng hội thoại + ô trả lời | ô phải (Văn phòng / Xem trước).
// Một hội thoại = chuỗi nhiệm vụ nối nhau bằng followUpOf. Trả lời khi việc còn chạy = chỉ dẫn bổ sung (notes);
// khi đã kết thúc = giao nhiệm vụ tiếp nối (kế thừa dự án/chế độ/agent, báo cáo trước làm đầu vào).
// Dùng cầu nối window.CC (app.js), window.Drive (drive.js), window.Director (director.js).
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  let C = null;
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(`ccoding.${k}`);
        return v === null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(`ccoding.${k}`, JSON.stringify(v));
      } catch {}
    },
  };
  const V = {
    conv: store.get('chat.conv', null), // id một nhiệm vụ bất kỳ trong chuỗi đang mở
    q: '',
    scope: store.get('chat.scope', ''),
    data: new Map(), // taskId → { task, transcript, outputs }
    finals: new Map(), // taskId → nội dung FINAL.md
    open: {}, // trạng thái mở/đóng của các khối "trao đổi"
    stick: false,
  };
  const K = {};
  const NONE = '__none';
  const esc = (s) => C.esc(s);
  const tasks = () => [...C.S.tasks.values()];
  const live = (t) => !!t && ['running', 'queued', 'paused'].includes(t.status);
  const active = (t) => !!t && (t.status === 'running' || t.status === 'queued');
  const updated = (t) => t.updatedAt || t.createdAt;
  const projName = (id) => (id ? C.S.projects.find((p) => p.id === id)?.name || id : 'Ngoài dự án');
  const who = (t) => (t.mode === 'agent' && t.agentId ? `📌 ${C.agentName(t.agentId)}` : C.MODE_VI[t.mode] || t.mode);
  const SUB_DOT = { pending: 'queued', running: 'running', done: 'done', failed: 'failed', skipped: 'cancelled' };
  const dot = (status, att, title) => `<span class="sdot s-${esc(SUB_DOT[status] || status)}${att ? ' att' : ''}"${title ? ` title="${esc(title)}"` : ''}></span>`;
  const timers = new Map();
  function later(key, fn, ms) {
    if (timers.has(key)) return;
    timers.set(key, setTimeout(() => (timers.delete(key), fn()), ms));
  }

  // ── Chuỗi hội thoại ──────────────────────────────────────────────────────
  function convs() {
    const all = tasks();
    const byId = new Map(all.map((t) => [t.id, t]));
    const kids = new Map();
    for (const t of all) {
      if (!t.followUpOf || !byId.has(t.followUpOf)) continue;
      if (!kids.has(t.followUpOf)) kids.set(t.followUpOf, []);
      kids.get(t.followUpOf).push(t);
    }
    // con mới nhất nối tiếp chuỗi; các con khác (giao tiếp nối nhiều lần từ một nhiệm vụ) thành hội thoại riêng
    const main = new Set();
    for (const l of kids.values()) {
      l.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      main.add(l[l.length - 1].id);
    }
    return all
      .filter((t) => !main.has(t.id))
      .map((root) => {
        const list = [root];
        let cur = root;
        while (kids.get(cur.id)?.length) {
          cur = kids.get(cur.id).at(-1);
          list.push(cur);
        }
        return { id: root.id, root, list, last: list.at(-1), upd: list.map(updated).sort().at(-1) };
      });
  }
  const convOf = (id) => (id ? convs().find((c) => c.list.some((t) => t.id === id)) : undefined);

  // ── Cột hội thoại ────────────────────────────────────────────────────────
  function bucket(iso) {
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = (day(new Date()) - day(new Date(iso))) / 864e5;
    return diff < 1 ? 'Hôm nay' : diff < 2 ? 'Hôm qua' : diff < 7 ? '7 ngày qua' : diff < 30 ? '30 ngày qua' : 'Cũ hơn';
  }
  function buildList() {
    const el = $('#cv-list');
    if (!el || el.dataset.built) return;
    el.dataset.built = '1';
    el.innerHTML = `<div class="cv-lhead"><b>💬 Hội thoại</b><button class="btn primary sm" data-cnew title="Cuộc mới">＋ Mới</button></div>
      <input type="search" class="cv-q" placeholder="Tìm hội thoại…" aria-label="Tìm hội thoại" />
      <select class="cv-scope" aria-label="Lọc theo dự án"></select>
      <div class="cv-items" role="list"></div>`;
    const q = $('.cv-q', el);
    q.oninput = () => ((V.q = q.value.trim()), renderList());
    const sc = $('.cv-scope', el);
    sc.onchange = () => ((V.scope = sc.value), store.set('chat.scope', V.scope), renderList());
    $('[data-cnew]', el).onclick = () => K.newConv();
  }
  function renderList() {
    const el = $('#cv-list');
    if (!el) return;
    buildList();
    const sc = $('.cv-scope', el);
    if (V.scope && V.scope !== NONE && !C.S.projects.some((p) => p.id === V.scope)) V.scope = '';
    sc.innerHTML = `<option value="">Mọi dự án</option>${C.S.projects.map((p) => `<option value="${esc(p.id)}">📁 ${esc(p.name)}</option>`).join('')}<option value="${NONE}">🗂 Ngoài dự án</option>`;
    sc.value = V.scope;
    const q = V.q.toLowerCase();
    let list = convs().filter((c) => (!V.scope ? true : V.scope === NONE ? !c.root.projectId : c.root.projectId === V.scope));
    if (q) list = list.filter((c) => c.list.some((t) => `${t.title} ${t.brief || ''} ${t.id}`.toLowerCase().includes(q)));
    list.sort((a, b) => b.upd.localeCompare(a.upd));
    const groups = [];
    const run = list.filter((c) => c.list.some(active));
    if (run.length) groups.push(['⚡ Đang chạy', run]);
    for (const c of list) {
      if (run.includes(c)) continue;
      const b = bucket(c.upd);
      let g = groups.find((x) => x[0] === b);
      if (!g) groups.push((g = [b, []]));
      g[1].push(c);
    }
    const cur = convOf(V.conv);
    const item = (c) => {
      const att = c.list.some((t) => t.attention || t.status === 'failed' || t.status === 'paused');
      return `<button class="cv-item${cur && cur.id === c.id ? ' sel' : ''}" data-c="${esc(c.id)}" role="listitem" title="${esc(c.root.title)} · ${esc(C.TASK_VI[c.last.status] || c.last.status)}">${dot(c.last.status, att)}<span class="cv-t">${esc(c.root.title)}</span>${c.list.length > 1 ? `<em title="${c.list.length} lượt giao việc trong hội thoại">↪${c.list.length - 1}</em>` : '<em></em>'}<small>${c.root.projectId ? `📁 ${esc(projName(c.root.projectId))} · ` : ''}${esc(C.dateTime(c.upd))}</small></button>`;
    };
    $('.cv-items', el).innerHTML =
      groups.map(([g, l]) => `<div class="cv-g">${esc(g)}</div>${l.map(item).join('')}`).join('') ||
      `<div class="cv-empty">${q || V.scope ? 'Không có hội thoại khớp.' : 'Chưa có hội thoại — viết yêu cầu đầu tiên ở khung giữa.'}</div>`;
    $$('[data-c]', el).forEach((b) => (b.onclick = () => K.open(b.dataset.c)));
  }

  // ── Dữ liệu một nhiệm vụ ─────────────────────────────────────────────────
  async function load(id, force) {
    let d = V.data.get(id);
    if (!d || force) {
      if (force) V.finals.delete(id);
      try {
        d = await C.api(`/api/tasks/${id}`);
        V.data.set(id, d);
      } catch {
        return null;
      }
    }
    const t = C.S.tasks.get(id) || d.task;
    d.task = t;
    if (t.status === 'done' && t.finalPath && !V.finals.has(id)) {
      try {
        const txt = await C.api(`/api/tasks/${id}/file?path=${encodeURIComponent(t.finalPath)}`);
        V.finals.set(id, typeof txt === 'string' ? txt : JSON.stringify(txt, null, 2));
      } catch {
        V.finals.set(id, '');
      }
    }
    return d;
  }

  // ── Luồng hội thoại ──────────────────────────────────────────────────────
  function userRow(t, i) {
    const chips = [who(t), t.projectId ? `📁 ${projName(t.projectId)}` : '', C.CLS_VI[t.classification] || ''].filter(Boolean).map(esc).join(' · ');
    const atts = (t.attachments || []).map((a) => `<button class="cv-chip" data-pv="${esc(a.textPath || a.path)}" data-tid="${esc(t.id)}" title="${esc(a.note || a.kind || '')}">📎 ${esc(a.name)}</button>`).join('');
    const long = (t.brief || '').length > 900;
    return `<div class="cv-row user"><div class="cv-ubub">${i ? `<small class="cv-fu">↪ tiếp nối · ${esc(t.id)}</small>` : ''}<div class="md${long ? ' clip' : ''}">${C.md(t.brief || '')}</div>${atts ? `<div class="cv-atts">${atts}</div>` : ''}<div class="cv-umeta">${chips} · ${esc(C.time(t.createdAt))}</div></div></div>`;
  }
  function noteRow(m) {
    return `<div class="cv-row user note"><div class="cv-ubub"><small class="cv-fu">📝 Chỉ dẫn bổ sung · ${esc(C.time(m.ts))}</small><div class="md">${C.md(m.text)}</div></div></div>`;
  }
  function msgHtml(m) {
    const long = m.text.length > 700;
    return `<div class="cv-m k-${esc(m.kind)}">${C.av(m.from, 'av')}<div class="cv-mb"><header><b>${esc(C.agentName(m.from))}</b><span class="kind">${esc(C.KIND_VI?.[m.kind] || m.kind)}${m.round ? ` · vòng ${m.round}` : ''}${m.subtaskId ? ` · ${esc(m.subtaskId)}` : ''}</span><time>${esc(C.time(m.ts))}</time></header><div class="md${long ? ' clip' : ''}">${C.md(m.text)}</div></div></div>`;
  }
  function groupHtml(t, g, isLast) {
    const key = `${t.id}:${g.msgs[0].id}`;
    const open = V.open[key] ?? (active(t) && isLast);
    const kinds = [...new Set(g.msgs.map((m) => C.KIND_VI?.[m.kind] || m.kind))].join(', ');
    const people = [...new Set(g.msgs.map((m) => m.from))].slice(0, 6);
    const lastMsg = g.msgs.at(-1);
    return `<details class="cv-act" data-k="${esc(key)}"${open ? ' open' : ''}><summary><b>${g.msgs.length} tin trao đổi</b><span class="cv-kinds">${esc(kinds)}${open ? '' : ` — ${esc(C.agentName(lastMsg.from))}: ${esc(String(lastMsg.text).replace(/[#*`_>|-]+/g, ' ').replace(/\s+/g, ' ').slice(0, 90))}`}</span><span class="cv-avs">${people.map((p) => C.av(p, 'av xs')).join('')}</span></summary>${open ? `<div class="cv-msgs">${g.msgs.map(msgHtml).join('')}</div>` : ''}</details>`;
  }
  function runHtml(t, r) {
    const idx = r.status === 'done' ? 5 : C.PHASE_INDEX[r.phase] ?? -1;
    const steps = C.PHASES.map(([, l], i) => `<i class="${i < idx ? 'done' : i === idx && r.status === 'running' ? 'now' : ''}" title="${esc(l)}"></i>`).join('');
    const phase = r.status === 'done' ? 'xong' : C.PHASES[idx]?.[1] || (r.phase === 'revise' ? 'Sửa theo review' : C.TASK_VI[r.status] || r.status);
    return `<div class="cv-run"><div class="cv-run-h"><span class="dot" style="background:${C.deptColor(r.department)}"></span><b>${esc(C.deptName(r.department))}</b><span class="cv-steps">${steps}</span><small>${esc(phase)}</small><span class="grow"></span><small class="mono">${C.fmt(C.total(r.usage))} token</small></div>
      ${(r.subtasks || [])
        .map(
          (s) => `<div class="cv-sub">${dot(s.status, false, C.TASK_VI[s.status] || s.status)}<code>${esc(s.id)}</code><span class="cv-st" title="${esc(s.description || s.title)}">${esc(s.title)}</span><span class="cv-who">${C.av(s.assignee, 'av xs')}<small>${esc(C.agentName(s.assignee))}</small></span>${s.output ? `<button class="cv-link" data-pv="${esc(s.output)}" data-tid="${esc(t.id)}">sản phẩm</button>` : '<span></span>'}</div>${s.error && !s.splitTo ? `<div class="cv-err">${esc(String(s.error).slice(0, 300))}</div>` : ''}`,
        )
        .join('')}
      ${r.review ? `<div class="cv-rev">🔍 ${r.review.approved ? '<b class="ok">duyệt</b>' : '<b class="warn">cần sửa</b>'} — ${esc(r.review.summary)}</div>` : ''}</div>`;
  }
  function duration(t) {
    const ms = new Date(t.finishedAt || updated(t)) - new Date(t.createdAt);
    if (!(ms > 0)) return '';
    const m = Math.round(ms / 60000);
    return m < 1 ? `${Math.round(ms / 1000)} giây` : m < 60 ? `${m} phút` : `${Math.floor(m / 60)} giờ ${m % 60} phút`;
  }
  function botName(t) {
    if (t.mode === 'agent' && t.agentId) return `${C.agentName(t.agentId)}`;
    const ds = (t.departments || []).length ? t.departments : t.department ? [t.department] : [];
    return ds.length ? ds.map((d) => C.deptName(d)).join(' → ') : 'Văn phòng CCoding';
  }
  function botRow(t, parts, head) {
    if (!parts.filter(Boolean).length) return '';
    const ava = t.mode === 'agent' && t.agentId ? C.av(t.agentId, 'av cv-aav') : '<span class="cv-bava" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
    return `<div class="cv-row bot">${ava}<div class="cv-bbody">${head ? `<div class="cv-bname">${esc(botName(t))}</div>` : ''}${parts.join('')}</div></div>`;
  }
  // ── Quyết định của giám đốc: duyệt / yêu cầu sửa (dùng chung cho hội thoại và trang nhiệm vụ) ──
  function reviewBox(t) {
    if (!t || live(t)) return '';
    const runs = (t.runs || []).filter((r) => (r.subtasks || []).some((s) => s.status === 'done' && s.output));
    if (!runs.length) return '';
    const open = runs.filter((r) => r.review && !r.review.approved);
    const pending = open.length > 0 || !!t.attention;
    const subs = runs.flatMap((r) =>
      r.subtasks
        .filter((s) => s.status === 'done' && s.output && !s.splitTo)
        .map((s) => ({ r, s, flagged: !!(r.review && !r.review.approved && r.review.issues.some((x) => x.subtask === s.id && x.severity !== 'minor')) })),
    );
    const anyFlag = subs.some((x) => x.flagged);
    const byDir = runs.some((r) => r.review?.by === 'director' && r.review.approved);
    const why = t.attention?.detail || open[0]?.review.summary || '';
    return `<div class="rv-box${pending ? ' pending' : ''}" data-rv="${esc(t.id)}">
      <div class="rv-head"><b>${pending ? '⚖ Cần giám đốc quyết' : '⚖ Quyết định của giám đốc'}</b><span>${pending ? esc(why) : byDir ? 'Đã duyệt bằng tay.' : 'Kết quả đã qua review — vẫn có thể yêu cầu sửa.'}</span></div>
      <div class="rv-acts">${pending ? '<button type="button" class="btn primary sm" data-rv-ok>✅ Duyệt kết quả</button>' : ''}<button type="button" class="btn ghost sm" data-rv-no>✋ Yêu cầu sửa…</button></div>
      <form class="rv-form" hidden>
        <textarea rows="2" placeholder="Cần sửa gì? (vd. thêm test cho trường hợp rỗng, thông báo lỗi bằng tiếng Việt)…" aria-label="Yêu cầu sửa"></textarea>
        <div class="rv-subs">${subs.map(({ r, s, flagged }) => `<label class="check"><input type="checkbox" value="${esc(s.id)}" data-dept="${esc(r.department)}"${flagged || !anyFlag ? ' checked' : ''} /> <code>${esc(s.id)}</code> ${esc(s.title)} <small>@${esc(s.assignee)}${flagged ? ' · reviewer còn nêu lỗi' : ''}</small></label>`).join('')}</div>
        <div class="pb-actions"><button type="submit" class="btn primary sm">Gửi yêu cầu sửa</button><small>Một vòng sửa theo yêu cầu → reviewer duyệt lại → viết lại báo cáo.</small></div>
      </form></div>`;
  }
  function bindReview(root, after) {
    $$('[data-rv]', root).forEach((box) => {
      const id = box.dataset.rv;
      const form = $('.rv-form', box);
      const ta = $('textarea', form);
      const post = async (body, ok) => {
        try {
          const r = await C.api(`/api/tasks/${id}/review`, { method: 'POST', body: JSON.stringify(body) });
          if (r?.id) C.S.tasks.set(r.id, r);
          ta.value = '';
          form.hidden = true;
          C.toast({ level: 'info', title: ok, msg: r?.title || '' });
          after?.();
        } catch (e) {
          C.toast({ level: 'error', title: 'Không thực hiện được', msg: e.message });
        }
      };
      $('[data-rv-ok]', box)?.addEventListener('click', () => post({ decision: 'approve' }, 'Đã duyệt kết quả'));
      $('[data-rv-no]', box).onclick = () => {
        form.hidden = !form.hidden;
        if (!form.hidden) ta.focus();
      };
      form.onsubmit = (e) => {
        e.preventDefault();
        const note = ta.value.trim();
        if (!note) return ta.focus();
        if (window.Director?.hasSecret?.(note)) return C.toast({ level: 'error', title: 'Có vẻ chứa khóa/mật khẩu', msg: 'Xóa bí mật khỏi yêu cầu sửa trước khi gửi.' });
        const boxes = $$('input:checked', form);
        if (!boxes.length) return C.toast({ level: 'info', title: 'Chọn ít nhất một hạng mục cần sửa', msg: '' });
        const depts = [...new Set(boxes.map((b) => b.dataset.dept))];
        post({ decision: 'reject', note, subtasks: boxes.map((b) => b.value), department: depts.length === 1 ? depts[0] : undefined }, 'Đã gửi yêu cầu sửa — văn phòng làm một vòng sửa');
      };
    });
  }
  K.reviewBox = reviewBox;
  K.bindReview = bindReview;

  function segment(t, i, isLast) {
    const d = V.data.get(t.id);
    const tr = d?.transcript || [];
    const rows = [userRow(t, i)];
    // trao đổi của văn phòng, ngắt bởi chỉ dẫn bổ sung của giám đốc
    const items = [];
    let grp = null;
    for (const m of tr) {
      if (m.kind === 'note' && m.from === 'director') {
        grp = null;
        items.push({ note: m });
        continue;
      }
      if (!grp) items.push((grp = { msgs: [] }));
      grp.msgs.push(m);
    }
    const lastG = items.map((x, k) => (x.msgs ? k : -1)).filter((k) => k >= 0).at(-1);
    let parts = [t.routing ? `<div class="cv-route">🧭 ${esc(t.routing.reason)}</div>` : ''];
    let head = true;
    items.forEach((it, k) => {
      if (it.note) {
        rows.push(botRow(t, parts, head));
        if (parts.filter(Boolean).length) head = false;
        rows.push(noteRow(it.note));
        parts = [];
        return;
      }
      parts.push(groupHtml(t, it, k === lastG));
    });
    const runs = t.runs || [];
    const subs = runs.reduce((n, r) => n + (r.subtasks || []).length, 0);
    const people = new Set(runs.flatMap((r) => (r.subtasks || []).map((s) => s.assignee)));
    if (runs.length) {
      const body = runs.map((r) => runHtml(t, r)).join('');
      if (t.status === 'done') {
        const key = `${t.id}:sum`;
        parts.push(`<details class="cv-sum" data-k="${esc(key)}"${V.open[key] ? ' open' : ''}><summary>✓ Hoàn thành · ${runs.length} phòng · ${subs} hạng mục · ${people.size} agent · ${C.fmt(C.total(t.usage))} token${duration(t) ? ` · ${duration(t)}` : ''}</summary><div class="cv-runs">${body}</div></details>`);
      } else parts.push(`<div class="cv-runs">${body}</div>`);
    }
    if (!d) parts.push('<div class="cv-live"><span class="cv-spin"></span>Đang tải…</div>');
    else if (active(t)) {
      const ph = window.Drive?.phaseLabel?.(t) || C.TASK_VI[t.status];
      parts.push(`<div class="cv-live"><span class="cv-spin"></span><span>${esc(ph)}…</span><small>${C.fmt(C.total(t.usage))} token${t.options?.budgetTokens ? ` / ${C.fmt(t.options.budgetTokens)}` : ''}</small><span class="grow"></span>${t.status === 'running' ? `<button class="btn ghost sm" data-act="pause" data-tid="${esc(t.id)}">⏸ Tạm dừng</button>` : ''}<button class="btn ghost sm danger" data-act="cancel" data-tid="${esc(t.id)}">Hủy</button></div>`);
    } else if (['paused', 'failed', 'cancelled'].includes(t.status)) {
      const title = t.status === 'paused' ? `⏸ Tạm dừng — ${C.PAUSE_VI[t.pause?.reason] || t.pause?.reason || ''}` : t.status === 'failed' ? '⚠️ Nhiệm vụ lỗi — có thể chạy tiếp phần chưa xong' : '⏹ Đã hủy';
      const can = runs.length > 0;
      parts.push(`<div class="pause-box ${esc(t.status)}"><div><b>${esc(title)}</b><p>${esc(t.pause?.detail || t.error || '')}</p></div><div class="pb-actions">${can ? `<button class="btn primary sm" data-act="resume" data-tid="${esc(t.id)}">▶ Chạy tiếp tới khi xong</button><button class="btn ghost sm" data-act="resume-add" data-tid="${esc(t.id)}">+50% ngân sách & tiếp tục</button>` : ''}<button class="btn ghost sm" data-act="detail" data-tid="${esc(t.id)}">📋 Mở chi tiết</button></div></div>`);
    }
    if (t.status === 'done') {
      const fin = V.finals.get(t.id);
      const outs = d?.outputs || [];
      parts.push(`<div class="cv-final">${fin ? `<div class="md">${C.md(fin)}</div>` : '<p class="muted-p">✓ Đã xong.</p>'}
        ${outs.length ? `<div class="cv-facts">${outs.slice(0, 10).map((f) => `<button class="cv-chip" data-pv="outputs/${esc(f)}" data-tid="${esc(t.id)}">📄 ${esc(f)}</button>`).join('')}${outs.length > 10 ? `<button class="cv-chip" data-act="detail" data-tid="${esc(t.id)}">… ${outs.length - 10} tệp nữa</button>` : ''}</div>` : ''}
        <div class="cv-tools">${fin ? `<button class="btn ghost sm" data-pv="${esc(t.finalPath)}" data-tid="${esc(t.id)}" title="Mở báo cáo ở khung bên phải">📄 Mở bên phải</button><button class="btn ghost sm" data-copy="${esc(t.id)}">⧉ Chép</button>` : ''}<button class="btn ghost sm" data-act="again" data-tid="${esc(t.id)}">↻ Giao lại tương tự</button><button class="btn ghost sm" data-act="detail" data-tid="${esc(t.id)}">📋 Chi tiết</button>${t.attention ? `<span class="cv-attn">⚠ ${esc(t.attention.detail)}</span>` : ''}</div></div>`);
    }
    if (isLast) parts.push(reviewBox(t));
    rows.push(botRow(t, parts, head));
    return `<section class="cv-seg" data-seg="${esc(t.id)}">${rows.join('')}</section>`;
  }

  function renderTop(c) {
    const t = C.S.tasks.get(c.last.id) || c.last;
    const tok = c.list.reduce((n, x) => n + C.total((C.S.tasks.get(x.id) || x).usage), 0);
    $('#cv-top').innerHTML = `<button class="btn ghost sm cv-listbtn" data-list title="Danh sách hội thoại">☰</button>
      <div class="cv-title"><b title="${esc(c.root.title)}">${esc(c.root.title)}</b><small>${dot(t.status, t.attention)} ${esc(C.TASK_VI[t.status] || t.status)} · ${c.root.projectId ? `📁 ${esc(projName(c.root.projectId))}` : 'ngoài dự án'} · ${esc(who(t))} · <span class="cls ${esc(t.classification)}">${esc(C.CLS_VI[t.classification] || t.classification)}</span> · ${C.fmt(tok)} token${c.list.length > 1 ? ` · ${c.list.length} lượt giao việc` : ''}</small></div>
      <span class="grow"></span>
      ${c.root.projectId ? `<button class="btn ghost sm" data-top="project" title="Mở dự án">📁</button>` : ''}
      <button class="btn ghost sm" data-top="detail" title="Xem dạng quản lý (kế hoạch, sản phẩm, token, nhật ký, lượt gọi)">📋 Quản lý</button>
      <button class="btn ghost sm" data-top="more" title="Thao tác">⋮</button>`;
    const top = $('#cv-top');
    $('[data-list]', top).onclick = () => $('#chat-shell').classList.toggle('list-open');
    $$('[data-top]', top).forEach(
      (b) =>
        (b.onclick = (e) => {
          const k = b.dataset.top;
          if (k === 'detail') C.openTask(t.id);
          if (k === 'project') window.Drive?.openProject?.(c.root.projectId);
          if (k === 'more') {
            const r = e.currentTarget.getBoundingClientRect();
            window.Drive?.taskMenu?.(t, r.left - 160, r.bottom + 4);
          }
        }),
    );
  }

  function bindThread(box) {
    // chỉ ghi nhớ khi người dùng bấm (sự kiện toggle cũng bắn khi khối được vẽ sẵn ở trạng thái mở)
    $$('details[data-k] > summary', box).forEach((sm) =>
      sm.addEventListener('click', () =>
        setTimeout(() => {
          const d = sm.parentElement;
          V.open[d.dataset.k] = d.open;
          if (d.classList.contains('cv-act')) paint(false);
        }, 0),
      ),
    );
    $$('.md.clip', box).forEach((m) => (m.onclick = () => m.classList.toggle('full')));
    $$('[data-pv]', box).forEach((b) => (b.onclick = () => K.preview(b.dataset.tid, b.dataset.pv)));
    $$('[data-copy]', box).forEach(
      (b) =>
        (b.onclick = () => navigator.clipboard?.writeText(V.finals.get(b.dataset.copy) || '').then(() => C.toast({ level: 'info', title: 'Đã chép báo cáo', msg: '' }))),
    );
    $$('[data-act]', box).forEach(
      (b) =>
        (b.onclick = async () => {
          const t = C.S.tasks.get(b.dataset.tid);
          if (!t) return;
          const k = b.dataset.act;
          const budget = t.options?.budgetTokens || 0;
          const post = async (path, body, ok) => {
            try {
              const r = await C.api(path, { method: 'POST', body: JSON.stringify(body || {}) });
              if (r?.id) C.S.tasks.set(r.id, r);
              if (r?.task) C.S.tasks.set(r.task.id, r.task);
              C.toast({ level: 'info', title: ok, msg: t.title });
              paint(true);
            } catch (e) {
              C.toast({ level: 'error', title: 'Không thực hiện được', msg: e.message });
            }
          };
          if (k === 'detail') return C.openTask(t.id);
          if (k === 'again') return C.prefillAssign({ mode: t.mode, department: t.department, projectId: t.projectId, agentId: t.agentId, title: t.title, brief: t.brief });
          if (k === 'pause') return post(`/api/tasks/${t.id}/pause`, {}, 'Đã yêu cầu tạm dừng (lượt đang chạy làm nốt)');
          if (k === 'cancel') return confirm(`Hủy "${t.title}"?`) && post(`/api/tasks/${t.id}/cancel`, {}, 'Đã gửi lệnh hủy');
          if (k === 'resume') return post(`/api/tasks/${t.id}/resume`, { budgetMode: 'complete' }, 'Tiếp tục — chạy tới khi hoàn thành');
          if (k === 'resume-add') return post(`/api/tasks/${t.id}/resume`, { addBudget: Math.max(100000, Math.round(budget * 0.5)) }, 'Đã tăng ngân sách & tiếp tục');
        }),
    );
  }

  /** Vẽ lại hội thoại đang mở (fetch: tải lại dữ liệu nhiệm vụ còn chạy). */
  async function paint(fetch) {
    const c = convOf(V.conv);
    if (!c) {
      V.conv = null;
      return K.show();
    }
    const ids = c.list.map((t) => t.id);
    await Promise.all(ids.map((id) => load(id, fetch ? live(C.S.tasks.get(id)) || !V.data.has(id) : false)));
    if (convOf(V.conv)?.id !== c.id || C.S.tab !== 'assign') return;
    renderTop(c);
    const box = $('#cv-thread');
    const prev = box.scrollTop;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
    // đang gõ yêu cầu sửa → để vẽ lại sau
    if (document.activeElement?.closest?.('#cv-thread .rv-form') || $$('#cv-thread .rv-form').some((f) => !f.hidden && $('textarea', f).value.trim())) return later('thread', () => paint(false), 1500);
    box.innerHTML = `<div class="cv-col">${c.list.map((t, i) => segment(C.S.tasks.get(t.id) || t, i, i === c.list.length - 1)).join('')}</div>`;
    bindThread(box);
    bindReview(box, () => paint(true));
    renderDock(c);
    box.scrollTop = V.stick || nearBottom ? box.scrollHeight : prev;
    V.stick = false;
  }

  // ── Ô trả lời ────────────────────────────────────────────────────────────
  function renderDock(c) {
    const dock = $('#cv-dock');
    const t = C.S.tasks.get(c.last.id) || c.last;
    const mode = live(t) ? 'note' : 'follow';
    const sig = `${c.id}|${t.id}|${mode}`;
    if (dock.dataset.sig === sig) return K.pendingChanged();
    const keep = $('textarea', dock)?.value || '';
    dock.dataset.sig = sig;
    const p = t.projectId ? C.S.projects.find((x) => x.id === t.projectId) : null;
    const workers = [...C.S.agents.values()].filter((a) => C.S.departments.some((d) => d.id === a.department) && (!p?.agents?.length || p.agents.includes(a.id)));
    dock.innerHTML = `<div class="compose-box cv-box">
        <ul class="att-list" id="cv-att"></ul>
        <textarea rows="1" aria-label="Trả lời" placeholder="${mode === 'note' ? 'Nhắn thêm chỉ dẫn cho việc đang chạy…' : 'Trả lời để giao việc tiếp nối…'}"></textarea>
        <div class="compose-bar">
          ${mode === 'follow' ? '<button type="button" class="btn ghost sm icon" data-attach title="Đính kèm tệp (PDF, DOCX, XLSX, MD, CSV, code… ≤ 30 MB/tệp)">📎</button><div class="prompt-tools" id="cv-tools"></div>' : ''}
          ${mode === 'follow' ? `<label class="c-sel" title="Người nhận nhiệm vụ tiếp nối">Giao cho<select data-who><option value="">Như trước — ${esc(who(t))}</option>${workers.map((a) => `<option value="${esc(a.id)}">📌 ${esc(a.name)}</option>`).join('')}</select></label>` : ''}
          <span class="grow"></span>
          <small class="cv-hint">${mode === 'note' ? '📝 chỉ dẫn bổ sung — áp dụng từ lượt làm việc sau' : `↪ tiếp nối ${esc(t.id)} — kế thừa dự án/chế độ`} · <kbd>Enter</kbd> gửi · <kbd>Shift</kbd>+<kbd>Enter</kbd> xuống dòng</small>
          <button type="button" class="btn primary send cv-send" data-send title="Gửi (Enter)" aria-label="Gửi">↑</button>
        </div></div><div class="prompt-check" id="cv-check"></div>`;
    const ta = $('textarea', dock);
    ta.value = keep;
    const grow = () => {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, Math.round(innerHeight * 0.4))}px`;
    };
    ta.addEventListener('input', grow);
    grow();
    if (mode === 'follow') window.Director?.attachTools?.($('#cv-tools', dock), ta, $('#cv-check', dock), t.projectId ? 'project' : 'scratch');
    $('[data-attach]', dock)?.addEventListener('click', () => $('#files').click());
    const btn = $('[data-send]', dock);
    const send = async () => {
      const text = ta.value.trim();
      if (!text) return ta.focus();
      if (window.Director?.hasSecret?.(text)) return C.toast({ level: 'error', title: 'Có vẻ chứa khóa/mật khẩu', msg: 'Xóa bí mật khỏi nội dung trước khi gửi — đừng dán khóa API, mật khẩu vào yêu cầu.' });
      const cur = C.S.tasks.get(t.id) || t;
      btn.disabled = true;
      try {
        if (live(cur)) {
          await C.api(`/api/tasks/${cur.id}/notes`, { method: 'POST', body: JSON.stringify({ text }) });
          ta.value = '';
          grow();
          V.stick = true;
        } else {
          if (C.S.pending.some((a) => a.status === 'uploading')) return C.toast({ level: 'info', title: 'Đang tải tệp lên — chờ một chút', msg: '' });
          const body = { brief: text, followUp: cur.id, attachments: C.S.pending.filter((a) => a.status === 'ok').map((a) => a.id) };
          const w = $('[data-who]', dock)?.value;
          if (w) Object.assign(body, { mode: 'agent', agentId: w });
          const nt = await C.api('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
          C.S.tasks.set(nt.id, nt);
          C.S.pending.length = 0;
          C.renderPending?.();
          ta.value = '';
          V.stick = true;
          V.conv = nt.id;
          store.set('chat.conv', V.conv);
          renderList();
          await paint(true);
        }
      } catch (e) {
        C.toast({ level: 'error', title: 'Không gửi được', msg: e.message });
      } finally {
        btn.disabled = false;
      }
    };
    btn.onclick = send;
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        send();
      }
    });
    K.pendingChanged();
  }

  /** Danh sách tệp đính kèm chờ gửi (dùng chung với ô soạn cuộc mới). */
  K.pendingChanged = () => {
    const ul = $('#cv-att');
    if (!ul || !C) return;
    ul.innerHTML = C.S.pending
      .map((a, i) => `<li class="${esc(a.status)}"><span class="grow"><b>${esc(a.name)}</b> <small>${a.status === 'uploading' ? 'đang tải…' : a.status === 'ok' ? `${esc(a.kind)} · ${C.fmt(a.chars)} ký tự` : `lỗi: ${esc(a.error)}`}</small></span><button type="button" class="btn ghost sm" data-rm="${i}" title="Bỏ">×</button></li>`)
      .join('');
    $$('[data-rm]', ul).forEach(
      (b) =>
        (b.onclick = () => {
          const [a] = C.S.pending.splice(Number(b.dataset.rm), 1);
          if (a?.id) C.api(`/api/uploads/${a.id}`, { method: 'DELETE' }).catch(() => {});
          C.renderPending?.();
        }),
    );
  };

  // ── Khung phải: Xem trước ────────────────────────────────────────────────
  function sideTab(which) {
    const pv = $('#side-preview');
    if (!pv) return;
    const on = which === 'preview' && !!pv.innerHTML;
    pv.hidden = !on;
    $('#side .stage').hidden = on;
    $('#side-sub').hidden = on;
    $$('#side [data-side]').forEach((b) => b.classList.toggle('on', b.dataset.side === (on ? 'preview' : 'office')));
    $('#side-tab-preview').hidden = !pv.innerHTML;
    const o = C.office();
    if (o) o.disabled = on || $('#app').classList.contains('side-hidden');
  }
  K.sideTab = sideTab;
  K.previewOpen = () => !$('#side-preview')?.hidden;
  K.preview = async (taskId, path) => {
    if (!taskId || !path) return;
    const D = window.Drive;
    if (D?.sideMode?.() === 'hidden') D.setSide('open');
    const pv = $('#side-preview');
    const name = path.split('/').pop();
    pv.innerHTML = `<div class="pv-head"><b title="${esc(path)}">📄 ${esc(name)}</b><small>${esc(taskId)} · ${esc(path)}</small><button class="btn ghost sm" data-pv-copy title="Chép nội dung">⧉</button><button class="btn ghost sm" data-pv-close title="Đóng xem trước">✕</button></div><div class="pv-body"><div class="empty">Đang tải…</div></div>`;
    sideTab('preview');
    let text = '';
    $('[data-pv-close]', pv).onclick = () => ((pv.innerHTML = ''), sideTab('office'));
    $('[data-pv-copy]', pv).onclick = () => navigator.clipboard?.writeText(text).then(() => C.toast({ level: 'info', title: `Đã chép ${name}`, msg: '' }));
    try {
      const r = await C.api(`/api/tasks/${taskId}/file?path=${encodeURIComponent(path)}`);
      text = typeof r === 'string' ? r : JSON.stringify(r, null, 2);
      $('.pv-body', pv).innerHTML = /\.(md|markdown|txt)$/i.test(path) ? `<div class="md">${C.md(text)}</div>` : `<pre class="raw">${esc(text)}</pre>`;
    } catch (e) {
      $('.pv-body', pv).innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  };

  // ── API cho app.js / drive.js ────────────────────────────────────────────
  K.current = () => convOf(V.conv);
  K.inConv = (id) => !!V.conv && !!convOf(V.conv)?.list.some((t) => t.id === id);
  /** Mở hội thoại chứa nhiệm vụ id. */
  K.open = (id) => {
    if (V.conv !== id) V.stick = true;
    V.conv = id;
    store.set('chat.conv', id);
    $('#chat-shell')?.classList.remove('list-open');
    if (C.S.tab !== 'assign') C.setTab('assign');
    else K.show();
  };
  /** Cuộc mới: ô soạn ở giữa (form giao việc đầy đủ). */
  K.newConv = () => {
    K.reset();
    if (V.scope && V.scope !== NONE) C.prefillAssign({ mode: 'project', projectId: V.scope });
    else C.prefillAssign({});
  };
  K.reset = () => {
    V.conv = null;
    store.set('chat.conv', null);
  };
  K.show = () => {
    if (!C) return;
    const isNew = !convOf(V.conv);
    if (isNew) V.conv = null;
    $('#cv-new').hidden = !isNew;
    $('#cv-conv').hidden = isNew;
    renderList();
    window.Drive?.crumbs?.();
    if (!isNew) paint(true);
  };
  K.changed = () => {
    if (!C || C.S.tab !== 'assign') return;
    later('list', renderList, 500);
  };
  K.onTask = (t) => {
    if (!C) return;
    const d = V.data.get(t.id);
    if (d) d.task = t;
    if (t.status === 'done' && d && !V.finals.has(t.id)) later(`fin:${t.id}`, () => load(t.id, true), 300);
    if (C.S.tab !== 'assign') return;
    later('list', renderList, 600);
    const c = convOf(V.conv);
    if (c && (c.list.some((x) => x.id === t.id) || t.followUpOf === c.last.id)) later('thread', () => paint(false), 500);
  };
  K.onMessage = (m) => {
    const d = V.data.get(m.taskId);
    if (d && !d.transcript.some((x) => x.id === m.id)) d.transcript.push(m);
    if (!C || C.S.tab !== 'assign') return;
    if (convOf(V.conv)?.list.some((x) => x.id === m.taskId)) later('thread', () => paint(false), 400);
  };
  K.init = () => {
    C = window.CC;
    if (!C) return;
    $$('#side [data-side]').forEach((b) => (b.onclick = () => sideTab(b.dataset.side)));
    // ngăn kéo danh sách hội thoại (vùng giữa hẹp): bấm ra ngoài để đóng
    document.addEventListener('mousedown', (e) => {
      const sh = $('#chat-shell');
      if (sh?.classList.contains('list-open') && !e.target.closest('#cv-list, [data-list]')) sh.classList.remove('list-open');
    });
  };

  window.Chat = K;
})();
