// Chân dung pixel của agent (tự vẽ, không dùng tài nguyên ngoài) — dùng ở danh sách, hồ sơ, văn phòng.
// Tách từ office.js cũ (UX-4b) khi văn phòng chuyển sang dạng tối giản theo phòng ban.
(function () {
  const T = 16; // pixel cơ sở / ô
  const STATUS_COLOR = {
    idle: '#64748b', thinking: '#60a5fa', working: '#22d3ee', discussing: '#e879f9',
    reviewing: '#fbbf24', waiting: '#94a3b8', error: '#f87171',
  };

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

  window.drawAvatar = drawAvatar;
  window.STATUS_COLOR = STATUS_COLOR;
})();
