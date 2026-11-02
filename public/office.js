// Văn phòng tối giản (UX-4b): phòng Điều phối · CTO ở trên, mỗi phòng ban một phòng bên dưới; mỗi agent một bàn
// (chân dung pixel, vòng màu trạng thái, bong bóng việc đang làm / câu vừa nói). Bấm vào bàn để mở menu thao tác
// (giao việc riêng, góp ý, tăng ngân sách, xem hồ sơ). Không còn nhân vật giám đốc, đi lại WASD, phòng họp/pantry/giải trí.
// Giữ giao diện lập trình cũ (setData, updateAgent, say, select, setRunning, setMeeting…) để app.js không đổi nhiều.
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const STATUS_VI = { idle: 'rảnh', thinking: 'đang nghĩ', working: 'đang làm', discussing: 'đang họp', reviewing: 'đang review', waiting: 'đang chờ', error: 'lỗi' };
  const busy = (st) => !!st && st.status && st.status !== 'idle';
  const clip = (s, n) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
  };

  class Office {
    /**
     * @param {HTMLElement} el  khung vẽ các phòng
     * @param {{ avatar?: (id:string)=>string, onSelect?: (id:string)=>void, onInteract?: (t:{type:string,id:string}, pos:{left:number,top:number})=>void, deptName?: (id:string)=>string, deptColor?: (id:string)=>string, feed?: HTMLElement, tabs?: HTMLElement, bar?: HTMLElement }} opts
     */
    constructor(el, opts = {}) {
      this.el = el;
      this.opts = opts;
      this.depts = [];
      this.agents = new Map();
      this.saying = new Map(); // id → { text, until }
      this.selected = null;
      this.meeting = '';
      this.running = 0;
      this.feedAgent = '';
      // tương thích director.js (khóa phím khi mở hộp thoại) — văn phòng tối giản không còn điều khiển bằng phím
      this.keys = new Set();
      this.inputLocked = false;
      this.lively = true;
      this._disabled = false;
      this._raf = 0;
      el.addEventListener('click', (e) => {
        const d = e.target.closest('[data-desk]');
        if (!d) return;
        const r = d.getBoundingClientRect();
        const host = (this.opts.menuHost || el).getBoundingClientRect();
        this.select(d.dataset.desk);
        this.opts.onInteract?.({ type: 'agent', id: d.dataset.desk }, { left: r.left - host.left + r.width / 2, top: r.top - host.top + 8 });
      });
      el.addEventListener('dblclick', (e) => {
        const d = e.target.closest('[data-desk]');
        if (d) this.opts.onSelect?.(d.dataset.desk);
      });
      opts.tabs?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-fa]');
        if (!b) return;
        this.feedAgent = b.dataset.fa;
        this.renderFeedTabs();
        this.filterFeed();
      });
      opts.bar?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-bar]');
        if (b) this.opts.onSelect?.(b.dataset.bar);
      });
      // bong bóng "vừa nói" hết hạn
      setInterval(() => {
        const now = Date.now();
        let dirty = false;
        for (const [id, s] of this.saying)
          if (s.until < now) {
            this.saying.delete(id);
            dirty = true;
          }
        if (dirty) this.schedule();
      }, 1000);
    }

    get disabled() {
      return this._disabled;
    }
    set disabled(v) {
      const was = this._disabled;
      this._disabled = !!v;
      if (was && !v) this.schedule();
    }

    setData(departments, agents) {
      this.depts = departments || [];
      this.agents = new Map(agents.map((a) => [a.id, a]));
      this.schedule();
    }
    updateAgent(st) {
      const a = this.agents.get(st.id);
      if (!a) return;
      a.state = st;
      this.schedule();
    }
    say(id, text, ms = 6000) {
      if (!this.agents.has(id) || !text) return;
      this.saying.set(id, { text: clip(text, 70), until: Date.now() + ms });
      this.schedule();
    }
    select(id) {
      this.selected = id;
      this.schedule();
    }
    setRunning(n) {
      if (n === this.running) return;
      this.running = n;
      this.schedule();
    }
    setMeeting(title) {
      if (title === this.meeting) return;
      this.meeting = title || '';
      this.schedule();
    }
    // không còn hiệu ứng: giữ tên hàm cho nơi gọi cũ
    tokenPop() {}
    enablePlayer() {}

    /** Gom các thay đổi trong một khung hình; ô văn phòng bị ẩn thì không vẽ. */
    schedule() {
      if (this._raf || this._disabled) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this.render();
      });
    }

    desk(a) {
      const st = a.state || { status: 'idle' };
      const say = this.saying.get(a.id);
      const bubble = say ? say.text : busy(st) ? clip(st.activity || STATUS_VI[st.status] || st.status, 46) : '';
      const label = a.short || a.name;
      const what = `${a.name} — ${STATUS_VI[st.status] || st.status}${st.activity ? `: ${st.activity}` : ''}`;
      return `<button type="button" class="ofc-desk st-${esc(st.status || 'idle')}${this.selected === a.id ? ' sel' : ''}" data-desk="${esc(a.id)}" title="${esc(what)}" aria-label="${esc(what)}">
        ${bubble ? `<span class="ofc-bub${say ? ' say' : ''}">${esc(bubble)}</span>` : ''}
        <img class="ofc-av" src="${esc(this.opts.avatar ? this.opts.avatar(a.id) : '')}" alt="" draggable="false">
        <i class="ofc-table" aria-hidden="true"><i></i></i>
        <small class="ofc-name">${esc(clip(label, 22))}</small></button>`;
    }

    room(title, list, cls = '', color = '') {
      const n = list.filter((a) => busy(a.state)).length;
      return `<section class="ofc-room ${cls}"${color ? ` style="--dc:${esc(color)}"` : ''} aria-label="${esc(title)}">
        <header><b>${esc(title)}</b><small>${n ? `${n}/${list.length} đang làm` : `${list.length} người`}</small></header>
        <div class="ofc-desks">${list.map((a) => this.desk(a)).join('') || '<small class="ofc-empty">chưa có ai</small>'}</div></section>`;
    }

    render() {
      const all = [...this.agents.values()];
      const deptIds = new Set(this.depts.map((d) => d.id));
      // phòng trên: điều phối + CTO (agent không thuộc phòng ban làm việc nào)
      const top = all.filter((a) => !deptIds.has(a.department));
      const order = (d) => {
        const m = Array.isArray(d.members) ? d.members : [];
        return all.filter((a) => a.department === d.id).sort((x, y) => (x.id === d.lead ? -1 : y.id === d.lead ? 1 : 0) || (m.indexOf(x.id) + 1 || 999) - (m.indexOf(y.id) + 1 || 999));
      };
      const head = `${this.running ? `<span class="ofc-run">● ${this.running} nhiệm vụ đang chạy</span>` : '<span class="ofc-run idle">Không có nhiệm vụ đang chạy</span>'}${this.meeting ? `<span class="ofc-meet" title="${esc(this.meeting)}">🗣 Đang họp: ${esc(clip(this.meeting, 48))}</span>` : ''}`;
      this.el.innerHTML = `<div class="ofc-head">${head}</div>${top.length ? this.room('Điều phối · CTO', top, 'ofc-top', '#b91c1c') : ''}<div class="ofc-rooms">${this.depts
        .map((d) => this.room(d.name || d.id, order(d), '', this.opts.deptColor ? this.opts.deptColor(d.id) : ''))
        .join('')}</div>`;
      this.renderBar(all);
      this.renderFeedTabs();
    }

    /** Thanh trạng thái dưới cùng: các agent đang bận. */
    renderBar(all) {
      const bar = this.opts.bar;
      if (!bar) return;
      const list = all.filter((a) => busy(a.state));
      bar.innerHTML = list.length
        ? list
            .map((a) => {
              const st = a.state;
              return `<button type="button" class="ofc-chip st-${esc(st.status)}" data-bar="${esc(a.id)}" title="${esc(`${a.name} · ${STATUS_VI[st.status] || st.status}${st.activity ? ` · ${st.activity}` : ''}`)}"><i></i><b>${esc(clip(a.short || a.name, 20))}</b><span>${esc(clip(st.activity || STATUS_VI[st.status] || '', 34))}</span></button>`;
            })
            .join('')
        : '<small class="ofc-quiet">Cả văn phòng đang rảnh</small>';
    }

    /** Luồng hoạt động: tab "Tất cả" + các agent vừa có hoạt động; chọn tab để lọc. */
    noteFeed() {
      this.renderFeedTabs();
      this.filterFeed();
    }
    renderFeedTabs() {
      const tabs = this.opts.tabs;
      const feed = this.opts.feed;
      if (!tabs || !feed) return;
      const seen = [];
      for (const el of feed.children) {
        const id = el.dataset.agent;
        if (id && !seen.includes(id)) seen.push(id);
        if (seen.length >= 6) break;
      }
      if (this.feedAgent && !seen.includes(this.feedAgent)) seen.push(this.feedAgent);
      const name = (id) => {
        const a = this.agents.get(id);
        return a ? a.short || a.name : id;
      };
      tabs.innerHTML = [['', 'Tất cả'], ...seen.map((id) => [id, name(id)])]
        .map(([id, l]) => `<button type="button" role="tab" data-fa="${esc(id)}" aria-selected="${this.feedAgent === id}" class="${this.feedAgent === id ? 'on' : ''}">${esc(clip(l, 18))}</button>`)
        .join('');
    }
    filterFeed() {
      const feed = this.opts.feed;
      if (!feed) return;
      for (const el of feed.children) el.hidden = !!this.feedAgent && el.dataset.agent !== this.feedAgent;
    }
  }

  window.Office = Office;
})();
