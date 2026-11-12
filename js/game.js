(() => {
  "use strict";
  const episodes = window.COMMUNITY_EPISODES || [];
  const imagePool = window.COMMUNITY_IMAGES || {};
  const byId = Object.fromEntries(episodes.map(ep => [ep.id, ep]));
  const $ = id => document.getElementById(id);
  const input = $("episode-input"), suggestions = $("suggestions");
  const form = $("guess-form"), button = $("guess-btn"), feedback = $("feedback");
  const scoreEl = $("score"), highEl = $("high-score"), highLabel = $("high-score-label");
  const modeSelect = $("game-mode"), modePicker = $("mode-picker");
  const imageBox = $("episode-frame"), frameViewer = $("frame-viewer");
  const frameNavigation = $("frame-navigation"), previousFrameButton = $("previous-frame");
  const nextFrameButton = $("next-frame"), frameCounter = $("frame-counter");
  const menu = $("challenge-menu"), menuToggle = $("menu-toggle"), menuBackdrop = $("menu-backdrop");
  const menuClose = $("menu-close"), challengeLinks = Array.from(document.querySelectorAll("[data-challenge]"));
  const challengeSubtitle = $("challenge-subtitle"), challengeTools = $("challenge-tools");
  const seasonLabel = $("season-label"), seasonSelect = $("season-select");
  const progressDetail = $("progress-detail"), revealControls = $("reveal-controls");
  const revealNext = $("reveal-next"), revealLabel = $("reveal-label");
  const textAnswer = $("text-answer"), fourChoices = $("four-choices");
  const timelineBoard = $("timeline-board"), timelineCards = $("timeline-cards");
  const timelineSubmit = $("timeline-submit"), restart = $("restart-challenge");
  const modeKey = "community-guesser-mode";
  const legacyHighScoreKey = "community-guesser-high-score";
  const challengeNames = {
    classic: "Classic game", progressive: "Progressive Reveal",
    four: "Four Choices", timeline: "Timeline Challenge",
    survival: "Survival Mode", one110: "One Life, 110",
    season: "Season Challenge", daily: "Daily Challenge"
  };
  const label = ep => ep.id + " " + ep.title;
  const normalize = value => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const episodeNumber = ep => Number(ep.id.slice(4));
  const seasonNumber = ep => Number(ep.id.slice(1, 3));
  const playable = episodes.filter(ep => Array.isArray(imagePool[ep.id]) && imagePool[ep.id].length);
  let mode = "normal";
  try {
    const savedMode = localStorage.getItem(modeKey);
    if (["easy", "normal", "hard", "impossible"].includes(savedMode)) mode = savedMode;
  } catch (_) {}
  modeSelect.value = mode;
  let challenge = "classic", season = 1, score = 0, high = 0;
  let lives = 3, answered = 0, gameOver = false, currentRound = null;
  let pending = [], previousId = "", selected = null, highlighted = -1, visible = [];
  let currentFrame = 0, revealStage = 1, timelineSelection = -1, timelineOrder = [];
  let choices = [], dailyAnswers = [], dailyPlan = [], awaitingNext = false;
  let epoch = 0;

  function modeHighKey() {
    return "community-guesser-high-score-" +
      (challenge === "classic" ? mode : challenge === "season" ? "season-" + season : challenge);
  }
  function loadHigh() {
    try {
      let saved = localStorage.getItem(modeHighKey());
      if (saved === null && challenge === "classic" && mode === "normal") {
        saved = localStorage.getItem(legacyHighScoreKey);
      }
      return Number.isFinite(Number(saved)) && Number(saved) > 0 ? Math.floor(Number(saved)) : 0;
    } catch (_) { return 0; }
  }
  function setHigh() {
    if (score > high) {
      high = score;
      highEl.textContent = String(high);
      try { localStorage.setItem(modeHighKey(), String(high)); } catch (_) {}
    }
  }
  function dailyDate() { return new Date().toISOString().slice(0, 10); }
  function dayKey() { return "community-guesser-daily-" + dailyDate(); }
  function stableHash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function seededRandom(seed) {
    let x = seed || 1;
    return () => {
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      return (x >>> 0) / 4294967296;
    };
  }
  function randomShuffle(arr, random = Math.random) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function dailySchedule() {
    const rng = seededRandom(stableHash("community-guesser:" + dailyDate()));
    const picked = randomShuffle(playable.map(ep => ep.id), rng).slice(0, 5);
    return picked.map(id => {
      const urls = imagePool[id];
      return { id, url: urls[Math.floor(rng() * urls.length)] };
    });
  }
  function readDaily() {
    try {
      const saved = JSON.parse(localStorage.getItem(dayKey()) || "{}");
      return Array.isArray(saved.answers) ? saved.answers.slice(0, 5).map(v => v === true) : [];
    } catch (_) { return []; }
  }
  function saveDaily() {
    try { localStorage.setItem(dayKey(), JSON.stringify({ answers: dailyAnswers })); } catch (_) {}
  }
  function displayLabel(ep) { return challenge === "classic" && (mode === "hard" || mode === "impossible") ? ep.id : label(ep); }

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


  function openMenu(open) {
    menu.classList.toggle("open", open);
    menu.setAttribute("aria-hidden", String(!open));
    menuToggle.setAttribute("aria-expanded", String(open));
    menuBackdrop.hidden = !open;
    if (open) menuClose.focus();
    else menuToggle.focus();
  }
  menuToggle.addEventListener("click", () => openMenu(true));
  menuClose.addEventListener("click", () => openMenu(false));
  menuBackdrop.addEventListener("click", () => openMenu(false));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && menu.classList.contains("open")) openMenu(false);
  });

  function updateShell() {
    menuPickerMark();
    modePicker.hidden = challenge !== "classic";
    challengeSubtitle.hidden = challenge === "classic";
    challengeSubtitle.textContent = challengeNames[challenge] || "";
    seasonLabel.hidden = challenge !== "season";
    challengeTools.hidden = challenge !== "season" && challenge !== "survival" &&
      challenge !== "one110" && challenge !== "daily";
    frameViewer.hidden = challenge === "timeline";
    timelineBoard.hidden = challenge !== "timeline";
    textAnswer.hidden = challenge === "four" || challenge === "timeline";
    fourChoices.hidden = challenge !== "four";
    revealControls.hidden = challenge !== "progressive";
    highLabel.textContent = challenge === "daily" ? "Best Daily Score" : "High Score";
    restart.hidden = true;
    seasonSelect.value = String(season);
  }
  function menuPickerMark() {
    challengeLinks.forEach(b => {
      const active = b.getAttribute("data-challenge") === challenge;
      b.classList.toggle("active", active);
      b.setAttribute("aria-current", active ? "page" : "false");
    });
  }
  function resetGame() {
    ++epoch;
    currentRound = null;
    pending = [];
    previousId = "";
    score = 0; answered = 0; lives = 3; gameOver = false;
    awaitingNext = false; selected = null; highlighted = -1; visible = [];
    currentFrame = 0; revealStage = 1; timelineSelection = -1;
    input.value = ""; input.disabled = false; button.disabled = false;
    button.textContent = "Guess"; feedback.textContent = "";
    closeSuggestions();
    scoreEl.textContent = "0";
    high = loadHigh(); highEl.textContent = String(high);
    updateShell();
    if (challenge === "daily") {
      dailyPlan = dailySchedule();
      dailyAnswers = readDaily();
      answered = dailyAnswers.length;
      score = dailyAnswers.filter(Boolean).length;
      scoreEl.textContent = String(score);
      if (answered >= dailyPlan.length) {
        finishDaily();
        return;
      }
    }
    createRound();
  }
  function activate(name) {
    if (!challengeNames[name]) return;
    challenge = name;
    openMenu(false);
    resetGame();
  }
  challengeLinks.forEach(link => link.addEventListener("click", () => activate(link.getAttribute("data-challenge"))));
  modeSelect.addEventListener("change", () => {
    const value = modeSelect.value;
    if (!["easy", "normal", "hard", "impossible"].includes(value) || value === mode) return;
    mode = value;
    try { localStorage.setItem(modeKey, mode); } catch (_) {}
    challenge = "classic";
    resetGame();
  });
  seasonSelect.addEventListener("change", () => {
    const value = Number(seasonSelect.value);
    if (Number.isInteger(value) && value >= 1 && value <= 6) {
      season = value;
      resetGame();
    }
  });

  function episodePool() {
    return challenge === "season"
      ? playable.filter(ep => seasonNumber(ep) === season)
      : playable;
  }
  function refillQueue() {
    const eligible = episodePool().map(ep => ep.id);
    pending = randomShuffle(eligible);
    if (pending.length > 1 && pending[pending.length - 1] === previousId) {
      [pending[0], pending[pending.length - 1]] = [pending[pending.length - 1], pending[0]];
    }
  }
  function nextId() {
    if (!pending.length) {
      if (challenge === "one110" && answered > 0) return null;
      refillQueue();
    }
    const id = pending.pop();
    previousId = id;
    return id;
  }
  function imageUrlsFor(id) {
    const urls = imagePool[id];
    if (!urls || !urls.length) return [];
    if (challenge === "classic" && mode === "easy" && urls.length >= 3) {
      return [0, 1, 2].map(part => {
        const start = Math.floor(part * urls.length / 3);
        const end = Math.floor((part + 1) * urls.length / 3);
        return urls[start + Math.floor(Math.random() * (end - start))];
      });
    }
    return [urls[Math.floor(Math.random() * urls.length)]];
  }
  function createFrame(url, displayEpoch) {
    const img = new Image();
    img.alt = "Screenshot from a Community episode";
    img.decoding = "async";
    img.style.cssText = "width:100%;height:100%;object-fit:contain;display:block";
    // Impossible Mode uses only runtime CSS. The uploaded original is untouched.
    if (challenge === "classic" && mode === "impossible") {
      const hue = Math.round(Math.random() * 340);
      const zoom = (1.14 + Math.random() * .45).toFixed(2);
      const rotation = (Math.random() * 7 - 3.5).toFixed(1);
      const dx = Math.round((Math.random() - .5) * 10);
      const dy = Math.round((Math.random() - .5) * 10);
      const looks = [
        "contrast(1.7) saturate(2.7)", "hue-rotate(" + hue + "deg) saturate(2.4)",
        "sepia(.95) hue-rotate(" + hue + "deg) contrast(1.5)",
        "grayscale(1) contrast(2.1) brightness(.9)",
        "invert(.85) hue-rotate(" + hue + "deg) contrast(1.4)",
        "saturate(.25) contrast(2) brightness(1.2)"
      ];
      img.style.filter = looks[Math.floor(Math.random() * looks.length)];
      img.style.transform = "translate(" + dx + "%," + dy + "%) scale(" + zoom + ") rotate(" + rotation + "deg)";
    }
    const frame = {img, status:"loading", ready:null,
      pixelResolution: challenge === "classic" && mode === "impossible"
        ? 28 + Math.floor(Math.random() * 108) : null};
    frame.ready = new Promise(resolve => {
      img.onload = () => { frame.status = "ready"; resolve(); };
      img.onerror = () => { frame.status = "error"; resolve(); };
      img.src = url;
    });
    return frame;
  }
  function createRound() {
    if (gameOver) return;
    currentFrame = 0; revealStage = 1; selected = null;
    timelineSelection = -1; awaitingNext = false;
    input.value = ""; input.disabled = false; button.disabled = false; button.textContent = "Guess";
    closeSuggestions();
    feedback.textContent = "";
    if (challenge === "timeline") {
      const picked = [];
      for (let i = 0; i < 3; i++) {
        const id = nextId();
        if (id && !picked.includes(id)) picked.push(id);
      }
      if (picked.length < 3) { finishGame("Not enough episodes to play."); return; }
      currentRound = { id:picked[0], timeline:picked };
      timelineOrder = randomShuffle(picked.slice());
      renderTimeline();
      updateProgress();
      return;
    }
    let id, urls;
    if (challenge === "daily") {
      const step = dailyPlan[answered];
      if (!step) { finishDaily(); return; }
      id = step.id; urls = [step.url];
    } else {
      id = nextId();
      if (!id) { finishGame("All 110 episodes completed! A perfect run."); return; }
      urls = imageUrlsFor(id);
    }
    const displayEpoch = epoch;
    currentRound = { id, frames:urls.map(url => createFrame(url, displayEpoch)) };
    if (challenge === "four") buildChoices();
    updateProgress();
    displayFrame();
  }
  function updateProgress() {
    let message = "";
    if (challenge === "survival") message = "Lives: " + lives + " / 3 · " + score + " correct";
    if (challenge === "one110") message = (answered + 1) + " / " + playable.length + " episodes";
    if (challenge === "daily") message = dailyDate() + " (UTC) · " + (answered + 1) + " / 5";
    if (challenge === "season") message = episodePool().length + " episodes in this season";
    progressDetail.textContent = message;
    if (challenge === "progressive") {
      revealLabel.textContent = "Reveal " + revealStage + " / 5 · " + (6-revealStage) + " points";
      revealNext.disabled = revealStage === 5;
    }
  }
  function displayFrame() {
    if (!currentRound || !currentRound.frames) return;
    const round = currentRound, frame = round.frames[currentFrame];
    const easy = challenge === "classic" && mode === "easy" && round.frames.length === 3;
    frameNavigation.hidden = !easy;
    if (easy) {
      frameCounter.textContent = (currentFrame + 1) + " / 3";
      previousFrameButton.disabled = currentFrame === 0;
      nextFrameButton.disabled = currentFrame === 2;
    }
    if (!frame) { imageBox.textContent = "ERROR: IMAGE NOT AVAILABLE"; return; }
    if (frame.status === "error") { imageBox.textContent = "ERROR: IMAGE NOT AVAILABLE"; return; }
    if (frame.status !== "ready") {
      imageBox.textContent = "LOADING...";
      frame.ready.then(() => {
        if (currentRound === round && round.frames[currentFrame] === frame) displayFrame();
      });
      return;
    }
    if (challenge === "classic" && mode === "impossible") {
      try {
        const canvas = document.createElement("canvas");
        const resolution = frame.pixelResolution;
        const ratio = (frame.img.naturalHeight || 9) / (frame.img.naturalWidth || 16);
        canvas.width = resolution;
        canvas.height = Math.max(1, Math.round(resolution * ratio));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        context.imageSmoothingEnabled = false;
        context.drawImage(frame.img, 0, 0, canvas.width, canvas.height);
        canvas.style.cssText = "width:100%;height:100%;object-fit:contain;image-rendering:pixelated";
        canvas.style.filter = frame.img.style.filter;
        canvas.style.transform = frame.img.style.transform;
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", "Distorted pixelated Community screenshot");
        imageBox.replaceChildren(canvas);
      } catch (_) {
        frame.img.style.imageRendering = "pixelated";
        imageBox.replaceChildren(frame.img);
      }
    } else if (challenge === "progressive" && revealStage < 5) {
      // Canvas changes only the browser rendering, never the source WebP file.
      try {
        const canvas = document.createElement("canvas");
        const resolution = [12, 24, 44, 90][revealStage - 1];
        const ratio = (frame.img.naturalHeight || 9) / (frame.img.naturalWidth || 16);
        canvas.width = resolution;
        canvas.height = Math.max(1, Math.round(resolution * ratio));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        context.imageSmoothingEnabled = false;
        context.drawImage(frame.img, 0, 0, canvas.width, canvas.height);
        canvas.style.cssText = "width:100%;height:100%;object-fit:contain;image-rendering:pixelated";
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", "Pixelated Community screenshot");
        imageBox.replaceChildren(canvas);
      } catch (_) {
        frame.img.style.filter = "blur(" + (27 - 5*revealStage) + "px)";
        imageBox.replaceChildren(frame.img);
      }
    } else {
      frame.img.style.filter = frame.img.style.filter || "";
      if (challenge === "progressive") frame.img.style.filter = "";
      imageBox.replaceChildren(frame.img);
    }
    updateProgress();
  }
  function moveFrame(direction) {
    if (challenge !== "classic" || mode !== "easy" || !currentRound || gameOver) return;
    const next = currentFrame + direction;
    if (next < 0 || next >= currentRound.frames.length) return;
    currentFrame = next; displayFrame();
  }
  previousFrameButton.addEventListener("click", () => moveFrame(-1));
  nextFrameButton.addEventListener("click", () => moveFrame(1));
  revealNext.addEventListener("click", () => {
    if (challenge !== "progressive" || gameOver || revealStage >= 5) return;
    revealStage++;
    displayFrame();
  });
  document.addEventListener("keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey || menu.classList.contains("open")) return;
    if (event.target.closest("input, textarea, select, [contenteditable=true]")) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      if (challenge === "classic" && mode === "easy") {
        event.preventDefault(); moveFrame(event.key === "ArrowRight" ? 1 : -1);
      }
    }
  });
  function buildChoices() {
    const right = currentRound.id;
    const distractors = randomShuffle(playable.filter(ep => ep.id !== right).map(ep => ep.id)).slice(0, 3);
    choices = randomShuffle([right, ...distractors]);
    fourChoices.replaceChildren();
    choices.forEach(id => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label(byId[id]);
      b.addEventListener("click", () => answer(id));
      fourChoices.appendChild(b);
    });
  }
  function renderTimeline() {
    timelineCards.replaceChildren();
    timelineOrder.forEach((id,i) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "timeline-card";
      b.classList.toggle("selected", timelineSelection === i);
      b.setAttribute("aria-label", "Position " + (i + 1) + ", select to swap");
      const img = document.createElement("img");
      const urls = imagePool[id];
      // The picture remains the same as the user reorders the cards.
      const stored = currentRound["timelineImage-" + id] ||
        (currentRound["timelineImage-" + id] = urls[Math.floor(Math.random() * urls.length)]);
      img.src = stored; img.alt = "Unknown Community episode screenshot";
      const caption = document.createElement("span");
      caption.textContent = (i + 1) + " · " + (timelineSelection === i ? "Selected" : "Tap to swap");
      b.appendChild(img); b.appendChild(caption);
      b.addEventListener("click", () => {
        if (gameOver) return;
        if (timelineSelection === -1) timelineSelection = i;
        else if (timelineSelection === i) timelineSelection = -1;
        else {
          [timelineOrder[timelineSelection], timelineOrder[i]] =
            [timelineOrder[i], timelineOrder[timelineSelection]];
          timelineSelection = -1;
        }
        renderTimeline();
      });
      timelineCards.appendChild(b);
    });
  }
  timelineSubmit.addEventListener("click", () => {
    if (gameOver || challenge !== "timeline") return;
    const expected = currentRound.timeline.slice().sort((a,b) => episodes.findIndex(e=>e.id===a) - episodes.findIndex(e=>e.id===b));
    const correct = expected.every((id,i)=>id===timelineOrder[i]);
    if (correct) answer(true);
    else answer(false, "Correct order: " + expected.map(id=>label(byId[id])).join(" → "));
  });
  function finishGame(message) {
    gameOver = true;
    input.disabled = true;
    fourChoices.querySelectorAll("button").forEach(b=>b.disabled=true);
    timelineSubmit.disabled = true;
    button.textContent = "Play again";
    restart.hidden = false;
    restart.textContent = "Play again";
    if (challenge === "one110" && answered >= playable.length) restart.textContent = "Play again";
    feedback.textContent = message;
    closeSuggestions();
    if (challenge !== "four" && challenge !== "timeline") button.disabled = false;
  }
  function finishDaily() {
    gameOver = true;
    frameViewer.hidden = true;
    revealControls.hidden = true;
    textAnswer.hidden = true;
    fourChoices.hidden = true;
    const summary = "Daily Challenge complete: " + score + " / 5 correct. New challenge at 00:00 UTC.";
    feedback.textContent = summary;
    progressDetail.textContent = dailyDate() + " (UTC) · 5 / 5";
    restart.hidden = true;
  }
  function advance() {
    if (gameOver) return;
    awaitingNext = false;
    createRound();
  }
  function answer(value, correction = "") {
    if (gameOver || awaitingNext || !currentRound) return;
    const correct = challenge === "timeline" ? value === true : value === currentRound.id;
    answered++;
    if (challenge === "daily") {
      dailyAnswers.push(correct);
      saveDaily();
      if (correct) { score++; setHigh(); }
      scoreEl.textContent = String(score);
      if (answered >= 5) { finishDaily(); return; }
      const last = currentRound.id;
      createRound();
      feedback.textContent = correct ? "Correct! Next screenshot." : "Answer: " + label(byId[last]) + ". Next screenshot.";
      return;
    }
    if (correct) {
      score += challenge === "progressive" ? (6 - revealStage) : 1;
      scoreEl.textContent = String(score);
      setHigh();
      if (challenge === "one110" && answered >= playable.length) {
        finishGame("Perfect! You recognized all " + playable.length + " episodes.");
        return;
      }
      advance();
      feedback.textContent = "Correct! Score: " + score;
      return;
    }
    if (challenge === "survival") {
      lives--;
      if (lives > 0) {
        const last = currentRound.id;
        advance();
        updateProgress();
        feedback.textContent = "Wrong! " + label(byId[last]) + ". " + lives + " lives left.";
        return;
      }
    }
    const last = score;
    score = 0;
    scoreEl.textContent = "0";
    let explanation = correction || (challenge === "timeline" ? "" : "Correct answer: " + label(byId[currentRound.id]));
    finishGame("Game over! " + explanation + " · Final score: " + last + ".");
  }
  function resolveInput() {
    const matches = search(input.value);
    const candidate = selected || (matches.length === 1 ? matches[0] : null);
    if (!candidate) { feedback.textContent = "Select an episode from the list."; return; }
    answer(candidate.id);
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (gameOver && challenge !== "daily") { resetGame(); return; }
    if (challenge === "four" || challenge === "timeline" || gameOver) return;
    resolveInput();
  });
  restart.addEventListener("click", () => { if (challenge !== "daily") resetGame(); });
  input.addEventListener("focus", renderSuggestions);
  input.addEventListener("input", () => {
    selected = null; feedback.textContent = ""; renderSuggestions();
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
      event.preventDefault(); choose(visible[highlighted]);
    }
  });
  document.addEventListener("pointerdown", event => {
    if (!event.target.closest(".search-wrap")) closeSuggestions();
  });
  resetGame();
})();