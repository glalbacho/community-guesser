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
  const modeSelect = document.getElementById("game-mode");
  const imageBox = document.querySelector(".placeholder");
  const highScoreKey = "community-guesser-high-score";
  const modeKey = "community-guesser-mode";

  const label = ep => ep.id + " " + ep.title;
  let mode = "normal";
  try { if (localStorage.getItem(modeKey) === "hard") mode = "hard"; } catch (_) {}
  modeSelect.value = mode;
  const displayLabel = ep => mode === "hard" ? ep.id : label(ep);
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
  let lastStreak = 0;
  let currentEpisode = null;
  let previousId = null;
  let remaining = [];

  function search(value) {
    const query = value.trim();
    // Empty and lone separator characters are intermediate inputs, not failed searches.
    if (!query || /^[sxe]$/i.test(query)) return episodes;

    // E1 / x1 means *episode 1*, not episodes 10–19.
    const byEpisode = query.match(/^[ex]\s*(\d*)$/i);
    if (byEpisode) {
      const n = byEpisode[1];
      if (!n) return episodes;
      if (/^0+$/.test(n)) return episodes.filter(ep => episodeNumber(ep) < 10);
      return episodes.filter(ep => episodeNumber(ep) === Number(n) && Number(n) > 0);
    }

    // S1, S01, S1E, S1E3, S01 E 03, S1 x 03.
    const prefixed = query.match(/^s\s*(\d+)(?:\s*[ex]\s*(\d*))?$/i);
    if (prefixed) {
      const sn = prefixed[1], en = prefixed[2];
      if (!sn || Number(sn) === 0) return episodes;
      return filterNumbers(Number(sn), en);
    }

    // 1x3 / 01 x 03; a separator without an episode shows the entire season.
    const withX = query.match(/^(\d+)\s*x\s*(\d*)$/i);
    if (withX) return filterNumbers(Number(withX[1]), withX[2]);

    // 1 3 / 01   03, with arbitrary whitespace.
    const withSpace = query.match(/^(\d+)\s+(\d+)$/);
    if (withSpace) return filterNumbers(Number(withSpace[1]), withSpace[2]);

    // A bare number is a season, making 1 -> 1x -> 1x3 continuous.
    const bareSeason = query.match(/^(\d+)$/);
    if (bareSeason) {
      const n = Number(bareSeason[1]);
      return n === 0
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
      if (/^0+$/.test(episodeText)) return episodeNumber(ep) < 10;
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
      option.textContent = displayLabel(ep);
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
    input.value = displayLabel(ep);
    closeSuggestions();
    feedback.textContent = "";
    input.focus();
  }

  function gameOverMessage() {
    return "Game over! Correct answer: " + displayLabel(currentEpisode) +
      ". Your streak: " + lastStreak + ".";
  }

  modeSelect.addEventListener("change", () => {
    mode = modeSelect.value === "hard" ? "hard" : "normal";
    try { localStorage.setItem(modeKey, mode); } catch (_) {}
    if (selected) input.value = displayLabel(selected);
    if (gameOver && currentEpisode) feedback.textContent = gameOverMessage();
    if (!gameOver && !suggestions.hidden) renderSuggestions();
  });

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

  // Keep TWO complete future rounds preloaded. The episode is chosen first,
  // then one uniformly random screenshot from that episode.
  const preparedRounds = [];
  let shownRound = null;

  function prepareRound() {
    const episode = nextEpisode();
    if (!episode) return null;
    const urls = Array.isArray(imagePool[episode.id])
      ? imagePool[episode.id].filter(url => typeof url === "string" && url.length > 0)
      : [];
    const url = urls.length ? urls[Math.floor(Math.random() * urls.length)] : null;
    const round = { episode, image: null, status: "loading", ready: null };
    if (!url) {
      round.status = "error";
      round.ready = Promise.resolve();
      return round;
    }
    const img = new Image();
    img.alt = "Guess the Community episode";
    img.decoding = "async";
    img.style.cssText = "width:100%;height:100%;object-fit:contain;display:block";
    round.image = img;
    round.ready = new Promise(resolve => {
      img.onload = async () => {
        try { if (img.decode) await img.decode(); } catch (_) {}
        round.status = "ready";
        resolve();
      };
      img.onerror = () => {
        round.status = "error";
        resolve();
      };
      img.src = url;
    });
    return round;
  }

  function nextRound() {
    if (!preparedRounds.length) {
      const first = prepareRound();
      if (first) preparedRounds.push(first);
    }
    const round = preparedRounds.shift();
    // Prepare the next two rounds before the player answers.
    while (preparedRounds.length < 2) {
      const future = prepareRound();
      if (!future) break;
      preparedRounds.push(future);
    }
    if (!round) {
      currentEpisode = null;
      imageBox.textContent = "ERROR: NO EPISODES";
      return;
    }
    currentEpisode = round.episode;
    shownRound = round;
    function render() {
      if (shownRound !== round) return;
      if (round.status === "ready") {
        imageBox.replaceChildren(round.image);
      } else if (round.status === "error") {
        imageBox.textContent = "ERROR: IMAGE NOT AVAILABLE";
      } else {
        imageBox.textContent = "LOADING...";
      }
    }
    render();
    round.ready.then(render);
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
      lastStreak = score;
      score = 0;
      scoreEl.textContent = "0";
      gameOver = true;
      input.disabled = true;
      button.textContent = "Play again";
      closeSuggestions();
      feedback.textContent = gameOverMessage();
      button.focus();
    }
  });

  nextRound();
})();