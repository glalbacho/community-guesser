(() => {
  "use strict";

  const episodes = window.COMMUNITY_EPISODES || [];
  const imagePool = window.COMMUNITY_IMAGES || {};
  const input = document.getElementById("episode-input");
  const suggestions = document.getElementById("suggestions");
  const form = document.getElementById("guess-form");
  const button = document.getElementById("guess-btn");
  const feedback = document.getElementById("feedback");
  const scoreEl = document.getElementById("score");
  const highEl = document.getElementById("high-score");
  const imageBox = document.querySelector(".placeholder");
  const highScoreKey = "community-guesser-high-score";

  const label = ep => ep.id + " " + ep.title;
  const normalize = value => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const episodeNumber = ep => Number(ep.id.slice(4));
  const seasonNumber = ep => Number(ep.id.slice(1, 3));

  let score = 0;
  let high = 0;
  try { high = Number(localStorage.getItem(highScoreKey)) || 0; } catch (_) {}
  highEl.textContent = String(high);
  let selected = null;
  let highlighted = -1;
  let visible = [];
  let gameOver = false;
  let currentEpisode = null;
  let previousId = null;
  let remaining = [];

  function search(value) {
    const query = value.trim();
    // Empty and lone separator characters are intermediate inputs, not failed searches.
    if (!query || /^[sxe]$/i.test(query)) return episodes;

    // E1 / x1 means *episode 1*, not episodes 10–19.
    const byEpisode = query.match(/^[ex]\s*(\d{0,2})$/i);
    if (byEpisode) {
      const n = byEpisode[1];
      if (!n) return episodes;
      if (n === "0") return episodes.filter(ep => episodeNumber(ep) < 10);
      return episodes.filter(ep => episodeNumber(ep) === Number(n) && Number(n) > 0);
    }

    // S1, S01, S1E, S1E3, S01 E 03, S1 x 03.
    const prefixed = query.match(/^s\s*(\d{0,2})(?:\s*[ex]\s*(\d{0,2}))?$/i);
    if (prefixed) {
      const sn = prefixed[1], en = prefixed[2];
      if (!sn || sn === "0") return episodes;
      return filterNumbers(Number(sn), en);
    }

    // 1x3 / 01 x 03; a separator without an episode shows the entire season.
    const withX = query.match(/^(\d{1,2})\s*x\s*(\d{0,2})$/i);
    if (withX) return filterNumbers(Number(withX[1]), withX[2]);

    // 1 3 / 01   03, with arbitrary whitespace.
    const withSpace = query.match(/^(\d{1,2})\s+(\d{1,2})$/);
    if (withSpace) return filterNumbers(Number(withSpace[1]), withSpace[2]);

    // A bare number is a season, making 1 -> 1x -> 1x3 continuous.
    const bareSeason = query.match(/^(\d{1,2})$/);
    if (bareSeason) {
      const n = Number(bareSeason[1]);
      return n === 0 && bareSeason[1] === "0"
        ? episodes
        : episodes.filter(ep => seasonNumber(ep) === n);
    }

    // Existing episode-title search.
    const normalized = normalize(query);
    return episodes.filter(ep => normalize(label(ep)).includes(normalized));
  }

  function filterNumbers(season, episodeText) {
    return episodes.filter(ep => {
      if (seasonNumber(ep) !== season) return false;
      if (episodeText === undefined || episodeText === "") return true;
      // While entering 03, show E01–E09 after typing only the first zero.
      if (episodeText === "0") return episodeNumber(ep) < 10;
      return Number(episodeText) > 0 && episodeNumber(ep) === Number(episodeText);
    });
  }

  function closeSuggestions() {
    suggestions.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    highlighted = -1;
  }

  function renderSuggestions() {
    if (gameOver) return;
    visible = search(input.value);
    highlighted = -1;
    suggestions.replaceChildren();
    if (!visible.length) { closeSuggestions(); return; }
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
      suggestions.appendChild(option);
    });
    suggestions.hidden = false;
    input.setAttribute("aria-expanded", "true");
    suggestions.scrollTop = 0;
  }

  function highlight(index) {
    if (!visible.length) return;
    highlighted = Math.max(0, Math.min(index, visible.length - 1));
    for (let i = 0; i < suggestions.children.length; i++) {
      const item = suggestions.children[i];
      const active = i === highlighted;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    }
    const item = suggestions.children[highlighted];
    input.setAttribute("aria-activedescendant", item.id);
    item.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function choose(ep) {
    selected = ep;
    input.value = label(ep);
    closeSuggestions();
    feedback.textContent = "";
    input.focus();
  }

  input.addEventListener("focus", renderSuggestions);
  input.addEventListener("input", () => {
    selected = null;
    feedback.textContent = "";
    renderSuggestions();
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") { closeSuggestions(); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (suggestions.hidden) renderSuggestions();
      if (!visible.length) return;
      if (highlighted === -1 && event.key === "ArrowUp") highlight(visible.length - 1);
      else highlight(highlighted + (event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Enter" && !suggestions.hidden && highlighted >= 0) {
      event.preventDefault();
      choose(visible[highlighted]);
    }
  });
  document.addEventListener("pointerdown", event => {
    if (!event.target.closest(".search-wrap")) closeSuggestions();
  });

  // Randomize episodes without replacement; select a random image within each episode.
  const playable = episodes.filter(ep =>
    Array.isArray(imagePool[ep.id]) &&
    imagePool[ep.id].some(url => typeof url === "string" && url.length > 0));
  function nextEpisode() {
    if (!playable.length) return null;
    if (!remaining.length) {
      remaining = playable.map(ep => ep.id);
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      if (remaining.length > 1 && remaining[remaining.length - 1] === previousId) {
        [remaining[0], remaining[remaining.length - 1]] =
          [remaining[remaining.length - 1], remaining[0]];
      }
    }
    const id = remaining.pop();
    previousId = id;
    return playable.find(ep => ep.id === id);
  }

  function nextRound() {
    currentEpisode = nextEpisode();
    if (!currentEpisode) {
      feedback.textContent = "No episode images are available.";
      return;
    }
    const images = imagePool[currentEpisode.id].filter(url => typeof url === "string" && url);
    const img = document.createElement("img");
    img.src = images[Math.floor(Math.random() * images.length)];
    img.alt = "Guess the Community episode";
    img.style.cssText = "width:100%;height:100%;object-fit:contain;display:block";
    img.onerror = () => {
      currentEpisode = null;
      imageBox.textContent = "IMAGE UNAVAILABLE";
      feedback.textContent = "Could not load the test image.";
    };
    imageBox.replaceChildren(img);
  }

  function playAgain() {
    gameOver = false;
    score = 0;
    scoreEl.textContent = "0";
    input.value = "";
    input.disabled = false;
    selected = null;
    button.textContent = "Guess";
    feedback.textContent = "";
    closeSuggestions();
    nextRound();
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    if (gameOver) { playAgain(); return; }
    const matches = search(input.value);
    const answer = selected || (matches.length === 1 ? matches[0] : null);
    if (!answer) {
      feedback.textContent = "Select an episode from the list.";
      return;
    }
    if (!currentEpisode) {
      feedback.textContent = "No episode image is available.";
      return;
    }

    if (answer.id === currentEpisode.id) {
      score += 1;
      if (score > high) {
        high = score;
        try { localStorage.setItem(highScoreKey, String(high)); } catch (_) {}
      }
      scoreEl.textContent = String(score);
      highEl.textContent = String(high);
      feedback.textContent = "Correct! Streak: " + score;
      input.value = "";
      selected = null;
      closeSuggestions();
      nextRound();
    } else {
      const streak = score;
      score = 0;
      scoreEl.textContent = "0";
      gameOver = true;
      input.disabled = true;
      button.textContent = "Play again";
      closeSuggestions();
      feedback.textContent = "Game over! Correct answer: " + label(currentEpisode) +
        ". Your streak: " + streak + ".";
      button.focus();
    }
  });

  nextRound();
})();