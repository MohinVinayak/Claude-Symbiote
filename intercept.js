/**
 * intercept.js — runs in the MAIN world (page context).
 *
 * Intercepts fetch to detect SSE streaming from Claude's API.
 * Dispatches custom events that the content script listens for.
 * Runs in MAIN world so it has access to window.fetch without CSP issues.
 */
(function () {
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input?.url ?? "";
    const resp = await origFetch.apply(this, arguments);

    if (url.includes("/api/") && url.includes("stream")) {
      const clone = resp.clone();
      const reader = clone.body.getReader();
      const decoder = new TextDecoder();
      (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          if (text.includes("data:")) {
            window.dispatchEvent(
              new CustomEvent("__symbiote_chunk__", {
                detail: { ts: Date.now() },
              })
            );
          }
        }
      })().catch(() => {});
    }
    return resp;
  };
})();
