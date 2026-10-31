(() => {
  "use strict";
  const episodes = window.COMMUNITY_EPISODES || [];
  // Add entries as { "S01E01": ["https://.../image.webp", ...] } when screenshots are available.
  const imagePool = window.COMMUNITY_IMAGES || {};
  const input = document.getElementById("episode-input");
  const list = document.getElementById("suggestions");
  const form = document.getElementById("guess-form");
  const feedback = document.getElementById("feedback");
  const scoreEl = document.getElementById("score");
  const highEl = document.getElementById("high-score");
  const placeholder = document.querySelector(".placeholder");
  const key = "community-guesser-high-score";
  let score = 0, high = 0, selected = null, highlighted = -1, visible = [];
  let currentEpisode = null;
  let previousEpisode = null;
  let remaining = [];
  try { high = Number(localStorage.getItem(key)) || 0; } catch (_) {}
  highEl.textContent = String(high);
  const label = ep => ep.id + " " + ep.title;
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const pad = s => String(Number(s)).padStart(2, "0");
  function numericMatches(value) {
    if (/^\s*x\s*$/i.test(value)) return episodes;
    const byEpisode = value.match(/^\s*x\s*(\d{1,2})\s*$/i);
    if (byEpisode) return episodes.filter(ep => Number(ep.id.slice(4)) === Number(byEpisode[1]));
    const bySeason = value.match(/^\s*(?:s\s*)?(\d{1,2})\s*(?:x|e|\s+)(\d{0,2})\s*$/i);
    if (!bySeason) return null;
    const season = Number(bySeason[1]), episodeText = bySeason[2];
    return episodes.filter(ep => Number(ep.id.slice(1, 3)) === season &&
      (!episodeText || Number(ep.id.slice(4)) === Number(episodeText)));
  }
  function exactEpisode(value) {
    const match = value.trim().match(/^(?:s\s*)?(\d{1,2})\s*(?:x|e|\s+)\s*(\d{1,2})$/i);
    return match ? "S" + pad(match[1]) + "E" + pad(match[2]) : null;
  }
  function findMatches(value) {
    const numeric = numericMatches(value);
    if (numeric !== null) return numeric;
    const code = exactEpisode(value);
    if (code) return episodes.filter(ep => ep.id === code);
    const q = normalize(value);
    return episodes.filter(ep => !q || normalize(label(ep)).includes(q));
  }
  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    highlighted = -1;
  }
  function render() {
    visible = findMatches(input.value);
    highlighted = -1;
    list.replaceChildren();
    if (!visible.length) { close(); return; }
    visible.forEach((ep, i) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "suggestion";
      option.id = "episode-option-" + i;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.textContent = label(ep);
      option.addEventListener("mousedown", event => event.preventDefault());
      option.addEventListener("click", () => choose(ep));
      list.appendChild(option);
    });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    list.scrollTop = 0;
  }
  function highlight(index) {
    if (!visible.length) return;
    highlighted = Math.max(0, Math.min(index, visible.length - 1));
    Array.from(list.children).forEach((item, i) => {
      const active = i === highlighted;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    const option = list.children[highlighted];
    input.setAttribute("aria-activedescendant", option.id);
    option.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function choose(ep) {
    selected = ep;
    input.value = label(ep);
    close();
    input.focus();
    feedback.textContent = "";
  }
  input.addEventListener("focus", render);
  input.addEventListener("input", () => { selected = null; render(); });
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") { close(); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (list.hidden) render();
      if (visible.length) highlight(highlighted + (event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Enter" && !list.hidden && highlighted >= 0) {
      event.preventDefault();
      choose(visible[highlighted]);
    }
  });
  document.addEventListener("pointerdown", event => {
    if (!event.target.closest(".search-wrap")) close();
  });

  // Shuffle episodes without replacement, then choose a random image within that episode.
  // The previously used episode is kept out of the next cycle where possible.
  const available = episodes.filter(ep => Array.isArray(imagePool[ep.id]) &&
    imagePool[ep.id].some(url => typeof url === "string" && url.length > 0));
  function nextEpisode() {
    if (!available.length) return null;
    if (!remaining.length) {
      remaining = available.map(ep => ep.id);
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      if (remaining.length > 1 && remaining[remaining.length - 1] === previousEpisode) {
        [remaining[0], remaining[remaining.length - 1]] =
          [remaining[remaining.length - 1], remaining[0]];
      }
    }
    const id = remaining.pop();
    previousEpisode = id;
    return episodes.find(ep => ep.id === id);
  }
  function nextRound() {
    currentEpisode = nextEpisode();
    if (!currentEpisode) return;
    const images = imagePool[currentEpisode.id].filter(url => typeof url === "string" && url);
    const img = document.createElement("img");
    img.src = images[Math.floor(Math.random() * images.length)];
    img.alt = "Guess the Community episode";
    img.style.cssText = "width:100%;height:100%;object-fit:contain";
    placeholder.replaceChildren(img);
    img.onerror = () => {
      placeholder.replaceChildren();
      const text = document.createElement("span");
      text.textContent = "IMAGE UNAVAILABLE";
      placeholder.appendChild(text);
      currentEpisode = null;
      feedback.textContent = "The screenshot could not be loaded.";
    };
  }
  nextRound();
  form.addEventListener("submit", event => {
    event.preventDefault();
    const match = selected || episodes.find(ep =>
      ep.id === exactEpisode(input.value) || normalize(label(ep)) === normalize(input.value));
    if (!match) { feedback.textContent = "Please select an episode from the list."; return; }
    if (!currentEpisode) {
      feedback.textContent = "Test mode — scoring starts when screenshots are added.";
      return;
    }
    if (match.id === currentEpisode.id) {
      score++;
      if (score > high) {
        high = score;
        try { localStorage.setItem(key, String(high)); } catch (_) {}
      }
      feedback.textContent = "Correct! " + label(currentEpisode);
    } else {
      feedback.textContent = "Incorrect. The answer was " + label(currentEpisode) + ".";
      score = 0;
    }
    scoreEl.textContent = String(score);
    highEl.textContent = String(high);
    input.value = "";
    selected = null;
    close();
    nextRound();
  });
})();