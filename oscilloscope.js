/**
 * Oscilloscope — EKG heartbeat.
 * One spike per incoming SSE chunk.
 * Renders as a thin canvas strip inside the pill.
 * Amplitude encodes chunk cadence (time since last chunk).
 */
export class Oscilloscope {
  constructor(root) {
    this._canvas = document.createElement("canvas");
    this._canvas.style.cssText = `
      position: absolute;
      left: 40px;
      top: 50%;
      transform: translateY(-50%);
      width: 160px;
      height: 24px;
      opacity: 0.7;
      pointer-events: none;
    `;
    root.appendChild(this._canvas);

    this._ctx = this._canvas.getContext("2d");
    this._canvas.width = 320;  // 2x for retina
    this._canvas.height = 48;

    this._points = new Float32Array(320).fill(0);
    this._lastPulseTime = 0;
    this._running = false;
    this._raf = null;

    this._draw();
  }

  start() {
    this._running = true;
    this._canvas.style.opacity = "0.7";
    if (!this._raf) this._tick();
  }

  stop() {
    this._running = false;
    this._canvas.style.opacity = "0";
  }

  /** Called on each incoming chunk. ts_ms = timestamp from extension. */
  pulse(ts_ms) {
    if (!this._running) return;

    const now = performance.now();
    const gap = ts_ms ? Math.min(now - this._lastPulseTime, 2000) : 500;
    this._lastPulseTime = now;

    // Amplitude: faster gaps = taller spike (max cadence = tall)
    const amp = Math.max(0.2, 1.0 - gap / 1000);

    // Inject spike into points buffer (3-sample QRS shape)
    const w = this._points.length;
    this._points[w - 4] = -amp * 0.3;
    this._points[w - 3] =  amp;
    this._points[w - 2] = -amp * 0.5;
    this._points[w - 1] =  0;
  }

  _tick() {
    if (!this._running) { this._raf = null; return; }
    this._raf = requestAnimationFrame(() => this._tick());

    // Scroll points left
    this._points.copyWithin(0, 1);
    this._points[this._points.length - 1] = 0;

    this._draw();
  }

  _draw() {
    const ctx = this._ctx;
    const w = this._canvas.width;
    const h = this._canvas.height;
    const mid = h / 2;

    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.strokeStyle = "rgba(80, 220, 180, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";

    for (let i = 0; i < this._points.length; i++) {
      const x = i;
      const y = mid - this._points[i] * (h * 0.42);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Glow pass
    ctx.shadowBlur = 6;
    ctx.shadowColor = "rgba(80, 220, 180, 0.5)";
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}
