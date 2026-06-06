/**
 * global_ui.js — runs on ALL tabs.
 * 
 * Injects the Symbiote floating pill overlay.
 * Listens to background.js for state updates.
 * Supports dragging and drag-to-dismiss (global visibility toggle).
 */

let ui = null;

function injectUI() {
  if (document.getElementById("symbiote-overlay-root")) return null;

  const container = document.createElement("div");
  container.id = "symbiote-overlay-root";
  container.style.cssText = `
    position: fixed;
    top: 0; left: 0; width: 100vw; height: 100vh;
    z-index: 2147483647; /* max z-index */
    pointer-events: none; /* Let clicks pass through by default */
    display: none; /* hidden by default until we get visibility state */
  `;

  const shadow = container.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    #pill-container {
      position: absolute;
      top: 24px;
      right: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: #1a1a1a;
      padding: 12px 24px 12px 18px;
      border-radius: 50px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
      transition: border-color 0.3s ease, box-shadow 0.3s ease;
      font-family: -apple-system, 'SF Pro Display', 'Inter', sans-serif;
      user-select: none;
      touch-action: none; /* prevent scrolling while dragging */
      cursor: grab;
      overflow: hidden;
      pointer-events: auto; /* Catch clicks */
      transform: translate(0px, 0px) scale(1);
    }
    #pill-container:active {
      cursor: grabbing;
      transform: translate(0px, 0px) scale(0.97);
    }
    #pill-container.dragging {
      transition: none; /* No transition while actively dragging */
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.8);
      opacity: 0.9;
    }
    #pill-container.dismissing {
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      transform: scale(0) !important;
      opacity: 0;
    }
    
    .sparkle-wrapper {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .sparkle-svg {
      width: 100%;
      height: 100%;
      fill: #7f7f7f;
      transition: fill 0.3s ease;
    }
    
    #pill-container.active .sparkle-svg {
      fill: #d97757;
      animation: spin 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }
    #pill-container.error .sparkle-svg {
      fill: #e05252;
      animation: none;
    }
    
    @keyframes spin {
      0%   { transform: rotate(0deg) scale(1); }
      50%  { transform: rotate(90deg) scale(1.12); }
      100% { transform: rotate(180deg) scale(1); }
    }
    
    #status-text {
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.2px;
      color: #ffffff;
      white-space: nowrap;
    }

    /* Dismiss Zone */
    #dismiss-zone {
      position: absolute;
      bottom: 40px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(8px);
    }
    #dismiss-zone.visible {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }
    #dismiss-zone.hover {
      background: rgba(224, 82, 82, 0.9);
      border-color: rgba(255, 255, 255, 0.3);
      transform: translateX(-50%) scale(1.2);
    }
    #dismiss-zone svg {
      width: 24px;
      height: 24px;
      fill: #ffffff;
    }
  `;

  const html = `
    <div id="pill-container">
      <div class="sparkle-wrapper">
        <svg class="sparkle-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
          <path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
