(() => {
  "use strict";
  const episodes = window.COMMUNITY_EPISODES || [];
  const input = document.getElementById("episode-input");
  const list = document.getElementById("suggestions");
  const form = document.getElementById("guess-form");
  const feedback = document.getElementById("feedback");
  const scoreEl = document.getElementById("score");
  const highEl = document.getElementById("high-score");
  const key = "community-guesser-high-score";
  let score = 0;
  let high = 0;
  try { high = Number(localStorage.getItem(key)) || 0; } catch (_) {}
  highEl.textContent = String(high);
  let selected = null;
  let highlighted = -1;
  let visible = [];
  const label = ep => ep.id + " " + ep.title;
  const normalize = x => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  function episodeCode(value) {
    const match = value.trim().match(/^(?:s\s*)?(\d{1,2})\s*(?:x|e|\s+)\s*(\d{1,2})\s*$/i);
    if (!match) return null;
    return "S" + match[1].padStart(2, "0") + "E" + match[2].padStart(2, "0");
  }
  function numericMatches(value) {
    const byEpisode = value.match(/^\s*x\s*(\d{1,2})\s*$/i);
    if (byEpisode) {
      const episode = Number(byEpisode[1]);
      return episodes.filter(ep => Number(ep.id.slice(4)) === episode);
    }
    const byX = value.match(/^\s*(\d{1,2})\s*x\s*(\d{0,2})\s*$/i);
    const bySpace = value.match(/^\s*(\d{1,2})(\s+)(\d{0,2})\s*$/);
    const match = byX || bySpace;
    if (!match) return null;
    const season = Number(match[1]);
    const episodeText = byX ? match[2] : match[3];
    return episodes.filter(ep => Number(ep.id.slice(1, 3)) === season &&
      (!episodeText || Number(ep.id.slice(4)) === Number(episodeText)));
  }
  function close() { list.hidden = true; input.setAttribute("aria-expanded", "false"); highlighted = -1; }
  function render() {
    const q = normalize(input.value);
    const code = episodeCode(input.value);
    const numeric = numericMatches(input.value);
    visible = numeric !== null
      ? numeric
      : code
        ? episodes.filter(ep => ep.id === code)
        : episodes.filter(ep => !q || normalize(label(ep)).includes(q));
    list.replaceChildren();
    if (!visible.length) { close(); return; }
    visible.forEach((ep, i) => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "suggestion"; button.setAttribute("role","option");
      button.textContent = label(ep);
      if (i === highlighted) button.classList.add("active");
      button.addEventListener("mousedown", e => e.preventDefault());
      button.addEventListener("click", () => choose(ep));
      list.appendChild(button);
    });
    list.hidden = false; input.setAttribute("aria-expanded","true");
  }
  function choose(ep) { selected = ep; input.value = label(ep); close(); input.focus(); }
  input.addEventListener("focus",render);
  input.addEventListener("input", () => { selected=null; highlighted=-1; render(); });
  input.addEventListener("keydown",e => {
    if (e.key === "Escape") { close(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.hidden) render();
      highlighted = Math.max(0, Math.min(visible.length - 1, highlighted + (e.key === "ArrowDown" ? 1 : -1)));
      render();
    } else if (e.key === "Enter" && !list.hidden && highlighted >= 0) {
      e.preventDefault(); choose(visible[highlighted]);
    }
  });
  document.addEventListener("pointerdown", e => { if (!e.target.closest(".search-wrap")) close(); });
  form.addEventListener("submit", e => {
    e.preventDefault();
    const match = selected || episodes.find(ep => ep.id === episodeCode(input.value) || normalize(label(ep)) === normalize(input.value));
    if (!match) { feedback.textContent = "Please select an episode from the list."; return; }
    // Until real screenshots are available, guessing must not award points.
    feedback.textContent = "Selected: " + label(match) + ". Test mode — scoring is not active yet.";
    input.value = ""; selected = null; close();
    scoreEl.textContent = String(score);
  });
})();