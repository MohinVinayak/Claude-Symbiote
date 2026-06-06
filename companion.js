/**
 * Companion — 48×64px pixel-art sprite living in the bottom-right corner of the pill.
 * States: idle | thinking | streaming_text | streaming_code | error | done
 *
 * Sprites are drawn programmatically at 6×8 pixel-art scale (8px per "pixel").
 * In production, swap _drawState() for a real spritesheet.
 */
export class Companion {
  constructor(root) {
    this._state = "idle";
    this._frame = 0;
    this._frameTimer = 0;

    this._canvas = document.createElement("canvas");
    this._canvas.width = 48;
    this._canvas.height = 64;
    this._canvas.style.cssText = `
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      image-rendering: pixelated;
      image-rendering: crisp-edges;
      pointer-events: none;
    `;
    root.appendChild(this._canvas);

    this._ctx = this._canvas.getContext("2d");
    this._tick();
  }

  setState(s) {
    if (this._state !== s) {
      this._state = s;
      this._frame = 0;
    }
  }

  show() { this._canvas.style.display = "block"; }
  hide() { this._canvas.style.display = "none"; }

  _tick() {
    requestAnimationFrame(() => this._tick());
    this._frameTimer++;

    const fps = STATE_FPS[this._state] ?? 8;
    const interval = Math.round(60 / fps);
    if (this._frameTimer >= interval) {
      this._frameTimer = 0;
      this._frame = (this._frame + 1) % (FRAME_COUNT[this._state] ?? 2);
    }

    this._draw();
  }

  _draw() {
    const ctx = this._ctx;
    const S = 6; // px per pixel-art pixel
    ctx.clearRect(0, 0, 48, 64);
    this._drawState(ctx, S, this._state, this._frame);
  }

  // ── Programmatic placeholder sprites ──────────────────────────────────────
  // Each function draws a tiny pixel-art figure in the given state.
  // Replace with: ctx.drawImage(spritesheet, srcX, srcY, 48, 64, 0, 0, 48, 64)
  _drawState(ctx, S, state, frame) {
    switch (state) {
      case "idle":          return this._drawIdle(ctx, S, frame);
      case "thinking":      return this._drawThinking(ctx, S, frame);
      case "streaming_text":return this._drawStreamText(ctx, S, frame);
      case "streaming_code":return this._drawStreamCode(ctx, S, frame);
      case "error":         return this._drawError(ctx, S, frame);
      case "done":          return this._drawDone(ctx, S, frame);
      default:              return this._drawIdle(ctx, S, frame);
    }
  }

  _px(ctx, S, col, row, color) {
    ctx.fillStyle = color;
    ctx.fillRect(col * S, row * S, S, S);
  }

  _drawBase(ctx, S, eyeOpen = true, blush = false) {
    const px = (c, r, col) => this._px(ctx, S, c, r, col);
    // Body
    px(2,4,"#b0c4de"); px(3,4,"#b0c4de"); px(4,4,"#b0c4de"); px(5,4,"#b0c4de");
    px(2,5,"#b0c4de"); px(3,5,"#b0c4de"); px(4,5,"#b0c4de"); px(5,5,"#b0c4de");
    px(2,6,"#8ca9c0"); px(3,6,"#8ca9c0"); px(4,6,"#8ca9c0"); px(5,6,"#8ca9c0");
    // Head
    px(2,1,"#ffe0b2"); px(3,1,"#ffe0b2"); px(4,1,"#ffe0b2"); px(5,1,"#ffe0b2");
    px(2,2,"#ffe0b2"); px(3,2,"#ffe0b2"); px(4,2,"#ffe0b2"); px(5,2,"#ffe0b2");
    px(2,3,"#ffe0b2"); px(3,3,"#ffe0b2"); px(4,3,"#ffe0b2"); px(5,3,"#ffe0b2");
    // Eyes
    if (eyeOpen) {
      px(2,2,"#333"); px(5,2,"#333");
    } else {
      px(2,2,"#ffe0b2"); px(5,2,"#ffe0b2");
      px(2,3,"#555"); px(3,3,"#555"); // closed line
      px(4,3,"#555"); px(5,3,"#555");
    }
    if (blush) {
      px(1,3,"#ffaaaa"); px(6,3,"#ffaaaa");
    }
    // Legs
    px(2,7,"#8ca9c0"); px(5,7,"#8ca9c0");
  }

  _drawIdle(ctx, S, frame) {
    // Slow blink: frame 0-5 open, frame 6 closed
    this._drawBase(ctx, S, frame < 6);
    // Sway: nudge body 1px left/right
    if (frame % 4 < 2) ctx.translate(1, 0);
  }

  _drawThinking(ctx, S, frame) {
    this._drawBase(ctx, S, true);
    // Antenna spin — small dot above head
    const angle = (frame / 4) * Math.PI * 2;
    const ax = 24 + Math.cos(angle) * 4;
    const ay = 4 + Math.sin(angle) * 2;
    ctx.beginPath();
    ctx.arc(ax, ay, 2, 0, Math.PI * 2);
    ctx.fillStyle = "#6eb5ff";
    ctx.fill();
    // Eyes up
    const px = (c, r, col) => this._px(ctx, S, c, r, col);
    px(2,1,"#333"); px(5,1,"#333");
  }

  _drawStreamText(ctx, S, frame) {
    this._drawBase(ctx, S, true);
    // Eyes dart left / right
    const px = (c, r, col) => this._px(ctx, S, c, r, col);
    if (frame % 2 === 0) {
      px(2,2,"#333"); px(3,2,"#333"); // dart left
    } else {
      px(4,2,"#333"); px(5,2,"#333"); // dart right
    }
  }

  _drawStreamCode(ctx, S, frame) {
    // Hunched forward pose
    const px = (c, r, col) => this._px(ctx, S, c, r, col);
    this._drawBase(ctx, S, true);
    // Arms extended (typing)
    const armY = frame % 2 === 0 ? 5 : 6;
    px(1, armY, "#8ca9c0");
    px(6, armY, "#8ca9c0");
  }

  _drawError(ctx, S, frame) {
    // RGB channel split glitch
    const px = (c, r, col) => this._px(ctx, S, c, r, col);
    const offset = frame % 3;
    ctx.globalAlpha = 0.6;
    ctx.translate(-offset, 0);
    this._drawBase(ctx, S, true);
    ctx.translate(offset * 2, 0);
    ctx.fillStyle = "#ff3333";
    ctx.globalAlpha = 0.4;
    this._drawBase(ctx, S, true);
    ctx.globalAlpha = 1.0;
    ctx.resetTransform();
    // X eyes
    px(2,2,"#ff3333"); px(3,3,"#ff3333");
    px(5,2,"#ff3333"); px(4,3,"#ff3333");
  }

  _drawDone(ctx, S, frame) {
    this._drawBase(ctx, S, true, true); // blush on
    // Jump offset
    const jumpY = frame < 2 ? -S : 0;
    ctx.translate(0, jumpY);
    // Sparkles
    if (frame < 3) {
      const px = (c, r, col) => this._px(ctx, S, c, r, col);
      px(0, 0, "#ffd700"); px(7, 1, "#ffd700");
    }
  }
}

const STATE_FPS = {
  idle: 4, thinking: 8, streaming_text: 12,
  streaming_code: 8, error: 12, done: 8,
};

const FRAME_COUNT = {
  idle: 8, thinking: 8, streaming_text: 4,
  streaming_code: 4, error: 3, done: 6,
};