94:         </svg>
95:       </div>
96:       <span id="status-text">Idle</span>
97:     </div>
98:     <div id="dismiss-zone">
99:       <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
100:     </div>
101:   `;
102: 
103:   shadow.appendChild(style);
104:   const wrapper = document.createElement('div');
105:   wrapper.innerHTML = html;
106:   shadow.appendChild(wrapper);
107: 
108:   document.documentElement.appendChild(container);
109: 
110:   const pill = shadow.getElementById('pill-container');
111:   const dismissZone = shadow.getElementById('dismiss-zone');
112:   
113:   // Dragging state
114:   let isDragging = false;
115:   let hasMoved = false; // to distinguish click from drag
116:   let startX = 0, startY = 0;
117:   let currentX = 0, currentY = 0;
118:   let initialPillRect = null;
119: 
120:   pill.addEventListener('pointerdown', (e) => {
121:     if (e.button !== 0) return; // Only left click
122:     isDragging = true;
123:     hasMoved = false;
124:     startX = e.clientX - currentX;
125:     startY = e.clientY - currentY;
126:     
127:     pill.setPointerCapture(e.pointerId);
128:     pill.classList.add('dragging');
129:     dismissZone.classList.add('visible');
130:     
131:     // Get bounds to clamp movement within the viewport
132:     initialPillRect = pill.getBoundingClientRect();
133:   });
134: 
135:   pill.addEventListener('pointermove', (e) => {
136:     if (!isDragging) return;
137:     
138:     // Check if moved enough to be considered a drag
139:     if (Math.abs(e.clientX - startX - currentX) > 3 || Math.abs(e.clientY - startY - currentY) > 3) {
140:       hasMoved = true;
141:     }
142:     
143:     if (hasMoved) {
144:       currentX = e.clientX - startX;
145:       currentY = e.clientY - startY;
146:       
147:       // Apply transform
148:       pill.style.transform = \`translate(\${currentX}px, \${currentY}px)\`;
149: 
150:       // Collision detection with dismiss zone
151:       const pillRect = pill.getBoundingClientRect();
152:       const dismissRect = dismissZone.getBoundingClientRect();
153:       
154:       const isColliding = !(
155:         pillRect.right < dismissRect.left ||
156:         pillRect.left > dismissRect.right ||
157:         pillRect.bottom < dismissRect.top ||
158:         pillRect.top > dismissRect.bottom
159:       );
160: 
161:       if (isColliding) {
162:         dismissZone.classList.add('hover');
163:       } else {
164:         dismissZone.classList.remove('hover');
165:       }
166:     }
167:   });
168: 
169:   pill.addEventListener('pointerup', (e) => {
170:     if (!isDragging) return;
171:     isDragging = false;
172:     pill.releasePointerCapture(e.pointerId);
173:     pill.classList.remove('dragging');
174:     dismissZone.classList.remove('visible');
175:     
176:     const isHoveringDismiss = dismissZone.classList.contains('hover');
177:     dismissZone.classList.remove('hover');
178: 
179:     if (isHoveringDismiss) {
180:       // Dismiss triggered
181:       pill.classList.add('dismissing');
182:       
183:       // Tell background to save global state
184:       try {
185:         if (chrome.runtime && chrome.runtime.id) {
186:           chrome.runtime.sendMessage({ type: "SET_VISIBILITY", payload: false }, () => chrome.runtime.lastError);
187:         }
188:       } catch (err) {}
189:       
190:       // Reset position for when it comes back
191:       setTimeout(() => {
192:         pill.classList.remove('dismissing');
193:         currentX = 0; currentY = 0;
194:         pill.style.transform = \`translate(0px, 0px)\`;
195:       }, 300);
196:       return;
197:     }
198: 
199:     if (!hasMoved) {
200:       // It was a click, not a drag. Focus Claude.
201:       try {
202:         if (chrome.runtime && chrome.runtime.id) {
203:           chrome.runtime.sendMessage({ type: 'FOCUS_CLAUDE' }, () => chrome.runtime.lastError);
204:         }
205:       } catch (err) {}
206:     }
207:   });
208: 
209:   return {
210:     container,
211:     pill,
212:     statusText: shadow.getElementById('status-text'),
213:     sparkle: shadow.querySelector('.sparkle-svg')
214:   };
215: }
216: 
217: const STATE_CONFIGS = {
218:   idle:           { label: 'Idle',                 icon: 'grey' },
219:   thinking:       { label: 'Claude is thinking…',  icon: 'active' },
220:   streaming_text: { label: 'Writing…',             icon: 'active' },
221:   streaming_code: { label: 'Writing code…',        icon: 'active' },
222:   error:          { label: 'Something went wrong', icon: 'error' },
223:   done:           { label: 'Done',                 icon: 'grey' },
224:   disconnected:   { label: 'Disconnected',         icon: 'grey' }
225: };
226: 
227: function updateUI(state) {
228:   if (!ui) return;
229:   const config = STATE_CONFIGS[state.state] || STATE_CONFIGS.idle;
230: 
231:   ui.pill.classList.remove('active', 'error');
232: 
233:   if (config.icon === 'active') {
234:     ui.pill.classList.add('active');
235:     ui.sparkle.style.fill = '';
236:   } else if (config.icon === 'error') {
237:     ui.pill.classList.add('error');
238:     ui.sparkle.style.fill = '';
239:   } else {
240:     ui.sparkle.style.fill = '#7f7f7f';
241:   }
242: 
243:   ui.statusText.textContent = config.label;
244: }
245: 
246: function setVisibility(isVisible) {
247:   if (!ui) return;
248:   ui.container.style.display = isVisible ? 'block' : 'none';
249: }
250: 
251: // Init
252: ui = injectUI();
253: 
254: try {
255:   if (chrome.runtime && chrome.runtime.id) {
256:     chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
257:       if (chrome.runtime.lastError) return;
258:       if (response) {
259:         if (response.state) updateUI(response.state);
260:         if (response.isVisible !== undefined) setVisibility(response.isVisible);
261:       }
262:     });
263: 
264:     chrome.runtime.onMessage.addListener((msg) => {
265:       if (msg.type === 'STATE_UPDATE' && msg.payload?.state) {
266:         updateUI(msg.payload);
267:       }
268:       if (msg.type === 'VISIBILITY_UPDATE') {
269:         setVisibility(msg.payload);
270:       }
271:     });
272:   }
273: } catch (e) {}
