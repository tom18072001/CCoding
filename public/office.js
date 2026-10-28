// Văn phòng pixel: vẽ phòng ban, bàn làm việc, nhân vật agent di chuyển theo trạng thái.
// Toàn bộ hình vẽ là pixel-art tự dựng (không dùng tài nguyên bên ngoài).
(function () {
  const T = 16; // pixel cơ sở / ô
  // Hàng trên: Phát triển (x 1–24) | Giám đốc (x 26–32) | Nghiên cứu (x 34–50); hàng dưới: họp | điều phối | pantry | góc giải trí
  const W = 52;
  const H = 28;

  const STATUS_COLOR = {
    idle: '#64748b', thinking: '#60a5fa', working: '#22d3ee', discussing: '#e879f9',
    reviewing: '#fbbf24', waiting: '#94a3b8', error: '#f87171',
  };

  // ── Bố cục ───────────────────────────────────────────────────────────────
  const ROOMS = {
    dev: { x0: 1, x1: 25, y0: 2, y1: 16, door: { x: 12, y: 16.5 }, aisleY: 15.25, lanes: [2.2, 8.75, 16.25, 23.6] },
    research: { x0: 34, x1: 51, y0: 2, y1: 16, door: { x: 42, y: 16.5 }, aisleY: 15.25, lanes: [35.2, 41.5, 47.9] },
    meeting: { x0: 1, x1: 17, y0: 20, y1: 27, door: { x: 8, y: 19.5 }, aisleY: 20.9, lanes: [2.0, 15.7], direct: (q) => q.y < 22.6 },
    director: { x0: 18, x1: 28, y0: 20, y1: 27, door: { x: 22, y: 19.5 }, aisleY: 20.9, lanes: [19.2, 26.8] },
    pantry: { x0: 29, x1: 43, y0: 20, y1: 27, door: { x: 35, y: 19.5 }, aisleY: 20.9, lanes: [], direct: () => true },
    boss: { x0: 26, x1: 33, y0: 2, y1: 16, door: { x: 29.5, y: 16.5 }, aisleY: 15.4, lanes: [], direct: () => true },
    fun: { x0: 44, x1: 51, y0: 20, y1: 27, door: { x: 45.15, y: 19.5 }, aisleY: 20.9, lanes: [], direct: () => true },
  };
  const CORRIDOR_Y = 18;

  function roomAt(x, y) {
    if (y < 16.4) return x < 25.5 ? 'dev' : x < 33.5 ? 'boss' : 'research';
    if (y < 19.6) return 'corridor';
    return x < 17.5 ? 'meeting' : x < 28.5 ? 'director' : x < 43.5 ? 'pantry' : 'fun';
  }

  const DEV_SEATS = [];
  for (const y of [6.0, 10.1, 14.2]) for (const x of [5, 12.5, 20]) DEV_SEATS.push({ x, y, face: 'up' });
  const RESEARCH_SEATS = [];
  for (const y of [6.0, 10.1, 14.2]) for (const x of [38, 45]) RESEARCH_SEATS.push({ x, y, face: 'up' });
  const DIRECTOR_SEAT = { x: 22.5, y: 24.4, face: 'up' };
  const MEETING_SEATS = [
    { x: 3.1, y: 23.9, face: 'right' },
    ...[5, 7, 9, 11, 12.9].map((x) => ({ x, y: 22.35, face: 'down' })),
    ...[5, 7, 9, 11, 12.9].map((x) => ({ x, y: 25.15, face: 'up' })),
    { x: 14.5, y: 23.9, face: 'left' },
  ];
  // Phòng giám đốc (người dùng điều khiển nhân vật của mình bằng WASD / phím mũi tên)
  const BOSS_SEAT = { x: 29.6, y: 7.6, face: 'down' };
  const BOSS_SPOTS = {
    desk: { x: 29.6, y: 6.2, r: 1.9, label: 'Bàn giám đốc', icon: '🗂' },
    screen: { x: 29.6, y: 2.6, r: 1.8, label: 'Bảng điều khiển', icon: '📊' },
    arcade: { x: 49.4, y: 24.2, r: 1.6, label: 'Máy giải trí', icon: '🕹' },
    piano: { x: 45.6, y: 24.2, r: 1.6, label: 'Đàn', icon: '🎹' },
    sofa: { x: 29.6, y: 14.6, r: 1.8, label: 'Ghế tiếp khách', icon: '🛋' },
  };
  const SPOTS = [
    { id: 'room:dev', x: 12, y: 16.6, r: 1.8, label: 'Phòng Phát triển', icon: '💻', dept: 'dev' },
    { id: 'room:research', x: 42, y: 16.6, r: 1.8, label: 'Phòng Nghiên cứu', icon: '📚', dept: 'research' },
    { id: 'room:dev', x: 25.5, y: 10.4, r: 1.2, label: 'Cửa tắt sang phòng Phát triển', icon: '🚪', dept: 'dev' },
    { id: 'room:research', x: 33.5, y: 10.4, r: 1.2, label: 'Cửa tắt sang phòng Nghiên cứu', icon: '🚪', dept: 'research' },
    { id: 'room:meeting', x: 8, y: 19.4, r: 1.6, label: 'Phòng họp', icon: '🗣' },
    { id: 'room:meeting-table', x: 8.8, y: 23.2, r: 3.2, label: 'Bàn họp', icon: '🗣' },
    { id: 'room:office', x: 22, y: 19.4, r: 1.6, label: 'Phòng điều phối', icon: '🧭' },
    { id: 'room:pantry', x: 40.3, y: 21.8, r: 1.8, label: 'Máy pha cà phê', icon: '☕' },
    { id: 'room:pantry-sofa', x: 32.2, y: 24.0, r: 2.0, label: 'Sofa pantry', icon: '🛋' },
    { id: 'pantry:table', x: 37.3, y: 23.5, r: 1.7, label: 'Bàn ăn pantry — Pantry time', icon: '🍱' },
    { id: 'pantry:water', x: 30.6, y: 20.9, r: 1.1, label: 'Cây nước', icon: '💧' },
    { id: 'office:tv', x: 25.7, y: 20.8, r: 1.5, label: 'TV điều phối', icon: '📺' },
    { id: 'meeting:board', x: 13.1, y: 20.7, r: 1.8, label: 'Bảng phòng họp', icon: '🗣' },
    { id: 'dev:board', x: 4.7, y: 2.6, r: 1.6, label: 'Bảng trắng phòng Phát triển', icon: '📋', dept: 'dev' },
    { id: 'research:shelf', x: 50.0, y: 7.6, r: 2.6, label: 'Giá sách phòng Nghiên cứu', icon: '📚', dept: 'research' },
    ...Object.entries(BOSS_SPOTS).map(([k, v]) => ({ id: `boss:${k}`, ...v })),
  ];
  // vật cản cho nhân vật người dùng (ô; [x, y, w, h])
  const SOLIDS = [];
  const PLAYER_LOOK = { skin: '#f1c27d', hair: '#1f1408', shirt: '#1f2a44' };

  const PANTRY_SPOTS = [
    { x: 40.3, y: 21.7, face: 'up' }, { x: 30.6, y: 21.7, face: 'up' }, { x: 36.0, y: 25.3, face: 'up' },
    { x: 38.6, y: 25.3, face: 'up' }, { x: 33.0, y: 23.2, face: 'right' }, { x: 41.2, y: 24.0, face: 'left' },
    // quanh bàn ăn và sofa (giờ pantry)
    { x: 35.5, y: 23.7, face: 'right' }, { x: 39.1, y: 23.7, face: 'left' }, { x: 36.7, y: 22.4, face: 'down' },
    { x: 37.9, y: 22.4, face: 'down' }, { x: 31.0, y: 25.6, face: 'up' }, { x: 32.6, y: 25.6, face: 'up' }, { x: 41.8, y: 22.4, face: 'left' },
  ];

  // cửa ra hành lang: [x0, x1] trên tường y = 16 (phòng trên) và y = 19 (phòng dưới)
  const DOORS_TOP = [[11, 13], [28.5, 30.5], [41, 43]];
  // vách ngăn hai bên phòng Giám đốc có cửa tắt sang Phát triển / Nghiên cứu (y từ 9.2 đến 11.2)
  const SIDE_DOOR = [9.2, 11.2];
  const SIDE_Y = (SIDE_DOOR[0] + SIDE_DOOR[1]) / 2;
  const SIDE_DOORS = { dev: { wall: 25, inside: 23.6 }, research: { wall: 33, inside: 35.2 } };
  const DOORS_BOTTOM = [[7, 9], [21, 23], [34, 36], [44.3, 46.0]];

  (function buildSolids() {
    const add = (x, y, w, h) => SOLIDS.push([x, y, w, h]);
    // tường
    add(0, 0, W, 2); // mặt tiền + tường trên
    add(0, 0, 1, H);
    add(W - 1, 0, 1, H);
    add(0, H - 1, W, 1);
    // vách Phát triển | Giám đốc | Nghiên cứu, chừa cửa tắt
    for (const x of [25, 33]) {
      add(x, 0, 1, SIDE_DOOR[0]);
      add(x, SIDE_DOOR[1], 1, 16.4 - SIDE_DOOR[1]);
    }
    const hwall = (y, gaps) => {
      let x = 1;
      for (const [g0, g1] of gaps) {
        add(x, y, g0 - x, 1);
        x = g1;
      }
      add(x, y, W - 1 - x, 1);
    };
    hwall(16, DOORS_TOP);
    hwall(19, DOORS_BOTTOM);
    add(17, 19, 1, 8);
    add(28, 19, 1, 8);
    add(43, 19, 1, 8); // pantry | góc giải trí
    // bàn làm việc
    for (const s of [...DEV_SEATS, ...RESEARCH_SEATS, DIRECTOR_SEAT]) add(s.x - 1.6, s.y - 2.4, 3.2, 1.35);
    add(BOSS_SEAT.x - 2.2, BOSS_SEAT.y - 2.6, 4.4, 1.6); // bàn giám đốc
    // đồ đạc
    add(4.0, 22.2, 9.6, 1.95); // bàn họp
    add(49.2, 2.6, 1.6, 10.2); // giá sách nghiên cứu
    add(18.3, 20.2, 1.6, 1.85);
    add(30.0, 24.6, 4.4, 1.4); // sofa pantry
    add(36.0, 22.7, 2.6, 1.6);
    add(39.7, 20.0, 1.3, 1.3);
    add(30.2, 20.0, 0.8, 1.3);
    add(31.5, 22.4, 1.6, 0.9);
    add(27.6, 13.6, 4.0, 1.2); // sofa giám đốc
    add(28.7, 11.4, 1.8, 1.0); // bàn trà
    add(48.9, 23.0, 1.3, 1.6); // máy giải trí
    add(44.9, 23.2, 1.5, 1.2); // đàn
    add(31.6, 2.6, 1.3, 4.0); // giá sách giám đốc
  })();

  function solidAt(x, y) {
    for (const [sx, sy, sw, sh] of SOLIDS) if (x >= sx && x < sx + sw && y >= sy && y < sy + sh) return true;
    return false;
  }

  // ── Tiện ích vẽ ──────────────────────────────────────────────────────────
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function shade(hex, amt) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  class Painter {
    constructor(ctx, s, ox, oy) {
      this.c = ctx; this.s = s; this.ox = ox; this.oy = oy;
    }
    X(v) { return Math.round(this.ox + v * T * this.s); }
    Y(v) { return Math.round(this.oy + v * T * this.s); }
    rect(x, y, w, h, color) {
      const x0 = this.X(x), y0 = this.Y(y);
      this.c.fillStyle = color;
      this.c.fillRect(x0, y0, Math.max(1, this.X(x + w) - x0), Math.max(1, this.Y(y + h) - y0));
    }
    // vẽ theo pixel con (1/16 ô) quanh gốc (bx, by)
    px(bx, by, dx, dy, w, h, color) {
      this.rect(bx + dx / T, by + dy / T, w / T, h / T, color);
    }
    text(str, x, y, size, color, align = 'center', weight = 600) {
      const c = this.c;
      c.font = `${weight} ${Math.max(7, size * this.s)}px "Be Vietnam Pro", system-ui, sans-serif`;
      c.fillStyle = color;
      c.textAlign = align;
      c.textBaseline = 'middle';
      c.fillText(str, this.X(x), this.Y(y));
    }
    round(x, y, w, h, r, color, stroke) {
      const c = this.c;
      const x0 = this.X(x), y0 = this.Y(y), w0 = this.X(x + w) - x0, h0 = this.Y(y + h) - y0;
      const rr = Math.min(r * this.s, h0 / 2, w0 / 2);
      c.beginPath();
      c.moveTo(x0 + rr, y0);
      c.arcTo(x0 + w0, y0, x0 + w0, y0 + h0, rr);
      c.arcTo(x0 + w0, y0 + h0, x0, y0 + h0, rr);
      c.arcTo(x0, y0 + h0, x0, y0, rr);
      c.arcTo(x0, y0, x0 + w0, y0, rr);
      c.closePath();
      c.fillStyle = color;
      c.fill();
      if (stroke) {
        c.strokeStyle = stroke;
        c.lineWidth = Math.max(1, this.s);
        c.stroke();
      }
    }
  }

  // ── Nhân vật ─────────────────────────────────────────────────────────────
  function drawCharacter(p, x, y, look, face, step, opts = {}) {
    const skin = look.skin || '#f1c27d';
    const hair = look.hair || '#2b1d0e';
    const shirt = look.shirt || '#2563eb';
    const pants = '#1e293b';
    const c = p.c;
    // bóng
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.beginPath();
    c.ellipse(p.X(x), p.Y(y - 0.02), 5 * p.s, 2 * p.s, 0, 0, Math.PI * 2);
    c.fill();
    if (opts.ring) {
      c.strokeStyle = opts.ring;
      c.lineWidth = Math.max(1, 1.2 * p.s);
      c.beginPath();
      c.ellipse(p.X(x), p.Y(y - 0.02), 8 * p.s, 3.2 * p.s, 0, 0, Math.PI * 2);
      c.stroke();
    }
    const l = step ? Math.sin(step) : 0;
    const la = l > 0.3 ? 1 : 0;
    const lb = l < -0.3 ? 1 : 0;
    // chân
    p.px(x, y, -3, -4 - la, 2, 4 + la, pants);
    p.px(x, y, 1, -4 - lb, 2, 4 + lb, pants);
    p.px(x, y, -3, -1, 2, 1, '#0f172a');
    p.px(x, y, 1, -1, 2, 1, '#0f172a');
    // thân + tay
    p.px(x, y, -4, -10, 8, 7, shirt);
    p.px(x, y, 2, -10, 2, 7, shade(shirt, -0.12));
    const armSwing = step ? Math.round(l) : 0;
    if (face === 'left' || face === 'right') {
      p.px(x, y, face === 'left' ? -1 : -1, -9 + armSwing, 2, 5, shade(shirt, -0.2));
    } else {
      p.px(x, y, -6, -10 + armSwing, 2, 6, shade(shirt, -0.08));
      p.px(x, y, 4, -10 - armSwing, 2, 6, shade(shirt, -0.18));
      p.px(x, y, -6, -4 + armSwing, 2, 1, skin);
      p.px(x, y, 4, -4 - armSwing, 2, 1, skin);
    }
    // đầu
    p.px(x, y, -4, -17, 8, 7, skin);
    p.px(x, y, -1, -10, 2, 1, shade(skin, -0.12));
    if (face === 'up') {
      p.px(x, y, -4, -18, 8, 6, hair);
      p.px(x, y, -4, -12, 8, 1, shade(hair, -0.1));
    } else if (face === 'left' || face === 'right') {
      p.px(x, y, -4, -18, 8, 3, hair);
      p.px(x, y, face === 'left' ? 1 : -4, -15, 3, 4, hair);
      if (!opts.blink) p.px(x, y, face === 'left' ? -3 : 2, -14, 1, 1, '#111827');
    } else {
      p.px(x, y, -4, -18, 8, 3, hair);
      p.px(x, y, -4, -15, 1, 3, hair);
      p.px(x, y, 3, -15, 1, 3, hair);
      if (!opts.blink) {
        p.px(x, y, -2, -14, 1, 1, '#111827');
        p.px(x, y, 1, -14, 1, 1, '#111827');
      }
      p.px(x, y, -1, -12, 2, 1, shade(skin, -0.18));
    }
    if (opts.tie && face !== 'up') {
      p.px(x, y, -1, -10, 2, 1, '#f8fafc');
      p.px(x, y, -0.5, -9, 1, 4, opts.tie);
    }
    if (opts.glow) p.px(x, y, -4, -17, 8, 7, 'rgba(56,189,248,0.18)');
  }

  function wrap(str, max) {
    const words = String(str).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > max) {
        if (cur) lines.push(cur);
        cur = w.length > max ? w.slice(0, max - 1) + '…' : w;
      } else cur = (cur + ' ' + w).trim();
      if (lines.length >= 3) break;
    }
    if (cur && lines.length < 3) lines.push(cur);
    if (lines.length === 3 && words.join(' ').length > lines.join(' ').length) lines[2] = lines[2].slice(0, max - 1) + '…';
    return lines;
  }

  // ── Văn phòng ────────────────────────────────────────────────────────────
  class Office {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = opts;
      this.agents = new Map();
      this.seats = new Map();
      this.meeting = new Map(); // agentId -> seat
      this.depts = [];
      this.selected = null;
      this.hover = null;
      this.lively = true;
      this.meetingTitle = '';
      this.runningCount = 0;
      this.pops = [];
      this.effects = [];
      this.player = null;
      this.keys = new Set();
      this.near = null;
      this.inputLocked = false;
      this.pointerIn = false;
      this.dashboard = null;
      this.bg = null;
      this.t0 = performance.now();
      this.last = this.t0;
      this.resize();
      new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
      canvas.addEventListener('mousemove', (e) => this.onMove(e));
      canvas.addEventListener('mouseleave', () => {
        this.hover = null;
        this.hoverSpot = null;
        this.pointerIn = false;
        this.opts.onHover?.(null);
      });
      canvas.addEventListener('mouseenter', () => (this.pointerIn = true));
      canvas.addEventListener('click', () => {
        if (this.hover) return this.opts.onSelect?.(this.hover);
        // nhấp thẳng vào đồ vật / phòng: tương tác như khi đứng cạnh và bấm E (không cần đi nhân vật tới)
        const sp = this.hoverSpot;
        if (sp) this.opts.onInteract?.({ type: 'spot', id: sp.id, label: sp.label, icon: sp.icon, dept: sp.dept, x: sp.x, y: sp.y, via: 'click' }, this.screenPos(sp.x, sp.y));
      });
      // nhân vật người dùng: WASD (mọi lúc trừ khi đang gõ), phím mũi tên (khi trỏ chuột/focus ở văn phòng), E để tương tác
      canvas.tabIndex = 0;
      window.addEventListener('keydown', (e) => this.onKey(e, true));
      window.addEventListener('keyup', (e) => this.onKey(e, false));
      window.addEventListener('blur', () => this.keys.clear());
      canvas.addEventListener('dblclick', (e) => this.walkPlayerTo(e));
      requestAnimationFrame((t) => this.loop(t));
    }

    setData(departments, agents) {
      this.depts = departments;
      const byDept = { dev: [], research: [], office: [] };
      for (const a of agents) (byDept[a.department] ??= []).push(a);
      const order = (list, d) => {
        const lead = d?.lead;
        return list.sort((a, b) => (a.id === lead ? -1 : b.id === lead ? 1 : (d?.members ?? []).indexOf(a.id) - (d?.members ?? []).indexOf(b.id)));
      };
      const deptOf = (id) => departments.find((d) => d.id === id);
      const assign = (list, seats, overflowX, overflowY) => {
        list.forEach((a, i) => {
          this.seats.set(a.id, seats[i] ?? { x: overflowX + (i - seats.length) * 1.4, y: overflowY, face: 'down' });
        });
      };
      assign(order(byDept.dev ?? [], deptOf('dev')), DEV_SEATS, 3, 18);
      assign(order(byDept.research ?? [], deptOf('research')), RESEARCH_SEATS, 35, 18);
      const office = [...(byDept.office ?? []), ...Object.entries(byDept).filter(([k]) => !['dev', 'research', 'office'].includes(k)).flatMap(([, v]) => v)];
      office.forEach((a, i) => this.seats.set(a.id, i === 0 ? DIRECTOR_SEAT : { x: 19.5 + i * 1.5, y: 26.2, face: 'up' }));
      for (const a of agents) {
        const seat = this.seats.get(a.id);
        const prev = this.agents.get(a.id);
        this.agents.set(a.id, {
          def: a,
          x: prev?.x ?? seat.x,
          y: prev?.y ?? seat.y,
          face: prev?.face ?? seat.face,
          path: prev?.path ?? [],
          state: a.state ?? prev?.state ?? { status: 'idle' },
          target: prev?.target ?? 'desk',
          bubble: prev?.bubble ?? null,
          idleSince: performance.now(),
          returnAt: 0,
          step: 0,
          blinkAt: performance.now() + 2000 + (hash(a.id) % 4000),
        });
      }
      this.bg = null;
    }

    updateAgent(state) {
      const a = this.agents.get(state.id);
      if (!a) return;
      const prev = a.state?.status;
      a.state = state;
      if (state.status !== prev) {
        a.idleSince = performance.now();
        if (state.status === 'discussing') this.goMeeting(a);
        else if (prev === 'discussing' || a.target !== 'desk') this.goDesk(a);
      }
      if (state.status !== 'discussing' && state.status !== 'idle' && a.target !== 'desk') this.goDesk(a);
    }

    say(id, text, ms = 8000) {
      const a = this.agents.get(id);
      if (!a) return;
      // trong phòng họp chỉ giữ bong bóng của người đang nói để khỏi chồng lấn
      if (a.target === 'meeting') for (const o of this.agents.values()) if (o !== a && o.target === 'meeting') o.bubble = null;
      a.bubble = { text: String(text).replace(/\s+/g, ' ').trim(), until: performance.now() + ms };
    }

    tokenPop(id, n) {
      const a = this.agents.get(id);
      if (!a || !n) return;
      this.pops.push({ x: a.x, y: a.y, text: `+${n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n}`, t: performance.now() });
    }

    setMeeting(title) {
      this.meetingTitle = title || '';
    }

    setRunning(n) {
      this.runningCount = n;
    }

    select(id) {
      this.selected = id;
    }

    // ── Nhân vật người dùng (giám đốc) ───────────────────────────────────
    enablePlayer(opts = {}) {
      this.player = { x: BOSS_SEAT.x, y: BOSS_SEAT.y, face: 'down', step: 0, path: [], name: opts.name || 'Bạn', look: { ...PLAYER_LOOK, ...(opts.look || {}) }, bubble: null };
    }

    setDashboard(line1, line2) {
      this.dashboard = { line1, line2 };
    }

    typing(e) {
      const el = e.target;
      return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ''));
    }

    onKey(e, down) {
      if (!this.player) return;
      if (this.disabled) return this.keys.clear();
      if (down && (this.inputLocked || this.typing(e) || e.ctrlKey || e.metaKey || e.altKey)) return;
      const k = (e.key || '').toLowerCase();
      const dir = { w: 'up', s: 'down', a: 'left', d: 'right', arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right' }[k];
      if (dir) {
        const arrow = k.startsWith('arrow');
        if (arrow && !(this.pointerIn || document.activeElement === this.canvas)) return;
        if (down) this.keys.add(dir);
        else this.keys.delete(dir);
        if (arrow) e.preventDefault();
        if (down) this.player.path = [];
        return;
      }
      if (down && k === 'e' && this.near) {
        e.preventDefault();
        this.opts.onInteract?.(this.near, this.screenPos(this.near.x, this.near.y));
      }
    }

    free(x, y) {
      return !(solidAt(x - 0.3, y) || solidAt(x + 0.3, y) || solidAt(x - 0.3, y - 0.35) || solidAt(x + 0.3, y - 0.35));
    }

    tileAt(e) {
      const r = this.canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) * this.dpr - this.ox) / (T * this.s), y: ((e.clientY - r.top) * this.dpr - this.oy) / (T * this.s) };
    }

    walkPlayerTo(e) {
      if (!this.player || this.hover || this.hoverSpot) return;
      const q = this.tileAt(e);
      if (q.x < 1 || q.y < 2 || q.x > W - 1 || q.y > H - 1 || !this.free(q.x, q.y)) return;
      this.walkTo(this.player, { x: q.x, y: q.y, face: 'down' });
    }

    /** Vị trí trên màn hình (px CSS, tương đối canvas) của một điểm trên sơ đồ. */
    screenPos(x, y) {
      return { left: (this.ox + x * T * this.s) / this.dpr, top: (this.oy + y * T * this.s) / this.dpr };
    }

    findNear() {
      const pl = this.player;
      let best = null;
      let bd = 1e9;
      for (const a of this.agents.values()) {
        const d = Math.hypot(a.x - pl.x, (a.y - pl.y) * 1.2);
        if (d < 1.7 && d < bd) {
          bd = d;
          best = { type: 'agent', id: a.def.id, label: a.def.name, x: a.x, y: a.y - 1.2 };
        }
      }
      for (const sp of SPOTS) {
        const d = Math.hypot(sp.x - pl.x, sp.y - pl.y);
        if (d < sp.r && d + 0.4 < bd) {
          bd = d + 0.4;
          best = { type: 'spot', id: sp.id, label: sp.label, icon: sp.icon, dept: sp.dept, x: sp.x, y: sp.y };
        }
      }
      return best;
    }

    tickPlayer(dt) {
      const pl = this.player;
      let dx = 0;
      let dy = 0;
      if (this.keys.has('left')) dx -= 1;
      if (this.keys.has('right')) dx += 1;
      if (this.keys.has('up')) dy -= 1;
      if (this.keys.has('down')) dy += 1;
      if (dx || dy) {
        const n = Math.hypot(dx, dy);
        const step = 5.5 * dt;
        const nx = pl.x + (dx / n) * step;
        const ny = pl.y + (dy / n) * step;
        if (this.free(nx, pl.y)) pl.x = nx;
        if (this.free(pl.x, ny)) pl.y = ny;
        pl.face = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        pl.step += dt * 14;
      } else if (pl.path.length) {
        const tgt = pl.path[0];
        const ddx = tgt.x - pl.x;
        const ddy = tgt.y - pl.y;
        const d = Math.hypot(ddx, ddy);
        const stepLen = 5.5 * dt;
        if (d <= stepLen) {
          pl.x = tgt.x;
          pl.y = tgt.y;
          pl.path.shift();
        } else {
          pl.x += (ddx / d) * stepLen;
          pl.y += (ddy / d) * stepLen;
        }
        pl.face = Math.abs(ddx) > Math.abs(ddy) ? (ddx > 0 ? 'right' : 'left') : ddy > 0 ? 'down' : 'up';
        pl.step += dt * 14;
      } else pl.step = 0;
      const near = this.findNear();
      if ((near && near.id) !== (this.near && this.near.id)) this.opts.onNear?.(near);
      this.near = near;
    }

    playerSay(text, ms = 4000) {
      if (this.player) this.player.bubble = { text, until: performance.now() + ms };
    }

    /** Hiệu ứng cho vui (không tác động tới công việc): hearts | stars | confetti | notes | coffee | laugh. */
    effect(kind, x, y) {
      const icons = { hearts: ['❤', '💖', '❤'], stars: ['⭐', '✨', '🌟'], confetti: ['🎉', '🎊', '✨'], notes: ['🎵', '🎶', '🎵'], coffee: ['☕', '♨'], laugh: ['😂', '🤣', '😆'], wave: ['👋', '🙌'] }[kind] || ['✨'];
      const now = performance.now();
      for (let i = 0; i < 6; i++) this.effects.push({ x: x + (Math.random() - 0.5) * 1.6, y: y - 1.6 - Math.random() * 0.6, icon: icons[i % icons.length], t: now + i * 90, vx: (Math.random() - 0.5) * 0.6 });
    }

    /** Trò vui với một agent — chỉ đổi hình ảnh trên sơ đồ. */
    funWith(id, kind, text) {
      const a = this.agents.get(id);
      if (!a) return;
      const busy = (a.state?.status ?? 'idle') !== 'idle';
      if (kind === 'coffee') {
        if (!busy && a.def.role !== 'router') {
          this.goPantry(a);
          this.say(id, text || 'Cảm ơn sếp! Em đi pha cà phê ☕', 5000);
        } else this.say(id, text || 'Em đang dở việc, lát nữa em uống nhé sếp! ☕', 5000);
        this.effect('coffee', a.x, a.y);
        return;
      }
      if (text) this.say(id, text, kind === 'joke' ? 9000 : 5000);
      this.effect({ highfive: 'wave', praise: 'stars', joke: 'laugh', cheer: 'confetti' }[kind] || 'hearts', a.x, a.y);
    }

    /** Mời mọi agent đang rảnh đi uống cà phê (cho vui). */
    coffeeParty() {
      let n = 0;
      for (const a of this.agents.values()) {
        if ((a.state?.status ?? 'idle') === 'idle' && a.def.role !== 'router' && a.target === 'desk') {
          this.goPantry(a);
          if (n++ < 3) this.say(a.def.id, ['Tuyệt quá sếp ơi!', 'Cà phê sữa đá nhé!', 'Em xin một ly trà đào 🍑'][n - 1], 4000);
        }
      }
      return n;
    }

    musicAround(x, y) {
      this.effect('notes', x, y);
      for (const a of this.agents.values()) if (Math.hypot(a.x - x, a.y - y) < 9 && Math.random() < 0.5) this.effect('notes', a.x, a.y);
    }

    drawPlayer(p, now) {
      const pl = this.player;
      const c = p.c;
      const y = pl.y - 1.62;
      c.font = `700 ${Math.max(7, 6 * p.s)}px "Be Vietnam Pro", system-ui, sans-serif`;
      const name = pl.name;
      const wpx = c.measureText(name).width / (T * p.s) + 0.75;
      p.round(pl.x - wpx / 2, y - 0.3, wpx, 0.58, 3, 'rgba(66,32,6,0.9)', '#fbbf24');
      p.text(name, pl.x, y, 6, '#fde68a', 'center', 700);
      let text = pl.bubble && now < pl.bubble.until ? pl.bubble.text : null;
      let hint = false;
      if (!text && this.near) {
        text = `E · ${this.near.icon ? this.near.icon + ' ' : ''}${this.near.label}`;
        hint = true;
      }
      if (!text) return;
      c.font = `600 ${Math.max(7, 5.6 * p.s)}px "Be Vietnam Pro", system-ui, sans-serif`;
      const lines = wrap(text, 30);
      const lw = Math.max(...lines.map((l) => c.measureText(l).width)) / (T * p.s) + 0.6;
      const bh = lines.length * 0.42 + 0.3;
      const bx = Math.max(1.1, Math.min(W - 1.1 - lw, pl.x - lw / 2));
      const by = y - 0.42 - bh;
      p.round(bx, by, lw, bh, 4, hint ? 'rgba(120,53,15,0.92)' : 'rgba(255,251,235,0.97)', hint ? '#fbbf24' : '#fcd34d');
      lines.forEach((l, i) => p.text(l, bx + 0.3, by + 0.36 + i * 0.42, 5.6, hint ? '#fef3c7' : '#422006', 'left', 600));
    }

    /** Viền + nhãn cho đồ vật đang trỏ chuột (nhấp để tương tác). */
    drawSpotHint(p, sp) {
      const c = p.c;
      const r = Math.min(sp.r, 1.6);
      c.save();
      c.setLineDash([3 * p.s, 2 * p.s]);
      c.strokeStyle = '#fbbf24';
      c.lineWidth = Math.max(1, p.s);
      c.beginPath();
      c.ellipse(p.X(sp.x), p.Y(sp.y), r * T * p.s, r * 0.7 * T * p.s, 0, 0, Math.PI * 2);
      c.stroke();
      c.restore();
      const text = `${sp.icon || ''} ${sp.label} · nhấp`;
      c.font = `600 ${Math.max(7, 5.6 * p.s)}px "Be Vietnam Pro", system-ui, sans-serif`;
      const w = c.measureText(text).width / (T * p.s) + 0.6;
      const bx = Math.max(1.1, Math.min(W - 1.1 - w, sp.x - w / 2));
      const by = Math.max(2.1, sp.y - r * 0.7 - 0.9);
      p.round(bx, by, w, 0.62, 4, 'rgba(120,53,15,0.94)', '#fbbf24');
      p.text(text, bx + w / 2, by + 0.32, 5.6, '#fef3c7');
    }

    drawEffects(p, now) {
      const c = p.c;
      this.effects = this.effects.filter((f) => now - f.t < 1600);
      for (const f of this.effects) {
        const k = (now - f.t) / 1600;
        if (k < 0) continue;
        c.globalAlpha = Math.max(0, 1 - k);
        c.font = `${Math.max(9, 9 * p.s)}px system-ui, "Segoe UI Emoji", sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(f.icon, p.X(f.x + f.vx * k), p.Y(f.y - k * 1.4));
      }
      c.globalAlpha = 1;
    }

    // ── Di chuyển ─────────────────────────────────────────────────────────
    goDesk(a) {
      a.target = 'desk';
      a.meetingSeat && this.meeting.delete(a.def.id);
      a.meetingSeat = null;
      this.walkTo(a, this.seats.get(a.def.id));
    }

    goMeeting(a) {
      if (a.target === 'meeting') return;
      a.target = 'meeting';
      const used = new Set([...this.meeting.values()]);
      const isLead = this.depts.some((d) => d.lead === a.def.id);
      let seat = isLead && !used.has(MEETING_SEATS[0]) ? MEETING_SEATS[0] : MEETING_SEATS.find((s, i) => i > 0 && !used.has(s));
      seat ??= { x: 2 + Math.random() * 13, y: 26.3, face: 'up' };
      this.meeting.set(a.def.id, seat);
      a.meetingSeat = seat;
      this.walkTo(a, seat);
    }

    goPantry(a, until) {
      if (a.target === 'pantry') {
        if (until) a.returnAt = Math.max(a.returnAt, until + Math.random() * 3000);
        return true;
      }
      const used = new Set([...this.agents.values()].filter((o) => o.target === 'pantry').map((o) => o.spot));
      const spot = PANTRY_SPOTS.find((s) => !used.has(s));
      if (!spot) return false;
      a.target = 'pantry';
      a.spot = spot;
      a.returnAt = until ? until + Math.random() * 3000 : performance.now() + 7000 + Math.random() * 7000;
      this.walkTo(a, spot);
      return true;
    }

    /** Giờ pantry (cho vui): agent đang rảnh ra pantry nghỉ giải lao rồi tự về — việc đang chạy không bị ảnh hưởng. */
    pantryTime(ms = 30000) {
      const now = performance.now();
      if (this.pantryUntil > now) return { n: 0, left: Math.ceil((this.pantryUntil - now) / 1000) };
      this.pantryUntil = now + ms;
      const lines = ['Pantry time! 🍱', 'Bánh mì ai ăn không?', 'Cho em ly trà đá 🧊', 'Nghỉ 5 phút nạp năng lượng ⚡', 'Hôm nay có bánh kem à? 🍰', 'Cà phê sữa đá nhé ☕'];
      let n = 0;
      for (const a of this.agents.values()) {
        if ((a.state?.status ?? 'idle') !== 'idle' || a.def.role === 'router' || a.target === 'meeting') continue;
        if (this.goPantry(a, this.pantryUntil)) {
          if (n < 4) setTimeout(() => this.say(a.def.id, lines[(n + Math.floor(now)) % lines.length], 5000), 400 + n * 500);
          n++;
        }
      }
      if (!n) {
        this.pantryUntil = 0;
        return { n, left: 0 };
      }
      this.effect('confetti', 37.3, 23.5);
      return { n, left: Math.round(ms / 1000) };
    }

    /** Hiệu ứng tại một đồ vật (khi nhấp trực tiếp, không cần nhân vật giám đốc đứng cạnh). */
    spotEffect(id, kind) {
      const sp = SPOTS.find((x) => x.id === id);
      if (sp) this.effect(kind, sp.x, sp.y + 1);
    }

    walkTo(a, dest) {
      if (!dest) return;
      a.dest = dest;
      const pts = this.route({ x: a.x, y: a.y }, dest);
      const path = [];
      let cur = { x: a.x, y: a.y };
      for (const pt of pts) {
        if (Math.abs(pt.x - cur.x) > 0.01 && Math.abs(pt.y - cur.y) > 0.01) path.push({ x: pt.x, y: cur.y });
        path.push(pt);
        cur = pt;
      }
      a.path = path;
    }

    route(p, q) {
      const ra = roomAt(p.x, p.y);
      const rb = roomAt(q.x, q.y);
      const nearestLane = (room, x) => (room.lanes.length ? room.lanes.reduce((b, l) => (Math.abs(l - x) < Math.abs(b - x) ? l : b), room.lanes[0]) : x);
      const leave = (rid, pt) => {
        const r = ROOMS[rid];
        if (!r) return [];
        const out = [];
        if (!(r.direct && r.direct(pt))) {
          const lane = nearestLane(r, pt.x);
          out.push({ x: lane, y: pt.y });
          out.push({ x: lane, y: r.aisleY });
        } else out.push({ x: pt.x, y: r.aisleY });
        out.push({ x: r.door.x, y: r.aisleY }, { x: r.door.x, y: r.door.y }, { x: r.door.x, y: CORRIDOR_Y });
        return out;
      };
      const enter = (rid, pt) => leave(rid, pt).reverse();
      const within = (rid, a, b) => {
        const r = ROOMS[rid];
        if (r.direct && r.direct(a) && r.direct(b)) return [{ x: a.x, y: r.aisleY }, { x: b.x, y: r.aisleY }, b];
        const la = nearestLane(r, a.x);
        const lb = nearestLane(r, b.x);
        return [{ x: la, y: a.y }, { x: la, y: r.aisleY }, { x: lb, y: r.aisleY }, { x: lb, y: b.y }, b];
      };
      // phòng Giám đốc ↔ Phát triển / Nghiên cứu: đi cửa tắt ở vách ngăn
      const side = ra === 'boss' && SIDE_DOORS[rb] ? rb : rb === 'boss' && SIDE_DOORS[ra] ? ra : null;
      if (side) {
        const d = SIDE_DOORS[side];
        const door = { x: d.inside, y: SIDE_Y };
        const gate = [{ x: d.wall + (d.wall === 25 ? 1.2 : -0.2), y: SIDE_Y }, { x: d.wall + (d.wall === 25 ? -0.2 : 1.2), y: SIDE_Y }];
        if (ra === 'boss') return [{ x: p.x, y: SIDE_Y }, ...gate, door, ...within(side, door, q)];
        return [...within(side, p, door).slice(0, -1), door, ...gate.reverse(), { x: q.x, y: SIDE_Y }, q];
      }
      if (ra === rb && ra !== 'corridor') {
        const r = ROOMS[ra];
        if (r.direct && r.direct(p) && r.direct(q)) return [{ x: p.x, y: r.aisleY }, { x: q.x, y: r.aisleY }, q];
        const la = nearestLane(r, p.x);
        const lb = nearestLane(r, q.x);
        return [{ x: la, y: p.y }, { x: la, y: r.aisleY }, { x: lb, y: r.aisleY }, { x: lb, y: q.y }, q];
      }
      const pts = [];
      if (ra !== 'corridor') pts.push(...leave(ra, p));
      else pts.push({ x: p.x, y: CORRIDOR_Y });
      if (rb !== 'corridor') pts.push(...enter(rb, q));
      else pts.push({ x: q.x, y: CORRIDOR_Y });
      pts.push(q);
      return pts;
    }

    tick(dt, now) {
      const speed = 5.2; // ô/giây
      for (const a of this.agents.values()) {
        if (a.path.length) {
          const tgt = a.path[0];
          const dx = tgt.x - a.x;
          const dy = tgt.y - a.y;
          const d = Math.hypot(dx, dy);
          const stepLen = speed * dt;
          if (d <= stepLen) {
            a.x = tgt.x;
            a.y = tgt.y;
            a.path.shift();
          } else {
            a.x += (dx / d) * stepLen;
            a.y += (dy / d) * stepLen;
          }
          a.face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
          a.step += dt * 14;
          if (!a.path.length) {
            a.step = 0;
            a.face = a.dest?.face ?? 'down';
          }
        } else {
          a.step = 0;
          const st = a.state?.status ?? 'idle';
          if (a.target === 'desk' && !a.path.length) {
            const seat = this.seats.get(a.def.id);
            if (seat && Math.abs(a.x - seat.x) < 0.05 && Math.abs(a.y - seat.y) < 0.05) a.face = st === 'idle' ? 'down' : 'up';
          }
          if (this.lively && st === 'idle' && a.target === 'desk' && a.def.role !== 'router' && now - a.idleSince > 12000 && Math.random() < dt / 40) {
            this.goPantry(a);
          }
          if (a.target === 'pantry' && now > a.returnAt) this.goDesk(a);
        }
        if (now > a.blinkAt) {
          a.blinkUntil = now + 140;
          a.blinkAt = now + 2500 + Math.random() * 4000;
        }
      }
      this.pops = this.pops.filter((p) => now - p.t < 1800);
      if (this.player) this.tickPlayer(dt);
    }

    // ── Vẽ ────────────────────────────────────────────────────────────────
    resize() {
      const el = this.canvas.parentElement;
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      this.canvas.width = Math.max(1, Math.floor(w * dpr));
      this.canvas.height = Math.max(1, Math.floor(h * dpr));
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
      const s = Math.min(this.canvas.width / (W * T), this.canvas.height / (H * T));
      this.s = s;
      this.ox = Math.floor((this.canvas.width - W * T * s) / 2);
      this.oy = Math.floor((this.canvas.height - H * T * s) / 2);
      this.dpr = dpr;
      this.bg = null;
    }

    painter(ctx) {
      return new Painter(ctx || this.ctx, this.s, this.ox, this.oy);
    }

    buildBackground() {
      const off = document.createElement('canvas');
      off.width = this.canvas.width;
      off.height = this.canvas.height;
      const ctx = off.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      const p = this.painter(ctx);
      ctx.fillStyle = '#0a0d13';
      ctx.fillRect(0, 0, off.width, off.height);

      // sàn
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const r = roomAt(x + 0.5, y + 0.5);
          let col;
          if (r === 'dev') col = y % 2 ? '#c49b63' : '#bd945c';
          else if (r === 'research') col = (x + y) % 2 ? '#463a6b' : '#4b3f72';
          else if (r === 'corridor') col = (x + y) % 2 ? '#8a93a3' : '#939cac';
          else if (r === 'meeting') col = (x + y) % 2 ? '#2d5a60' : '#2a555a';
          else if (r === 'director') col = y % 2 ? '#6e4631' : '#754b35';
          else if (r === 'boss') col = (x + y) % 2 ? '#e7e1d3' : '#ddd6c6';
          else if (r === 'fun') col = (x + y) % 2 ? '#d8d0ee' : '#cfc6e8';
          else col = (x + y) % 2 ? '#d6d0c2' : '#cdc6b6';
          p.rect(x, y, 1, 1, col);
          if (r === 'dev' && (x + (y % 2) * 3) % 6 === 0) p.rect(x, y, 0.06, 1, '#a9824e');
          if (r === 'research' && (x * 7 + y * 3) % 5 === 0) p.rect(x + 0.45, y + 0.45, 0.1, 0.1, '#5a4d85');
        }
      // thảm
      p.rect(19.2, 23.6, 6.6, 2.6, '#7f1d1d');
      p.rect(19.5, 23.9, 6.0, 2.0, '#991b1b');

      // tường
      const WALL = '#2b3349';
      const WALL_TOP = '#1e2436';
      const FACADE = '#3a4462';
      p.rect(0, 0, W, 2, FACADE);
      p.rect(0, 0, W, 0.35, WALL_TOP);
      p.rect(0, 1.82, W, 0.18, '#252c40');
      // cửa sổ
      for (const wx of [2.5, 6.5, 17.5, 21.0, 35.4, 47.6]) {
        p.rect(wx, 0.55, 2.4, 1.05, '#1e293b');
        p.rect(wx + 0.12, 0.65, 2.16, 0.85, '#7dd3fc');
        p.rect(wx + 0.12, 0.65, 2.16, 0.25, '#bae6fd');
        p.rect(wx + 1.15, 0.65, 0.1, 0.85, '#1e293b');
      }
      // biển tên phòng
      const sign = (x, y, w, label, color) => {
        p.round(x, y, w, 0.8, 3, '#0f1422', color);
        p.text(label, x + w / 2, y + 0.42, 6.2, '#e7eaf2');
      };
      sign(9.3, 0.6, 7.2, 'PHÒNG PHÁT TRIỂN DỰ ÁN', '#2563eb');
      sign(39.2, 0.6, 6.6, 'PHÒNG NGHIÊN CỨU', '#7c3aed');
      sign(27.4, 0.6, 4.4, 'GIÁM ĐỐC', '#ca8a04');
      // tường bao
      p.rect(0, 0, 1, H, WALL);
      p.rect(W - 1, 0, 1, H, WALL);
      p.rect(0, H - 1, W, 1, WALL);
      for (const x of [25, 33]) {
        p.rect(x, 0, 1, SIDE_DOOR[0], WALL);
        p.rect(x, SIDE_DOOR[1], 1, 16.4 - SIDE_DOOR[1], WALL);
        // khung cửa tắt + thảm chân
        p.rect(x - 0.1, SIDE_DOOR[0] - 0.12, 1.2, 0.12, '#64748b');
        p.rect(x - 0.1, SIDE_DOOR[1], 1.2, 0.12, '#64748b');
        p.rect(x + 0.1, SIDE_DOOR[0] + 0.25, 0.8, SIDE_DOOR[1] - SIDE_DOOR[0] - 0.5, 'rgba(202,138,4,0.35)');
      }
      // tường giữa phòng trên & hành lang (có cửa)
      const hwall = (y, h, gaps) => {
        let x = 1;
        for (const [g0, g1] of gaps) {
          p.rect(x, y, g0 - x, h, WALL);
          p.rect(x, y, g0 - x, 0.2, WALL_TOP);
          p.rect(g0 - 0.12, y - 0.1, 0.12, h + 0.2, '#64748b');
          p.rect(g1, y - 0.1, 0.12, h + 0.2, '#64748b');
          x = g1;
        }
        p.rect(x, y, W - 1 - x, h, WALL);
        p.rect(x, y, W - 1 - x, 0.2, WALL_TOP);
      };
      hwall(16, 1, DOORS_TOP);
      hwall(19, 1, DOORS_BOTTOM);
      p.rect(17, 19, 1, 8, WALL);
      p.rect(28, 19, 1, 8, WALL);
      p.rect(43, 19, 1, 8, WALL);
      sign(2.0, 19.1, 4.4, 'PHÒNG HỌP', '#0d9488');
      sign(23.6, 19.1, 4.0, 'ĐIỀU PHỐI', '#b91c1c');
      sign(37.2, 19.1, 3.6, 'PANTRY', '#d97706');

      // bàn làm việc
      const desk = (s, i, lead) => {
        const x = s.x;
        const y = s.y;
        const w = lead ? 3.4 : 3.0;
        p.rect(x - w / 2, y - 2.35, w, 0.95, '#9a6b43');
        p.rect(x - w / 2, y - 2.35, w, 0.12, '#b07f52');
        p.rect(x - w / 2, y - 1.4, w, 0.32, '#6f4a2c');
        p.rect(x - w / 2 + 0.1, y - 1.08, 0.18, 0.5, '#5a3b22');
        p.rect(x + w / 2 - 0.28, y - 1.08, 0.18, 0.5, '#5a3b22');
        // màn hình (khung)
        p.rect(x - 0.1, y - 2.5, 0.2, 0.32, '#374151');
        p.rect(x - 0.78, y - 3.3, 1.56, 0.92, '#111827');
        p.rect(x - 0.45, y - 1.98, 0.9, 0.18, '#cbd5e1');
        const r = hash(`desk${i}`);
        if (r % 3 === 0) p.rect(x + 0.9, y - 2.05, 0.28, 0.3, '#f8fafc');
        if (r % 3 === 1) {
          p.rect(x - 1.3, y - 2.2, 0.55, 0.42, '#fef3c7');
          p.rect(x - 1.25, y - 2.15, 0.45, 0.32, '#fde68a');
        }
        if (r % 4 === 2) {
          p.rect(x + 0.95, y - 2.6, 0.32, 0.38, '#b45309');
          p.rect(x + 0.88, y - 2.95, 0.46, 0.4, '#16a34a');
        }
      };
      DEV_SEATS.forEach((s, i) => desk(s, i, i === 0));
      RESEARCH_SEATS.forEach((s, i) => desk(s, i + 20, i === 0));
      desk(DIRECTOR_SEAT, 99, true);

      // giá sách phòng nghiên cứu
      const shelf = (x, y, h) => {
        p.rect(x, y, 1.6, h, '#5b3a22');
        const cols = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#14b8a6'];
        for (let r = 0; r < Math.floor(h / 0.9); r++) {
          p.rect(x + 0.08, y + 0.1 + r * 0.9 + 0.72, 1.44, 0.08, '#3f2716');
          for (let b = 0; b < 6; b++) p.rect(x + 0.12 + b * 0.24, y + 0.18 + r * 0.9 + (b % 3) * 0.05, 0.18, 0.55 - (b % 3) * 0.05, cols[(b + r * 2) % cols.length]);
        }
      };
      shelf(49.2, 2.6, 4.6);
      shelf(49.2, 8.2, 4.6);
      shelf(34.2, 2.4, 0.95);
      shelf(18.3, 20.2, 1.85);
      // cây xanh
      const plant = (x, y, big) => {
        p.rect(x - 0.3, y - 0.45, 0.6, 0.45, '#92400e');
        p.rect(x - 0.36, y - 0.5, 0.72, 0.12, '#b45309');
        const k = big ? 1.25 : 1;
        p.rect(x - 0.45 * k, y - 1.15 * k, 0.9 * k, 0.75 * k, '#15803d');
        p.rect(x - 0.3 * k, y - 1.45 * k, 0.6 * k, 0.4 * k, '#16a34a');
        p.rect(x - 0.15 * k, y - 0.95 * k, 0.3 * k, 0.3 * k, '#22c55e');
      };
      plant(1.7, 3.2, true);
      plant(24.2, 3.2, true);
      plant(24.2, 15.4);
      plant(34.8, 15.4);
      plant(16.2, 26.6);
      plant(42.3, 26.6, true);
      plant(29.6, 26.6);
      plant(1.6, 26.6);
      // bảng trắng phòng dev
      p.rect(2.6, 2.1, 4.2, 0.12, '#94a3b8');

      // phòng họp: ghế
      for (const s of MEETING_SEATS) p.rect(s.x - 0.42, s.y - 0.5, 0.84, 0.5, '#334155');
      // ghế phòng điều phối
      p.rect(19.0, 25.8, 1.3, 0.6, '#475569');
      // pantry
      p.rect(39.7, 20.1, 1.3, 1.2, '#374151'); // máy pha cà phê
      p.rect(39.85, 20.25, 1.0, 0.45, '#111827');
      p.rect(40.15, 20.85, 0.4, 0.3, '#f8fafc');
      p.rect(30.2, 20.1, 0.8, 1.2, '#e2e8f0'); // cây nước
      p.rect(30.3, 20.0, 0.6, 0.45, '#7dd3fc');
      p.rect(30.0, 24.6, 4.4, 1.4, '#1d4ed8'); // sofa
      p.rect(30.0, 24.6, 4.4, 0.45, '#1e40af');
      p.rect(30.0, 24.6, 0.4, 1.4, '#1e3a8a');
      p.rect(34.0, 24.6, 0.4, 1.4, '#1e3a8a');
      p.round(36.0, 22.7, 2.6, 1.6, 8, '#a16207'); // bàn tròn
      p.round(36.2, 22.85, 2.2, 1.2, 8, '#ca8a04');
      p.rect(37.0, 23.05, 0.25, 0.25, '#f8fafc');
      p.rect(31.5, 22.4, 1.6, 0.9, '#78350f'); // bàn nhỏ
      // TV phòng điều phối
      p.rect(23.9, 20.15, 3.6, 1.25, '#0f172a');

      // ── Phòng giám đốc ──
      p.rect(26.2, 3.2, 6.6, 0.08, '#cbb89a'); // phào tường
      p.rect(27.0, 2.15, 5.2, 1.35, '#0f172a'); // màn hình bảng điều khiển (vẽ nội dung động)
      p.rect(27.1, 9.0, 5.0, 3.2, '#9f1239'); // thảm
      p.rect(27.3, 9.2, 4.6, 2.8, '#be123c');
      // bàn giám đốc chữ U
      p.rect(BOSS_SEAT.x - 2.2, BOSS_SEAT.y - 2.5, 4.4, 1.0, '#5b3a22');
      p.rect(BOSS_SEAT.x - 2.2, BOSS_SEAT.y - 2.5, 4.4, 0.14, '#7c5233');
      p.rect(BOSS_SEAT.x - 2.2, BOSS_SEAT.y - 1.5, 4.4, 0.35, '#3f2716');
      p.rect(BOSS_SEAT.x - 0.8, BOSS_SEAT.y - 2.9, 1.6, 0.7, '#111827'); // laptop
      p.rect(BOSS_SEAT.x - 0.7, BOSS_SEAT.y - 2.82, 1.4, 0.5, '#1e3a8a');
      p.rect(BOSS_SEAT.x + 1.2, BOSS_SEAT.y - 2.4, 0.45, 0.3, '#fef3c7'); // giấy tờ
      p.rect(BOSS_SEAT.x - 1.9, BOSS_SEAT.y - 2.45, 0.32, 0.36, '#f8fafc'); // cốc
      p.rect(BOSS_SEAT.x - 1.6, BOSS_SEAT.y - 2.75, 0.5, 0.35, '#16a34a'); // cây nhỏ
      // ghế giám đốc (lưng ghế vẽ theo lớp z)
      // giá sách
      p.rect(31.6, 2.6, 1.3, 4.0, '#5b3a22');
      for (let r = 0; r < 4; r++) for (let b = 0; b < 4; b++) p.rect(31.7 + b * 0.27, 2.75 + r * 0.95, 0.18, 0.62, ['#f59e0b', '#0ea5e9', '#a855f7', '#ef4444', '#22c55e'][(b + r) % 5]);
      // sofa + bàn trà tiếp khách
      p.rect(27.6, 13.6, 4.0, 1.2, '#334155');
      p.rect(27.6, 13.6, 4.0, 0.4, '#1e293b');
      p.round(28.7, 11.4, 1.8, 1.0, 6, '#a16207');
      p.rect(29.4, 11.6, 0.3, 0.3, '#f8fafc');
      // góc giải trí: đàn + máy chơi game
      p.rect(44.9, 23.2, 1.5, 1.2, '#111827');
      for (let k = 0; k < 6; k++) p.rect(45.0 + k * 0.22, 23.3, 0.17, 0.5, '#f8fafc');
      p.rect(48.9, 23.0, 1.3, 1.6, '#7c3aed');
      p.rect(49.05, 23.15, 1.0, 0.65, '#0f172a');
      p.rect(49.2, 24.0, 0.2, 0.2, '#ef4444');
      p.rect(49.6, 24.0, 0.2, 0.2, '#22c55e');
      plant(50.4, 27 - 0.4, true);
      plant(32.4, 15.4);
      plant(26.6, 15.4);
      sign(46.1, 19.1, 4.8, 'GÓC GIẢI TRÍ', '#7c3aed');
      this.bg = off;
    }

    drawMeetingTable(p) {
      p.rect(4.0, 22.2, 9.6, 1.95, '#7c4a2a');
      p.rect(4.0, 22.2, 9.6, 0.2, '#9a6b43');
      p.rect(4.0, 23.95, 9.6, 0.2, '#5a3b22');
      for (const x of [5.4, 8.2, 11.0]) p.rect(x, 22.65, 0.9, 0.55, '#f1f5f9');
    }

    drawScreens(p, now) {
      const seatsWithOwner = [...this.seats.entries()].filter(([, s]) => s === DIRECTOR_SEAT || DEV_SEATS.includes(s) || RESEARCH_SEATS.includes(s));
      for (const [id, s] of seatsWithOwner) {
        const a = this.agents.get(id);
        const st = a?.state?.status ?? 'idle';
        const atDesk = a && Math.abs(a.x - s.x) < 0.1 && Math.abs(a.y - s.y) < 0.1;
        const x0 = s.x - 0.68;
        const y0 = s.y - 3.2;
        const active = atDesk && ['working', 'thinking', 'reviewing'].includes(st);
        p.rect(x0, y0, 1.36, 0.72, active ? '#0c2d48' : '#0b1220');
        if (active) {
          const t = now / 1000;
          const col = st === 'reviewing' ? '#fbbf24' : st === 'thinking' ? '#93c5fd' : '#5eead4';
          for (let r = 0; r < 4; r++) {
            const w = 0.25 + ((Math.sin(t * 2 + r * 1.7 + hash(id) % 7) + 1) / 2) * 0.85;
            p.rect(x0 + 0.1 + (r % 2) * 0.12, y0 + 0.1 + r * 0.15, Math.min(1.1, w), 0.07, col);
          }
          if (Math.floor(t * 2) % 2) p.rect(x0 + 1.15, y0 + 0.55, 0.08, 0.08, '#e2e8f0');
        } else {
          p.rect(x0 + 0.6, y0 + 0.32, 0.08, 0.08, st === 'error' ? '#ef4444' : '#334155');
        }
      }
      // TV điều phối
      p.rect(24.0, 20.25, 3.4, 1.05, '#0b1220');
      p.text(this.runningCount ? `${this.runningCount} việc đang chạy` : 'Sẵn sàng', 25.7, 20.62, 5.2, this.runningCount ? '#5eead4' : '#94a3b8');
      p.text(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }), 25.7, 21.02, 5, '#64748b', 'center', 500);
      // bảng điều khiển phòng giám đốc
      p.rect(27.1, 2.25, 5.0, 1.15, '#0b1220');
      const dash = this.dashboard || {};
      p.text(dash.line1 || 'Bảng điều khiển', 29.6, 2.62, 5, '#fbbf24');
      p.text(dash.line2 || `${this.runningCount} việc đang chạy`, 29.6, 3.05, 4.6, '#94a3b8', 'center', 500);
      // giờ pantry
      if (this.pantryUntil > now) {
        const left = Math.ceil((this.pantryUntil - now) / 1000);
        p.round(31.4, 20.1, 6.4, 0.9, 4, 'rgba(146,64,14,0.95)', '#fbbf24');
        p.text(`🍱 PANTRY TIME · ${left}s`, 34.6, 20.56, 5.6, '#fef3c7', 'center', 700);
      }
      // bảng trắng phòng họp
      p.rect(9.8, 20.15, 6.6, 1.0, '#f8fafc');
      p.rect(9.8, 21.1, 6.6, 0.08, '#94a3b8');
      const title = this.meetingTitle ? `Họp: ${this.meetingTitle}` : 'Phòng họp đang trống';
      p.text(title.length > 34 ? title.slice(0, 33) + '…' : title, 13.1, 20.62, 5.2, this.meetingTitle ? '#be185d' : '#64748b');
    }

    drawTag(p, a, now) {
      const name = a.def.short || a.def.name;
      const st = a.state?.status ?? 'idle';
      const lead = this.depts.some((d) => d.lead === a.def.id);
      const y = a.y - 1.62;
      const c = p.c;
      const speaking = a.bubble && now < a.bubble.until;
      // Trong phòng họp ghế sát nhau: chỉ hiện nhãn của trưởng phòng, người đang nói, người được chọn/rê chuột
      const compact = a.target === 'meeting' && !a.path.length && !lead && !speaking && this.hover !== a.def.id && this.selected !== a.def.id;
      if (compact) {
        p.round(a.x - 0.12, y - 0.12, 0.24, 0.24, 3, STATUS_COLOR[st] ?? '#64748b');
      } else {
        c.font = `600 ${Math.max(7, 6 * p.s)}px "Be Vietnam Pro", system-ui, sans-serif`;
        const wpx = c.measureText(name).width / (T * p.s) + 0.75;
        p.round(a.x - wpx / 2, y - 0.3, wpx, 0.58, 3, 'rgba(10,13,20,0.82)', lead ? '#f59e0b' : null);
        p.round(a.x - wpx / 2 + 0.14, y - 0.07, 0.14, 0.14, 2, STATUS_COLOR[st] ?? '#64748b');
        p.text(name, a.x + 0.09, y, 6, '#e7eaf2');
      }
      // bong bóng
      let text = null;
      let style = 'say';
      if (a.bubble && now < a.bubble.until) text = a.bubble.text;
      else if (st === 'working' || st === 'reviewing') {
        text = a.state.activity || (st === 'reviewing' ? 'Đang review' : 'Đang làm');
        style = 'act';
      } else if (st === 'thinking') {
        text = (a.state.activity ? a.state.activity + ' ' : '') + '.'.repeat(1 + (Math.floor(now / 400) % 3));
        style = 'act';
      } else if (st === 'error') {
        text = '⚠ ' + (a.state.activity || 'lỗi');
        style = 'err';
      }
      if (text) {
        const lines = wrap(text, style === 'say' ? 30 : 26);
        c.font = `500 ${Math.max(7, 5.6 * p.s)}px "Be Vietnam Pro", system-ui, sans-serif`;
        const lw = Math.max(...lines.map((l) => c.measureText(l).width)) / (T * p.s) + 0.6;
        const lh = 0.42;
        const bh = lines.length * lh + 0.3;
        const bx = Math.max(1.1, Math.min(W - 1.1 - lw, a.x - lw / 2));
        const by = y - 0.42 - bh;
        const bg = style === 'say' ? 'rgba(248,250,252,0.97)' : style === 'err' ? 'rgba(127,29,29,0.92)' : 'rgba(15,23,42,0.88)';
        const fg = style === 'say' ? '#0f172a' : style === 'err' ? '#fee2e2' : '#a5f3fc';
        p.round(bx, by, lw, bh, 4, bg, style === 'say' ? '#cbd5e1' : '#1e3a5f');
        p.rect(a.x - 0.1, by + bh - 0.02, 0.2, 0.16, bg);
        lines.forEach((l, i) => p.text(l, bx + 0.3, by + 0.36 + i * lh, 5.6, fg, 'left', 500));
      }
    }

    loop(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt, now);
      this.draw(now);
      requestAnimationFrame((t) => this.loop(t));
    }

    draw(now) {
      const ctx = this.ctx;
      ctx.imageSmoothingEnabled = false;
      if (!this.bg) this.buildBackground();
      ctx.drawImage(this.bg, 0, 0);
      const p = this.painter();
      this.drawScreens(p, now);
      // lớp z theo y: nhân vật + bàn họp + lưng ghế
      const items = [];
      items.push({ y: 22.4, draw: () => this.drawMeetingTable(p) });
      for (const a of this.agents.values()) {
        items.push({
          y: a.y,
          draw: () => {
            const st = a.state?.status ?? 'idle';
            const ring = this.selected === a.def.id ? '#f59e0b' : this.hover === a.def.id ? '#e2e8f0' : null;
            drawCharacter(p, a.x, a.y, a.def.look, a.face, a.path.length ? a.step : 0, {
              ring,
              blink: now < (a.blinkUntil ?? 0),
              glow: st === 'working' && a.face === 'up',
            });
          },
        });
        const seat = this.seats.get(a.def.id);
        if (seat && seat.face === 'up') items.push({ y: seat.y + 0.12, draw: () => p.rect(seat.x - 0.5, seat.y - 0.18, 1.0, 0.34, '#3f4a5f') });
      }
      if (this.player) {
        const pl = this.player;
        items.push({ y: pl.y, draw: () => drawCharacter(p, pl.x, pl.y, pl.look, pl.face, pl.step, { ring: '#fbbf24', tie: '#dc2626', blink: false }) });
        items.push({ y: BOSS_SEAT.y - 0.9, draw: () => { p.rect(BOSS_SEAT.x - 0.6, BOSS_SEAT.y - 1.0, 1.2, 0.5, '#1f2937'); p.rect(BOSS_SEAT.x - 0.6, BOSS_SEAT.y - 1.0, 1.2, 0.12, '#374151'); } });
      }
      items.sort((a, b) => a.y - b.y).forEach((i) => i.draw());
      for (const a of this.agents.values()) this.drawTag(p, a, now);
      if (this.hoverSpot) this.drawSpotHint(p, this.hoverSpot);
      if (this.player) this.drawPlayer(p, now);
      this.drawEffects(p, now);
      for (const pop of this.pops) {
        const k = (now - pop.t) / 1800;
        ctx.globalAlpha = 1 - k;
        p.text(pop.text, pop.x + 0.6, pop.y - 2.2 - k * 1.2, 6, '#fbbf24', 'left', 700);
        ctx.globalAlpha = 1;
      }
    }

    onMove(e) {
      const r = this.canvas.getBoundingClientRect();
      const mx = ((e.clientX - r.left) * this.dpr - this.ox) / (T * this.s);
      const my = ((e.clientY - r.top) * this.dpr - this.oy) / (T * this.s);
      let best = null;
      let bestD = 1e9;
      for (const a of this.agents.values()) {
        if (mx > a.x - 0.5 && mx < a.x + 0.5 && my > a.y - 1.95 && my < a.y + 0.1) {
          const d = Math.abs(a.y - my);
          if (d < bestD) {
            best = a.def.id;
            bestD = d;
          }
        }
      }
      // không trỏ vào agent → đồ vật / phòng có thể nhấp để tương tác
      let spot = null;
      if (!best) {
        let sd = 1e9;
        for (const sp of SPOTS) {
          const d = Math.hypot(sp.x - mx, (sp.y - my) * 1.3);
          if (d < Math.min(sp.r, 1.6) && d < sd) {
            sd = d;
            spot = sp;
          }
        }
      }
      this.hoverSpot = spot;
      if (best !== this.hover || !!spot !== !!this.hoverSpotOn) {
        this.hover = best;
        this.hoverSpotOn = !!spot;
        this.canvas.style.cursor = best || spot ? 'pointer' : 'default';
      }
      this.opts.onHover?.(best, e.clientX - r.left, e.clientY - r.top);
    }
  }

  /** Vẽ chân dung nhỏ của agent (dùng trong danh sách). */
  function drawAvatar(canvas, look, face = 'down') {
    const size = canvas.width;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    const s = size / 22;
    const p = new Painter(ctx, s, 0, 0);
    drawCharacter(p, 11 / 16, 20 / 16, look, face, 0, {});
  }

  window.Office = Office;
  window.drawAvatar = drawAvatar;
  window.STATUS_COLOR = STATUS_COLOR;
})();
