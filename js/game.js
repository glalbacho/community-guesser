(() => {
  "use strict";
  const episodes = window.COMMUNITY_EPISODES || [];
  // Screenshot-to-episode mapping is intentionally never shipped to the browser.
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
  const communityleBoard = $("communityle-board"), communityleDate = $("communityle-date");
  const communityleAttempts = $("communityle-attempts"), communityleGuesses = $("communityle-guesses");
  const communityleResultModal = $("communityle-result-modal");
  const communityleShowResult = $("communityle-show-result");
  const communityleResultClose = $("communityle-result-close");
  const communityleResultBackdrop = $("communityle-result-backdrop");
  const communityleResultTitle = $("communityle-result-title");
  const communityleResultDescription = $("communityle-result-description");
  const communityleResultScore = $("communityle-result-score");
  const communityleResultGrid = $("communityle-result-grid");
  const communityleResultStatus = $("communityle-result-status");
  const communityleShare = $("communityle-result-share");
  const communityleCopy = $("communityle-result-copy");
  let communityleResultPreviousFocus = null;
  const timelineBoard = $("timeline-board"), timelineCards = $("timeline-cards");
  const timelineSubmit = $("timeline-submit"), restart = $("restart-challenge");
  const timelineInstruction = $("timeline-instruction");
  const highscoresView = $("highscores-view"), highscoresGrid = $("highscores-grid");
  const highscoresStatus = $("highscores-status"), highscoresOpen = $("show-all-highscores");
  const highscoresBack = $("highscores-back"), highscoresRefresh = $("highscores-refresh");
  const gameView = document.querySelector("main.game");
  let highscoresOpenState = false, highscoresFetchVersion = 0;
  const customSetup = $("custom-setup"), customLivesInput = $("custom-lives");
  const customLivesDisplay = $("custom-lives-display");
  const customSeasonInputs = Array.from(document.querySelectorAll("[data-custom-season]"));
  const customStart = $("custom-start"), customError = $("custom-error");
  const customSummary = $("custom-summary");
  const customModifiers = {
    four:$("custom-four"), numbers:$("custom-numbers"), three:$("custom-three"),
    reveal:$("custom-reveal"), distort:$("custom-distort"), once:$("custom-once")
  };
  const modifierKeys = ["four","numbers","three","reveal","distort","once"];
  const customFeatureFlags = () => modifierKeys.map(key => customFeatures[key] ? "1" : "0").join("");
  const customHas = key => challenge === "custom" && customStarted && customFeatures[key];
  const revealEnabled = () => challenge === "progressive" || customHas("reveal");
  const fourEnabled = () => challenge === "four" || customHas("four");
  const threeEnabled = () => (challenge === "classic" && mode === "easy") || customHas("three");
  const distortedEnabled = () => (challenge === "classic" && mode === "impossible") || customHas("distort");
  const openOptions = $("open-options"), optionsPanel = $("options-panel");
  const optionsView = $("options-view"), optionsBack = $("options-back");
  let activeView = "game";
  const optionShowOnFocus = $("option-show-on-focus"), optionAutoFocus = $("option-auto-focus");
  const optionTimelineSpeed = $("option-timeline-speed");
  const timelineDurations = {fast:300,normal:700,slow:1300};
  const answerReveal = $("answer-reveal"), answerRevealTitle = $("answer-reveal-title");
  const answerRevealDetail = $("answer-reveal-detail"), answerRevealItems = $("answer-reveal-items");
  const board = $("leaderboard"), boardStatus = $("leaderboard-status"), boardForm = $("leaderboard-form");
  const boardName = $("leaderboard-name"), boardSubmit = $("leaderboard-submit"), boardList = $("leaderboard-list");
  let boardRequest = 0, boardMode = "", boardScore = 0;
  const optionsKey = "community-guesser-options-v1";
  const customKey = "community-guesser-custom-v1";
  const modeKey = "community-guesser-mode";
  const legacyHighScoreKey = "community-guesser-high-score";
  const challengeNames = {
    classic: "Classic game", progressive: "Progressive Reveal",
    four: "Four Choices", timeline: "Timeline Challenge",
    one110: "One Life, 110",
    season: "Season Challenge", daily: "Daily Challenge", custom: "Custom Game",
    communityle: "Community-le"
  };
  const label = ep => ep.id + " " + ep.title;
  const normalize = value => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const episodeNumber = ep => Number(ep.id.slice(4));
  const seasonNumber = ep => Number(ep.id.slice(1, 3));
  const playable = episodes;
  let mode = "normal";
  try {
    const savedMode = localStorage.getItem(modeKey);
    if (["easy", "normal", "hard", "impossible"].includes(savedMode)) mode = savedMode;
  } catch (_) {}
  modeSelect.value = mode;
  let challenge = "classic", season = 1, score = 0, high = 0;
  let customLives = 3, customSeasons = [1,2,3,4,5,6], customStarted = false;
  let customFeatures = {four:false,numbers:false,three:false,reveal:false,distort:false,once:false};
  let showOnFocus = true, autoFocusInput = false, timelineSpeed = "slow";
  let fullEpisodeListOpened = false, inputWasFocusedOnPointerDown = false;
  try {
    const savedOptions = JSON.parse(localStorage.getItem(optionsKey) || "{}");
    if (typeof savedOptions.showOnFocus === "boolean") showOnFocus = savedOptions.showOnFocus;
    if (typeof savedOptions.autoFocusInput === "boolean") autoFocusInput = savedOptions.autoFocusInput;
    if (Object.hasOwn(timelineDurations,savedOptions.timelineSpeed)) timelineSpeed = savedOptions.timelineSpeed;
    const savedCustom = JSON.parse(localStorage.getItem(customKey) || "{}");
    if (Number.isInteger(savedCustom.lives) && savedCustom.lives >= 1 && savedCustom.lives <= 10) customLives = savedCustom.lives;
    if (Array.isArray(savedCustom.seasons)) {
      const valid = [...new Set(savedCustom.seasons.map(Number))].filter(n => Number.isInteger(n) && n >= 1 && n <= 6);
      if (valid.length) customSeasons = valid.sort((a,b) => a-b);
    }
    if (savedCustom.features && typeof savedCustom.features === "object") {
      modifierKeys.forEach(key => { customFeatures[key] = savedCustom.features[key] === true; });
    }
  } catch (_) {}
  optionShowOnFocus.checked = showOnFocus;
  optionAutoFocus.checked = autoFocusInput;
  optionTimelineSpeed.value = timelineSpeed;
  customLivesInput.value = String(customLives);
  customLivesDisplay.textContent = String(customLives);
  customSeasonInputs.forEach(el => { el.checked = customSeasons.includes(Number(el.value)); });
  modifierKeys.forEach(key => { customModifiers[key].checked = customFeatures[key]; });
  function updateCustomSummary() {
    const selectedSeasons = customSeasonInputs.filter(el => el.checked).map(el => Number(el.value));
    const total = playable.filter(ep => selectedSeasons.includes(seasonNumber(ep))).length;
    const selectedFeatures = [customModifiers.four.checked ? "Four Choices" : "typed answers"];
    if (customModifiers.numbers.checked) selectedFeatures.push("numbers only");
    if (customModifiers.three.checked) selectedFeatures.push("3 images");
    if (customModifiers.reveal.checked) selectedFeatures.push("Reveal");
    if (customModifiers.distort.checked) selectedFeatures.push("Impossible");
    if (customModifiers.once.checked) selectedFeatures.push("no repeats");
    customSummary.textContent = total + " episodes · " + customLivesInput.value + " lives · " + selectedFeatures.join(" + ");
  }
  function saveOptions() {
    try { localStorage.setItem(optionsKey, JSON.stringify({showOnFocus, autoFocusInput, timelineSpeed})); } catch (_) {}
  }
  function saveCustom() {
    try { localStorage.setItem(customKey, JSON.stringify({lives:customLives, seasons:customSeasons, features:customFeatures})); } catch (_) {}
  }
  optionShowOnFocus.addEventListener("change", () => {
    showOnFocus = optionShowOnFocus.checked;
    saveOptions();
    if (!showOnFocus && !input.value.trim()) closeSuggestions();
  });
  optionAutoFocus.addEventListener("change", () => {
    autoFocusInput = optionAutoFocus.checked;
    saveOptions();
  });
  optionTimelineSpeed.addEventListener("change", () => {
    if (!Object.hasOwn(timelineDurations,optionTimelineSpeed.value)) return;
    timelineSpeed=optionTimelineSpeed.value;
    saveOptions();
  });
  openOptions.addEventListener("click", () => navigateTo("options"));
  optionsBack.addEventListener("click", () => navigateTo("game"));
  customLivesInput.addEventListener("input", () => {
    customLivesDisplay.textContent = customLivesInput.value;
    updateCustomSummary();
  });
  modifierKeys.forEach(key => customModifiers[key].addEventListener("change", updateCustomSummary));
  customSeasonInputs.forEach(el => el.addEventListener("change", () => {
    customError.hidden = true;
    updateCustomSummary();
  }));
  updateCustomSummary();
  customStart.addEventListener("click", () => {
    const seasons = customSeasonInputs.filter(el => el.checked).map(el => Number(el.value));
    if (!seasons.length) {
      customError.hidden = false;
      return;
    }
    customSeasons = seasons;
    customLives = Math.min(10, Math.max(1, Number(customLivesInput.value) || 3));
    customFeatures = Object.fromEntries(modifierKeys.map(key => [key, customModifiers[key].checked]));
    saveCustom();
    customStarted = true;
    resetGame();
  });
  let lives = 3, answered = 0, gameOver = false, currentRound = null;
  let pending = [], previousId = "", selected = null, highlighted = -1, visible = [];
  let currentFrame = 0, revealStage = 1, timelineSelection = -1, timelineOrder = [];
  let choices = [], dailyAnswers = [], dailyGuesses = [], dailyPlan = [], awaitingNext = false;
  let showUnmodifiedAnswer = false;
  let communityleHistory = [], communityleSolution = null;
  let epoch = 0;
  let timelineDragging = null, timelineRevealed = false, timelineRevealVersion = 0;
  let timelineMotionAnimations = [];
  let sessionId = null, remoteBusy = false, hasBooted = false;
  let communityleHints = {}, communityleCompleted = false;
  const sessionStoreKey = () => "community-guesser-session-v2:" + boardKey();
  function gameSettings() {
    return {challenge,mode,season,lives:customLives,
      seasons:customSeasons.slice(),features:{...customFeatures}};
  }
  async function requestGame(action, details={}) {
    const response=await fetch("/api/game",{
      method:"POST",headers:{"content-type":"application/json"},
      cache:"no-store",body:JSON.stringify({action,session:sessionId,...details})
    });
    const value=await response.json();
    if(!response.ok)throw new Error(value.error||"The game server is unavailable.");
    return value;
  }
  function showServerFailure(error) {
    feedback.textContent = error?.message || "The game server is unavailable.";
    feedback.classList.add("is-wrong");
    input.disabled=true;button.disabled=true;
    timelineSubmit.disabled=true;fourChoices.querySelectorAll("button").forEach(b=>b.disabled=true);
  }

  // Every mode uses a distinct website ranking. Daily puzzles are date-scoped.
  function boardKey() {
    if (challenge === "classic") return "classic:" + mode;
    if (challenge === "season") return "season:" + season;
    if (challenge === "custom") return "custom:" + customLives + ":" + customSeasons.slice().sort((a,b)=>a-b).join("-") + ":" + customFeatureFlags();
    if (challenge === "daily") return "daily:" + dailyDate();
    if (challenge === "communityle") return "communityle:" + dailyDate();
    return "challenge:" + challenge;
  }
  function boardMinimum() {
    return challenge === "classic" ? (mode === "easy" ? 15 : 10) : 1;
  }
  function scoreDescription(points) {
    return challenge === "communityle" ? (7 - points) + " guesses" : points + " points";
  }
  function clearBoard() {
    ++boardRequest;
    board.hidden = true;
    boardForm.hidden = true;
    boardList.hidden = true;
    boardList.replaceChildren();
    boardStatus.textContent = "";
    boardName.value = "";
    boardSubmit.disabled = false;
    boardMode = "";
    boardScore = 0;
  }
  function displayBoard(entries) {
    boardList.replaceChildren();
    entries.forEach((entry,index) => {
      const item = document.createElement("li");
      const identity = document.createElement("span");
      identity.className = "leaderboard-rank";
      const rank = document.createElement("strong");
      rank.textContent = "#" + (index + 1);
      const name = document.createElement("span");
      name.textContent = entry.name;
      identity.appendChild(rank); identity.appendChild(name);
      const points = document.createElement("span");
      points.className = "leaderboard-points";
      points.textContent = scoreDescription(entry.score);
      item.appendChild(identity); item.appendChild(points);
      boardList.appendChild(item);
    });
    boardList.hidden = entries.length === 0;
  }
  async function checkBoard(finalScore) {
    clearBoard();
    const requestVersion = boardRequest;
    boardMode = boardKey();
    boardScore = finalScore;
    board.hidden = false;
    boardStatus.textContent = "Checking the website Top 3…";
    try {
      const response = await fetch("/api/leaderboard?mode=" + encodeURIComponent(boardMode),{cache:"no-store"});
      if (!response.ok) throw new Error("Unavailable");
      const result = await response.json();
      if (requestVersion !== boardRequest) return;
      if (!Array.isArray(result.entries)) throw new Error("Invalid response");
      const entries = result.entries;
      const qualifies = finalScore >= boardMinimum() && (entries.length < 3 || finalScore > entries[2].score);
      if (qualifies) {
        boardStatus.textContent = "You made the website Top 3! Choose a nickname.";
        boardForm.hidden = false;
      } else {
        boardStatus.textContent = finalScore < boardMinimum()
          ? "At least " + boardMinimum() + " points are needed to enter this mode's Top 3."
          : "Your score did not reach the website Top 3.";
        displayBoard(entries);
      }
    } catch (_) {
      if (requestVersion !== boardRequest) return;
      boardStatus.textContent = "Website Top 3 unavailable until the leaderboard database is connected. Your local high score remains saved.";
    }
  }
  boardForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (boardForm.hidden || !boardMode) return;
    const name = boardName.value.trim();
    if (!/^[\p{L}\p{N} _.-]{2,20}$/u.test(name)) {
      boardStatus.textContent = "Use 2–20 letters, numbers, spaces, dots, underscores or hyphens.";
      return;
    }
    const requestVersion = boardRequest;
    boardSubmit.disabled = true;
    boardStatus.textContent = "Saving your result…";
    try {
      const response = await fetch("/api/leaderboard", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({mode:boardMode,name,session:sessionId})
      });
      const result = await response.json();
      if (requestVersion !== boardRequest) return;
      if (!response.ok || !result.accepted || !Array.isArray(result.entries)) {
        boardStatus.textContent = result.error || "This score is no longer in the Top 3.";
        boardSubmit.disabled = false;
        return;
      }
      boardForm.hidden = true;
      boardStatus.textContent = "You're in the website Top 3!";
      displayBoard(result.entries);
    } catch (_) {
      if (requestVersion !== boardRequest) return;
      boardSubmit.disabled = false;
      boardStatus.textContent = "Could not submit your score. Please retry.";
    }
  });

  function modeHighKey() {
    return "community-guesser-high-score-" +
      (challenge === "classic" ? mode : challenge === "season" ? "season-" + season :
       challenge === "custom" ? "custom-" + customLives + "-" + customSeasons.join("-") + "-" + customFeatureFlags() : challenge);
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
  // Both daily challenges switch at 06:00 Europe/Berlin, regardless of
  // the player's device timezone and automatically across CET/CEST.
  const berlinClock = new Intl.DateTimeFormat("en-GB", {
    timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",hourCycle:"h23"
  });
  function dailyDate(now = new Date()) {
    const parts=Object.fromEntries(berlinClock.formatToParts(now)
      .filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
    const y=Number(parts.year),m=Number(parts.month),d=Number(parts.day);
    // Before 06:00 local time, yesterday's puzzle is still current.
    const date=new Date(Date.UTC(y,m-1,d-(Number(parts.hour)<6?1:0)));
    return date.toISOString().slice(0,10);
  }
  let loadedDailyDate = null;
  function refreshDailyAtBoundary() {
    if (challenge!=="daily" && challenge!=="communityle") return false;
    const today=dailyDate();
    if(loadedDailyDate===today)return false;
    resetGame();
    return true;
  }
  function dayKey() { return "community-guesser-daily-" + dailyDate(); }
  function communityleKey() { return "community-guesser-communityle-" + dailyDate(); }
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
  // A seeded daily choice means everyone gets the same screenshot from
  // 06:00 Berlin time until 06:00 Berlin time on the following day.
  function communityleSchedule() {
    const rng = seededRandom(stableHash("community-le-v1:" + dailyDate()));
    const eligible = playable.slice().sort((a,b) => a.id.localeCompare(b.id));
    if (!eligible.length) return null;
    const ep = eligible[Math.floor(rng() * eligible.length)];
    const urls = imagePool[ep.id];
    return { id:ep.id, url:urls[Math.floor(rng() * urls.length)] };
  }
  function readCommunityle(solution) {
    try {
      const saved = JSON.parse(localStorage.getItem(communityleKey()) || "{}");
      if (saved.solution !== solution.id || saved.url !== solution.url || !Array.isArray(saved.guesses)) return [];
      const valid = [...new Set(saved.guesses.slice(0,6))];
      return valid.filter(id => typeof id === "string" && byId[id]);
    } catch (_) { return []; }
  }
  function saveCommunityle() {
    if (!communityleSolution) return;
    try {
      localStorage.setItem(communityleKey(), JSON.stringify({
        solution:communityleSolution.id, url:communityleSolution.url, guesses:communityleHistory
      }));
    } catch (_) {}
  }
  function communityleDone() {
    return communityleCompleted;
  }
  // Wordle's two-pass matching: exact locations first, then only the
  // remaining unmatched numbers may count as a misplaced match.
  // Index 0 = season; index 1 = episode number.
  function communityleHint(id) {
    return communityleHints[id] || ["absent","absent"];
  }
  const communityleEmoji = state => state==="correct"?"🟩":
    state==="present"?"🟨":"⬛";
  function communityleHintDescription(state) {
    return state==="correct"?"correct position":
      state==="present"?"number in the other position":"number not found";
  }
  function renderCommunityle() {
    communityleDate.textContent = dailyDate() + " · resets 06:00 Berlin";
    communityleAttempts.textContent = communityleHistory.length + " / 6 guesses";
    communityleGuesses.replaceChildren();
    for (let i = 0; i < 6; i++) {
      const row = document.createElement("div");
      row.className = "communityle-guess";
      const name = document.createElement("span");
      name.className = "guess-name";
      const hint = document.createElement("span");
      hint.className = "communityle-two-hints";
      hint.setAttribute("aria-label","Season then episode number");
      const id = communityleHistory[i];
      name.textContent = id && byId[id] ? (i + 1) + ". " + label(byId[id])
        : (i + 1) + ". —";
      if(id && byId[id]){
        const states=communityleHint(id);
        states.forEach((state,j)=>{
          const block=document.createElement("span");
          block.className="communityle-hint-block "+state;
          block.textContent=communityleEmoji(state);
          block.setAttribute("aria-label",
            (j===0?"Season":"Episode number")+": "+communityleHintDescription(state));
          block.title=(j===0?"Season":"Episode number")+": "+communityleHintDescription(state);
          hint.appendChild(block);
        });
      }else{
        row.classList.add("empty");
        for(let j=0;j<2;j++){
          const block=document.createElement("span");
          block.className="communityle-hint-block pending";
          block.textContent="—";
          hint.appendChild(block);
        }
      }
      row.appendChild(name);
      row.appendChild(hint);
      communityleGuesses.appendChild(row);
    }
  }
  function communityleShareUrl() {
    // Use the exact hosted base path (Cloudflare Pages or a custom domain).
    // The existing #/communityle route works after a normal page reload.
    const base = window.location?.origin && window.location?.pathname
      ? window.location.origin + window.location.pathname
      : "https://www.glalbacho.de/community-guesser/";
    return base + "#/communityle";
  }
  function communityleResultRows() {
    if (!communityleSolution) return [];
    return communityleHistory.map(id=>communityleHint(id)
      .map(communityleEmoji).join(""));
  }
  function communityleShareText() {
    const won=communityleHistory.includes(communityleSolution.id);
    const count=won?communityleHistory.indexOf(communityleSolution.id)+1:"X";
    return "Community-le " + dailyDate() + " " + count + "/6"
      + "\n\n" + communityleResultRows().join("\n")
      + "\n\nPlay today's Community-le:\n" + communityleShareUrl();
  }
  function closeCommunityleResult() {
    if (communityleResultModal.hidden) return;
    communityleResultModal.hidden=true;
    if(communityleResultPreviousFocus && typeof communityleResultPreviousFocus.focus==="function" &&
       !communityleResultPreviousFocus.disabled && !communityleResultPreviousFocus.hidden)
      communityleResultPreviousFocus.focus();
    communityleResultPreviousFocus=null;
  }
  function openCommunityleResult() {
    if(challenge!=="communityle" || !communityleSolution || !communityleDone())return;
    const won=communityleHistory.includes(communityleSolution.id);
    communityleResultTitle.textContent=won?"Episode guessed!":"Not quite this time";
    communityleResultDescription.textContent=won
      ?"You solved today's episode. Share your spoiler-free result!"
      :"All six guesses used. Share your result and challenge your friends.";
    communityleResultScore.textContent="Community-le · "+dailyDate()+" · "+
      (won?communityleHistory.indexOf(communityleSolution.id)+1:"X")+"/6";
    communityleResultGrid.replaceChildren();
    communityleResultRows().forEach((line,i)=>{
      const row=document.createElement("div");
      row.textContent=line;
      const states=communityleHint(communityleHistory[i]);
      row.setAttribute("aria-label","Guess "+(i+1)+": season "+
        communityleHintDescription(states[0])+", episode number "+
        communityleHintDescription(states[1]));
      communityleResultGrid.appendChild(row);
    });
    communityleResultStatus.textContent="";
    communityleResultPreviousFocus=document.activeElement;
    communityleResultModal.hidden=false;
    communityleResultClose.focus();
  }
  async function copyCommunityleResult() {
    const text=communityleShareText();
    try{
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(text);
      }else{
        // Copy fallback for browsers without the Clipboard API.
        const field=document.createElement("textarea");
        field.value=text;
        field.setAttribute("readonly","");
        field.style.position="fixed";
        field.style.opacity="0";
        document.body.appendChild(field);
        field.select();
        if(!document.execCommand || !document.execCommand("copy"))
          throw new Error("Clipboard copy not supported");
        field.remove();
      }
      communityleResultStatus.textContent="Result copied! Paste it anywhere.";
    }catch(_){
      communityleResultStatus.textContent="Copy unavailable here. Try Share result instead.";
    }
  }
  communityleResultClose.addEventListener("click",closeCommunityleResult);
  communityleResultBackdrop.addEventListener("click",closeCommunityleResult);
  communityleShowResult.addEventListener("click",openCommunityleResult);
  communityleCopy.addEventListener("click",copyCommunityleResult);
  communityleShare.addEventListener("click",async()=>{
    const text=communityleShareText();
    if(typeof navigator.share==="function"){
      try {
        await navigator.share({text});
        communityleResultStatus.textContent="";
        return;
      }catch(error){
        if(error && error.name==="AbortError")return;
      }
    }
    await copyCommunityleResult();
  });
  document.addEventListener("keydown",event=>{
    if(communityleResultModal.hidden)return;
    if(event.key==="Escape"){
      event.preventDefault();closeCommunityleResult();return;
    }
    if(event.key==="Tab"){
      const items=[communityleResultClose,communityleShare,communityleCopy];
      const idx=items.indexOf(document.activeElement);
      if(event.shiftKey && idx<=0){event.preventDefault();items.at(-1).focus();}
      else if(!event.shiftKey && idx===items.length-1){event.preventDefault();items[0].focus();}
    }
  });
  function finishCommunityle() {
    const won = communityleHistory.includes(communityleSolution.id);
    gameOver = true;
    input.disabled = true;
    button.disabled = true;
    closeSuggestions();
    // Once solved (or out of guesses), reveal the full unaltered screenshot.
    displayFrame();
    feedback.textContent = won
      ? "Community-le solved in " + communityleHistory.length + " / 6 guesses!"
      : "No guesses left. The episode was " + label(byId[communityleSolution.id]) + ".";
    renderCommunityle();
    clearAnswerReveal();
    communityleShowResult.hidden=false;
    openCommunityleResult();
    checkBoard(won ? 7 - communityleHistory.length : 0);
  }
  function readDaily() {
    try {
      const saved = JSON.parse(localStorage.getItem(dayKey()) || "{}");
      return Array.isArray(saved.answers) ? saved.answers.slice(0, 5).map(v => v === true) : [];
    } catch (_) { return []; }
  }
  function readDailyGuesses() {
    try {
      const saved = JSON.parse(localStorage.getItem(dayKey()) || "{}");
      if (!Array.isArray(saved.guesses)) return [];
      return saved.guesses.slice(0, 5).map(id => typeof id === "string" && byId[id] ? id : null);
    } catch (_) { return []; }
  }
  function saveDaily() {
    try {
      localStorage.setItem(dayKey(), JSON.stringify({ answers:dailyAnswers, guesses:dailyGuesses }));
    } catch (_) {}
  }
  function displayLabel(ep) {
    return ((challenge === "classic" && (mode === "hard" || mode === "impossible")) ||
      customHas("numbers")) ? ep.id : label(ep);
  }

  function candidateEpisodes() {
    if (challenge === "season") return episodes.filter(ep => seasonNumber(ep) === season);
    if (challenge === "custom") return episodes.filter(ep => customSeasons.includes(seasonNumber(ep)));
    return episodes;
  }

  function search(value) {
    const available = candidateEpisodes();
    const query = value.trim();
    // Empty and lone separator characters are intermediate inputs, not failed searches.
    if (!query || /^[sxe]$/i.test(query)) return available;

    // E1 / x1 means *episode 1*, not episodes 10–19.
    const byEpisode = query.match(/^[ex]\s*(\d*)$/i);
    if (byEpisode) {
      const n = byEpisode[1];
      if (!n) return available;
      if (/^0+$/.test(n)) return available.filter(ep => episodeNumber(ep) < 10);
      return available.filter(ep => episodeNumber(ep) === Number(n) && Number(n) > 0);
    }

    // S1, S01, S1E, S1E3, S01 E 03, S1 x 03.
    const prefixed = query.match(/^s\s*(\d+)(?:\s*[ex]\s*(\d*))?$/i);
    if (prefixed) {
      const sn = prefixed[1], en = prefixed[2];
      if (!sn || Number(sn) === 0) return available;
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
        ? available
        : available.filter(ep => seasonNumber(ep) === n);
    }

    // Existing episode-title search.
    const normalized = normalize(query);
    return available.filter(ep => normalize(label(ep)).includes(normalized));
  }

  function filterNumbers(season, episodeText) {
    return candidateEpisodes().filter(ep => {
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

  // The reveal uses fresh, unmodified source URLs, never the filtered
  // image/canvas from the currently running game.
  function clearAnswerReveal() {
    answerReveal.hidden = true;
    answerReveal.className = "answer-reveal";
    answerRevealTitle.textContent = "";
    answerRevealDetail.textContent = "";
    answerRevealItems.replaceChildren();
  }
  function addAnswerReveal(id, imageUrl, status, subtitle, kind) {
    if (!byId[id]) return;
    const card = document.createElement("article");
    card.className = "answer-reveal-item";
    if (kind) card.classList.add(kind);
    const img = document.createElement("img");
    img.className = "answer-reveal-image";
    img.src = imageUrl || (imagePool[id] && imagePool[id][0]) || "";
    img.alt = "Original screenshot from " + label(byId[id]);
    img.loading = "lazy";
    const meta = document.createElement("div");
    meta.className = "answer-reveal-meta";
    const textWrap = document.createElement("div");
    const title = document.createElement("div");
    title.className = "answer-reveal-label";
    title.textContent = label(byId[id]);
    textWrap.appendChild(title);
    if (subtitle) {
      const secondary = document.createElement("div");
      secondary.className = "answer-reveal-subtitle";
      secondary.textContent = subtitle;
      textWrap.appendChild(secondary);
    }
    const tag = document.createElement("span");
    tag.className = "answer-reveal-status";
    tag.textContent = status || "";
    meta.appendChild(textWrap);
    meta.appendChild(tag);
    card.appendChild(img);
    card.appendChild(meta);
    answerRevealItems.appendChild(card);
  }
  function showAnswerRevealForRound(won) {
    clearAnswerReveal();
    if (!currentRound) return;
    answerReveal.hidden = false;
    if (challenge === "timeline" && currentRound.timeline) {
      answerReveal.classList.add("timeline");
      answerRevealTitle.textContent = "Correct chronological order";
      answerRevealDetail.textContent = "These episodes aired in this order.";
      const ordered = currentRound.timeline.slice().sort((a,b) =>
        episodes.findIndex(ep => ep.id === a) - episodes.findIndex(ep => ep.id === b));
      ordered.forEach((id,i) => addAnswerReveal(id, currentRound["timelineImage-" + id],
        "POSITION " + (i+1), "Episode " + (i+1) + " in the sequence", won ? "correct" : ""));
      return;
    }
    if (!byId[currentRound.id]) { answerReveal.hidden = true; return; }
    answerRevealTitle.textContent = won ? "Correct!" : "The correct episode was…";
    answerRevealDetail.textContent = won
      ? "Here is the original screenshot without any effects."
      : "Here's the answer, revealed with the original, unfiltered picture.";
    const first = currentRound.frames && currentRound.frames[0];
    addAnswerReveal(currentRound.id, first && first.img.src, won ? "CORRECT" : "REVEALED", "", won ? "correct" : "wrong");
  }
  function showDailyAnswerReveal() {
    clearAnswerReveal();
    answerReveal.hidden = false;
    answerReveal.classList.add("daily");
    answerRevealTitle.textContent = "Your five daily answers";
    answerRevealDetail.textContent = "All five original screenshots and their correct episodes, including the last one.";
    dailyPlan.forEach((step,i) => {
      const answeredRight = dailyAnswers[i] === true;
      const guess = dailyGuesses[i];
      const subtitle = answeredRight ? "Your answer was correct"
        : guess && byId[guess] ? "You guessed: " + label(byId[guess])
        : "Your guess was not saved in the previous version";
      addAnswerReveal(step.id, step.url, answeredRight ? "CORRECT" : "MISSED",
        subtitle, answeredRight ? "correct" : "wrong");
    });
  }
  function showCommunityleAnswerReveal(won) {
    clearAnswerReveal();
    if (!communityleSolution) return;
    answerReveal.hidden = false;
    answerRevealTitle.textContent = won ? "Community-le solved!" : "Community-le answer revealed";
    answerRevealDetail.textContent = won ? "You solved today's episode."
      : "You used all six guesses. This was the correct episode.";
    addAnswerReveal(communityleSolution.id, communityleSolution.url,
      won ? "SOLVED" : "REVEALED", "Original screenshot, without distortion",
      won ? "correct" : "wrong");
  }

  // A single read-only Hall of Fame. It never treats local browser scores
  // as global results when the D1 binding is not configured.
  function publicScoreboards() {
    const basic=[
      ["classic:easy","Easy Mode"],["classic:normal","Normal Mode"],
      ["classic:hard","Hard Mode"],["classic:impossible","Impossible Mode"],
      ...[1,2,3,4,5,6].map(s=>["season:"+s,"Season "+s]),
      ["challenge:one110","One Life, 110"],["challenge:four","Four Choices"],
      ["challenge:timeline","Timeline Challenge"],["challenge:progressive","Progressive Reveal"],
      ["daily:"+dailyDate(),"Daily Challenge · Today"],
      ["communityle:"+dailyDate(),"Community-le · Today"]
    ];
    const key="custom:"+customLives+":"+customSeasons.slice().sort((a,b)=>a-b).join("-")+":"+customFeatureFlags();
    return [...basic,[key,"Custom Game · saved settings"]];
  }
  function publicScoreboardName(mode) {
    const known=publicScoreboards().find(row=>row[0]===mode);
    if(known)return known[1];
    if(mode.startsWith("custom:")) {
      const fields=mode.split(":");
      return "Custom Game · "+fields[1]+" lives · Seasons "+fields[2].replaceAll("-",", ");
    }
    if(mode.startsWith("daily:"))return "Daily Challenge · "+mode.slice(6);
    if(mode.startsWith("communityle:"))return "Community-le · "+mode.slice(12);
    return mode;
  }
  function showHighscoreCards(boards) {
    highscoresGrid.replaceChildren();
    boards.forEach(board=>{
      const card=document.createElement("article");
      card.className="highscores-card";
      const title=document.createElement("h3"); title.textContent=board.name;
      const caption=document.createElement("p"); caption.className="highscores-card-sub";
      caption.textContent=board.mode==="classic:easy"?"Minimum 15 points":
        board.mode.startsWith("classic:")?"Minimum 10 points":"Website Top 3";
      card.appendChild(title);card.appendChild(caption);
      if(!board.entries.length){
        const empty=document.createElement("p");empty.className="hs-empty";
        empty.textContent="No records yet";card.appendChild(empty);
      }else{
        const list=document.createElement("ol");
        board.entries.slice(0,3).forEach((entry,i)=>{
          const li=document.createElement("li");
          const name=document.createElement("span"); name.className="hs-name";
          name.textContent="#"+(i+1)+"  "+entry.name;
          const points=document.createElement("span");points.className="hs-points";
          points.textContent=board.mode.startsWith("communityle:")?(7-entry.score)+" guesses":entry.score+" pts";
          li.appendChild(name);li.appendChild(points);list.appendChild(li);
        });
        card.appendChild(list);
      }
      highscoresGrid.appendChild(card);
    });
  }
  async function loadAllHighscores() {
    const requestVersion=++highscoresFetchVersion;
    highscoresStatus.textContent="Loading website rankings…";
    highscoresGrid.replaceChildren();
    try{
      const response=await fetch("/api/leaderboard?catalog=1",{cache:"no-store"});
      if(!response.ok)throw new Error("Not configured");
      const data=await response.json();
      if(requestVersion!==highscoresFetchVersion||!highscoresOpenState)return;
      if(!Array.isArray(data.boards))throw new Error("Bad response");
      const available=new Map(data.boards.map(entry=>[entry.mode,entry.entries]));
      const basic=publicScoreboards();
      const existing=new Set(basic.map(item=>item[0]));
      const more=data.boards.filter(entry=>!existing.has(entry.mode))
        .map(entry=>[entry.mode,publicScoreboardName(entry.mode)]);
      showHighscoreCards([...basic,...more].map(([mode,name])=>({
        mode,name,entries:available.get(mode)||[]
      })));
      highscoresStatus.textContent="Website Top 3 by mode · "+data.boards.length+" rankings with scores.";
    }catch(_){
      if(requestVersion!==highscoresFetchVersion||!highscoresOpenState)return;
      highscoresGrid.replaceChildren();
      highscoresStatus.textContent="Website-wide high scores are not available yet. Connect the Cloudflare D1 database to activate the rankings.";
    }
  }
  // Hash routes survive reloads and work on static Cloudflare/GitHub hosting.
  // Examples: #/daily, #/season/3, #/classic/hard, #/options.
  function gameRoute() {
    // Classic is the homepage; its difficulty is already saved in localStorage.
    if(challenge==="classic")return "";
    if(challenge==="season")return "/season/"+season;
    return "/"+challenge;
  }
  function setRoute(route) {
    if(!window.location)return;
    const currentHash=window.location.hash || "";
    const targetHash=route?"#"+route:"";
    if(currentHash===targetHash)return;
    // The bare page URL is Classic. Other modes use hash routes because
    // static hosting serves the same HTML on reload without rewrite rules.
    if(typeof window.history?.pushState==="function") {
      const base=(window.location.pathname || "/")+(window.location.search || "");
      window.history.pushState(null,"",base+targetHash);
    }else if(route){
      window.location.hash=targetHash;
    }else{
      // Fallback for environments without the History API.
      window.location.hash="";
    }
  }
  function navigateTo(view) {
    activeView=view;
    gameView.hidden=view!=="game";
    highscoresView.hidden=view!=="highscores";
    optionsView.hidden=view!=="options";
    highscoresOpenState=view==="highscores";
    if(view!=="highscores")highscoresFetchVersion++;
    openMenu(false);
    setRoute(view==="game"?gameRoute():"/"+view);
    if(view==="highscores")loadAllHighscores();
  }
  function restoreRoute() {
    const raw=typeof window.location?.hash==="string"?window.location.hash.slice(1):"";
    const parts=raw.replace(/^\//,"").split("/");
    const name=parts[0];
    if(name==="highscores"||name==="options"){
      navigateTo(name);
      return;
    }
    if(name==="classic"&&["easy","normal","hard","impossible"].includes(parts[1])){
      // One-time migration from old #/classic/easy URLs to the homepage.
      mode=parts[1];modeSelect.value=mode;
      try{localStorage.setItem(modeKey,mode);}catch(_){}
      setRoute("");
    }
    if(name==="season"&&/^[1-6]$/.test(parts[1]))season=Number(parts[1]);
    if(challengeNames[name] && name!=="classic")challenge=name;
    else {
      challenge="classic";
      // Retired routes (including #/survival) now lead to Classic.
      if(name==="survival")setRoute("");
    }
    if(challenge==="custom")customStarted=false;
    resetGame();
    activeView="game";
    gameView.hidden=false;highscoresView.hidden=true;optionsView.hidden=true;
  }
  if(typeof window.addEventListener==="function")
    window.addEventListener("popstate",restoreRoute);
  function toggleHighscores(open) { navigateTo(open?"highscores":"game"); }
  highscoresOpen.addEventListener("click",()=>toggleHighscores(true));
  highscoresBack.addEventListener("click",()=>toggleHighscores(false));
  highscoresRefresh.addEventListener("click",()=>{if(highscoresOpenState)loadAllHighscores();});

  function updateShell() {
    menuPickerMark();
    modePicker.hidden = challenge !== "classic";
    customSetup.hidden = challenge !== "custom" || customStarted;
    if (challenge === "custom" && !customStarted) {
      customLivesInput.value = String(customLives);
      customLivesDisplay.textContent = String(customLives);
      customSeasonInputs.forEach(el => { el.checked = customSeasons.includes(Number(el.value)); });
      modifierKeys.forEach(key => { customModifiers[key].checked = customFeatures[key]; });
      updateCustomSummary();
      customError.hidden = true;
    }
    challengeSubtitle.hidden = challenge === "classic";
    challengeSubtitle.textContent = challengeNames[challenge] || "";
    seasonLabel.hidden = challenge !== "season";
    challengeTools.hidden = challenge !== "season" && challenge !== "one110" &&
      challenge !== "daily" && challenge !== "custom";
    frameViewer.hidden = challenge === "timeline" || (challenge === "custom" && !customStarted);
    timelineBoard.hidden = challenge !== "timeline";
    textAnswer.hidden = fourEnabled() || challenge === "timeline" ||
      (challenge === "custom" && !customStarted);
    fourChoices.hidden = !fourEnabled();
    revealControls.hidden = !revealEnabled();
    highLabel.textContent = challenge === "daily" ? "Best Daily Score" : "High Score";
    communityleBoard.hidden = challenge !== "communityle";
    form.querySelector(".score").hidden = challenge === "communityle" || (challenge === "custom" && !customStarted);

    restart.hidden = true;
    textAnswer.classList.remove("replay-only");
    feedback.classList.remove("is-wrong","is-correct");
    seasonSelect.value = String(season);
  }
  function menuPickerMark() {
    challengeLinks.forEach(b => {
      const active = b.getAttribute("data-challenge") === challenge;
      b.classList.toggle("active", active);
      b.setAttribute("aria-current", active ? "page" : "false");
    });
  }
  function applyServerRound(data) {
    sessionId=data.session;
    try { localStorage.setItem(sessionStoreKey(),sessionId); }catch(_){}
    score=data.score;answered=data.answered;lives=data.lives;
    scoreEl.textContent=String(score);setHigh();
    revealStage=data.stage||1;
    communityleHints=Object.fromEntries((data.guesses||[]).map(g=>[g.id,g.hints]));
    communityleHistory=(data.guesses||[]).map(g=>g.id);
    communityleCompleted=challenge==="communityle"&&data.finished;
    dailyAnswers=(data.history||[]).map(h=>h.correct);
    dailyGuesses=(data.history||[]).map(h=>h.guess);
    dailyPlan=(data.history||[]).map(h=>({id:h.id,url:h.url}));
    awaitingNext=false;gameOver=false;showUnmodifiedAnswer=false;
    if(!data.round) {
      currentRound=null;
      if(data.finished)finishGame("Challenge complete! Final score: "+score+".");
      return;
    }
    if(challenge==="timeline"){
      const images=data.round.timeline||[];
      const tokens=images.map(item=>item.token);
      currentRound={id:null,timeline:tokens,
        timelineImages:Object.fromEntries(images.map(item=>[item.token,item.url])),
        timelineSolution:data.timelineSolution||null,
        timelineAnswerLabels:Object.fromEntries((data.timelineSolution||[]).map(item=>[item.token,item.episode]))};
      timelineOrder=randomShuffle(tokens.slice());
      renderTimeline();
    }else{
      currentRound={id:data.revealedEpisode||null,
        frames:data.round.images.map(url=>createFrame(url)),
        choices:data.round.choices||[]};
      if(fourEnabled())buildChoices();
      displayFrame();
    }
    if(challenge==="communityle"){
      communityleSolution={id:data.revealedEpisode||null,url:data.round.images[0]};
      renderCommunityle();
    }
    updateProgress();
    if(data.finished) {
      if(challenge==="daily")finishDaily();
      else if(challenge==="communityle")finishCommunityle();
      else finishGame("Game over! Final score: "+score+".");
    }else if(data.awaitingNext) {
      const last=(data.history||[]).at(-1);
      if(last && !last.correct){
        currentRound.id=data.revealedEpisode;
        pauseAfterWrongAnswer("Wrong! Correct answer: "+label(byId[data.revealedEpisode])+".");
      }else{
        // If the page was reloaded between a correct guess and the next round,
        // finish advancing the already-verified server session.
        Promise.resolve().then(()=>createRound());
      }
    }
  }
  async function loadServerRound(action,extra={}) {
    const version=epoch;
    remoteBusy=true;input.disabled=true;button.disabled=true;
    timelineSubmit.disabled=true;
    fourChoices.querySelectorAll("button").forEach(b=>b.disabled=true);
    feedback.textContent="Loading screenshot…";
    try{
      const response=await requestGame(action,extra);
      if(version!==epoch)return;
      feedback.textContent="";
      input.disabled=false;button.disabled=false;timelineSubmit.disabled=false;
      applyServerRound(response);
    }catch(error){
      if(version===epoch)showServerFailure(error);
    }finally{
      if(version===epoch)remoteBusy=false;
    }
  }
  function resetGame() {
    closeCommunityleResult();
    communityleShowResult.hidden=true;
    timelineRevealed=false;
    timelineSubmit.hidden=false;
    timelineSubmit.disabled=false;
    timelineSubmit.textContent="Check order";
    ++timelineRevealVersion;
    timelineDragging=null;
    timelineMotionAnimations.forEach(animation=>{
      if(animation && animation.cancel)animation.cancel();
    });
    timelineMotionAnimations=[];
    timelineBoard.classList.remove("reordering","solved","incorrect");
    clearBoard();clearAnswerReveal();
    fullEpisodeListOpened=false;
    inputWasFocusedOnPointerDown=false;
    ++epoch;
    currentRound=null;sessionId=null;remoteBusy=false;
    pending=[];previousId="";
    score=0;answered=0;lives=challenge==="custom"?customLives:1;gameOver=false;
    awaitingNext=false;showUnmodifiedAnswer=false;
    selected=null;highlighted=-1;visible=[];
    currentFrame=0;revealStage=1;timelineSelection=-1;
    input.value="";input.disabled=false;button.disabled=false;
    button.textContent="Guess";button.hidden=false;
    textAnswer.classList.remove("replay-only");
    feedback.classList.remove("is-wrong","is-correct");feedback.textContent="";
    closeSuggestions();
    scoreEl.textContent="0";
    high=loadHigh();highEl.textContent=String(high);
    updateShell();
    loadedDailyDate=(challenge==="daily"||challenge==="communityle")?dailyDate():null;
    communityleHints={};communityleHistory=[];communityleCompleted=false;
    communityleSolution=null;dailyPlan=[];dailyAnswers=[];dailyGuesses=[];
    if(challenge==="custom"&&!customStarted){
      progressDetail.textContent="";
      return;
    }
    const useResume=!hasBooted||challenge==="daily"||challenge==="communityle";
    hasBooted=true;
    let resume=null;
    if(useResume)try{resume=localStorage.getItem(sessionStoreKey());}catch(_){}
    loadServerRound("start",{settings:gameSettings(),resume});
  }
  function createRound() {
    if(gameOver||remoteBusy)return;
    currentFrame=0;revealStage=1;selected=null;
    awaitingNext=false;showUnmodifiedAnswer=false;
    input.value="";input.disabled=false;button.disabled=false;
    button.hidden=false;button.textContent="Guess";
    textAnswer.classList.remove("replay-only");
    if(fourEnabled()){fourChoices.hidden=false;textAnswer.hidden=true;}
    else if(challenge!=="timeline"){fourChoices.hidden=true;textAnswer.hidden=false;}
    closeSuggestions();feedback.textContent="";
    loadServerRound("next");
  }

  function activate(name) {
    if (!challengeNames[name]) return;
    challenge = name;
    if (name === "custom") customStarted = false;
    openMenu(false);
    resetGame();
    navigateTo("game");
  }
  challengeLinks.forEach(link => link.addEventListener("click", () => activate(link.getAttribute("data-challenge"))));
  modeSelect.addEventListener("change", () => {
    const value = modeSelect.value;
    if (!["easy", "normal", "hard", "impossible"].includes(value) || value === mode) return;
    mode = value;
    try { localStorage.setItem(modeKey, mode); } catch (_) {}
    challenge = "classic";
    resetGame();
    navigateTo("game");
  });
  seasonSelect.addEventListener("change", () => {
    const value = Number(seasonSelect.value);
    if (Number.isInteger(value) && value >= 1 && value <= 6) {
      season = value;
      resetGame();
      navigateTo("game");
    }
  });

  function episodePool() {
    if (challenge === "season") return playable.filter(ep => seasonNumber(ep) === season);
    if (challenge === "custom") return playable.filter(ep => customSeasons.includes(seasonNumber(ep)));
    return playable;
  }
  function createFrame(url, displayEpoch) {
    const img = new Image();
    img.alt = "Screenshot from a Community episode";
    img.decoding = "async";
    img.style.cssText = "width:100%;height:100%;object-fit:contain;display:block";
    // Impossible Mode uses only runtime CSS. The uploaded original is untouched.
    if (distortedEnabled()) {
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
      pixelResolution: distortedEnabled()
        ? 28 + Math.floor(Math.random() * 108) : null};
    frame.ready = new Promise(resolve => {
      img.onload = () => { frame.status = "ready"; resolve(); };
      img.onerror = () => { frame.status = "error"; resolve(); };
      img.src = url;
    });
    return frame;
  }
  function updateProgress() {
    let message = "";
    if (challenge === "custom") message = "Lives: " + lives + " / " + customLives +
      " · " + customSeasons.map(n => "S" + n).join(", ") +
      (customHas("once") ? " · " + answered + " / " + episodePool().length : "") +
      " · " + score + " points";
    if (challenge === "one110") message = (answered + 1) + " / " + playable.length + " episodes";
    if (challenge === "daily") message = dailyDate() + " (Berlin) · " + (answered + 1) + " / 5";
    if (challenge === "season") message = episodePool().length + " episodes in this season";
    progressDetail.textContent = message;
    if (revealEnabled()) {
      revealLabel.textContent = "Reveal " + revealStage + " / 5 · " + (6-revealStage) + " points";
      revealNext.disabled = revealStage === 5 || awaitingNext || gameOver;
    }
  }
  function displayFrame() {
    if (!currentRound || !currentRound.frames) return;
    const round = currentRound, frame = round.frames[currentFrame];
    const easy = threeEnabled() && round.frames.length === 3;
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
    if (showUnmodifiedAnswer) {
      // Show the real source image in the current viewer, never a recap copy.
      // This bypasses all temporary pixelation, hue changes and transforms.
      frame.img.style.filter = "";
      frame.img.style.transform = "";
      frame.img.style.imageRendering = "auto";
      imageBox.replaceChildren(frame.img);
    } else if (distortedEnabled() && !revealEnabled()) {
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
    } else if (challenge === "communityle" && !communityleDone()) {
      // Blur/pixelation grows clearer with each guess, but original colours
      // stay unchanged so visual clues remain fair in Community-le.
      const stage = communityleHistory.length;
      const resolutions = [9, 15, 26, 46, 90, 180];
      const blurs = [25, 18, 12, 8, 4, 1];
      const stageWidth = resolutions[stage] || resolutions[5];
      try {
        const canvas = document.createElement("canvas");
        const ratio = (frame.img.naturalHeight || 9) / (frame.img.naturalWidth || 16);
        canvas.width = stageWidth;
        canvas.height = Math.max(1, Math.round(stageWidth * ratio));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        context.imageSmoothingEnabled = false;
        context.drawImage(frame.img, 0, 0, canvas.width, canvas.height);
        canvas.style.cssText = "width:100%;height:100%;object-fit:contain;image-rendering:pixelated";
        canvas.style.filter = "blur(" + blurs[stage] + "px)";
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", "Daily Community-le distorted screenshot, attempt " + (stage+1));
        imageBox.replaceChildren(canvas);
      } catch (_) {
        frame.img.style.filter = "blur(" + blurs[stage] + "px)";
        imageBox.replaceChildren(frame.img);
      }
    } else if (revealEnabled() && revealStage < 5) {
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
        if (distortedEnabled()) {
          canvas.style.filter = frame.img.style.filter;
          canvas.style.transform = frame.img.style.transform;
        }
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", "Pixelated Community screenshot");
        imageBox.replaceChildren(canvas);
      } catch (_) {
        frame.img.style.filter = "blur(" + (27 - 5*revealStage) + "px)" + (distortedEnabled() ? " hue-rotate(90deg)" : "");
        imageBox.replaceChildren(frame.img);
      }
    } else {
      frame.img.style.filter = frame.img.style.filter || "";
      if (revealEnabled() && !distortedEnabled()) frame.img.style.filter = "";
      imageBox.replaceChildren(frame.img);
    }
    updateProgress();
  }
  function moveFrame(direction) {
    // Allow reviewing all three screenshots even after a loss or while
    // the correct answer is shown before Next. No new guesses are enabled.
    if (!threeEnabled() || !currentRound) return;
    const next = currentFrame + direction;
    if (next < 0 || next >= currentRound.frames.length) return;
    currentFrame = next; displayFrame();
  }
  // When entering text, pointer-clicking the image arrows should not steal
  // keyboard focus from the answer field.
  [previousFrameButton,nextFrameButton].forEach(arrow=>{
    arrow.addEventListener("pointerdown",event=>{
      if(threeEnabled() && document.activeElement===input)event.preventDefault();
    });
  });
  previousFrameButton.addEventListener("click", () => moveFrame(-1));
  nextFrameButton.addEventListener("click", () => moveFrame(1));
  revealNext.addEventListener("click", async () => {
    if (!revealEnabled() || gameOver || awaitingNext || revealStage >= 5 || remoteBusy) return;
    remoteBusy=true;revealNext.disabled=true;
    try {
      const result=await requestGame("reveal");
      revealStage=result.stage;
      displayFrame();
    } catch(error) { feedback.textContent=error.message; }
    finally { remoteBusy=false;updateProgress(); }
  });
  document.addEventListener("keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey || menu.classList.contains("open")) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (!threeEnabled() || !currentRound) return;
    // Left/right browse screenshots even while the answer input is focused.
    // The input text, selected episode and suggestions are left untouched.
    const target=event.target;
    if(target && target.closest &&
       target.closest("textarea, select, [contenteditable=true]"))return;
    if(target && target.closest && target.closest("input") && target!==input)return;
    event.preventDefault();
    moveFrame(event.key === "ArrowRight" ? 1 : -1);
  });
  function buildChoices() {
    choices = Array.isArray(currentRound?.choices) ? currentRound.choices.slice() : [];
    fourChoices.replaceChildren();
    choices.forEach(id => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = displayLabel(byId[id]);
      b.addEventListener("click", () => answer(id));
      fourChoices.appendChild(b);
    });
  }
  function timelineSortedIds() {
    return (currentRound?.timelineSolution || []).map(entry=>entry.token);
  }
  function timelineCanReorder() {
    return challenge==="timeline" && !gameOver && !timelineRevealed && !remoteBusy;
  }
  function timelineAnimationDuration() {
    // Follow OS reduced-motion preference without changing the saved choice.
    if (typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
    return timelineDurations[timelineSpeed] || timelineDurations.slow;
  }
  function animateTimelineOrder(ordered,animate=true,fromRects=null) {
    // FLIP: capture *visual* positions, including a card under the pointer.
    // This avoids a flash back to the old grid position on pointer release.
    const oldRects=fromRects || new Map();
    if(animate && !fromRects)Array.from(timelineCards.children).forEach(card=>{
      if(card.dataset && card.getBoundingClientRect)
        oldRects.set(card.dataset.episode,card.getBoundingClientRect());
    });
    // Cancel any previous transition only after capturing the displayed
    // positions, so rapid successive drags continue smoothly.
    timelineMotionAnimations.forEach(animation=>{
      if(animation && animation.cancel)animation.cancel();
    });
    timelineMotionAnimations=[];
    timelineOrder=ordered.slice();
    const nodes=new Map(Array.from(timelineCards.children).map(el=>[el.dataset.episode,el]));
    for(const id of timelineOrder) {
      const card=nodes.get(id);
      if(card)timelineCards.appendChild(card);
    }
    // Clear the pointer transform only *after* recording the visual rectangle
    // and reflowing into the destination slot, then animate the difference.
    Array.from(timelineCards.children).forEach(card=>{card.style.transform="";});
    const duration=animate?timelineAnimationDuration():0;
    const animations=[];
    if(duration>0)Array.from(timelineCards.children).forEach(card=>{
      const before=oldRects.get(card.dataset.episode);
      if(!before||!card.getBoundingClientRect||!card.animate)return;
      const after=card.getBoundingClientRect();
      const dx=before.left-after.left,dy=before.top-after.top;
      if(Math.abs(dx)+Math.abs(dy)<2)return;
      const animation=card.animate(
        [{transform:"translate("+dx+"px,"+dy+"px)"},{transform:"translate(0,0)"}],
        {duration,easing:"cubic-bezier(.22,.72,.32,1)"});
      if(animation){
        timelineMotionAnimations.push(animation);
        if(animation.finished)animations.push(animation.finished.catch(()=>{}));
      }
    });
    if(!timelineRevealed)Array.from(timelineCards.children).forEach((card,i)=>{
      const caption=card.querySelector(".timeline-handle");
      if(caption)caption.textContent=(i+1)+" · Drag to reorder";
      card.setAttribute("aria-label","Position "+(i+1)+", drag to reorder");
    });
    return Promise.all(animations);
  }
  function moveTimelineCard(from,to,fromRects=null) {
    if(!timelineCanReorder()||from<0||to<0||
       from>=timelineOrder.length||to>=timelineOrder.length)return;
    const order=timelineOrder.slice();
    if(from!==to){
      const [moved]=order.splice(from,1);
      order.splice(to,0,moved);
    }
    timelineSelection=-1;
    // Animate even when dropped on the same slot: the dragged card should
    // settle from its release position rather than snap backward.
    animateTimelineOrder(order,true,fromRects);
  }
  function cancelTimelineDrag(card,preserveTransform=false) {
    if(!timelineDragging || timelineDragging.card!==card)return;
    if(!preserveTransform)card.style.transform="";
    card.classList.remove("dragging");
    Array.from(timelineCards.children).forEach(el=>el.classList.remove("drag-over"));
    timelineDragging=null;
  }
  function renderTimeline() {
    timelineCards.replaceChildren();
    timelineRevealed=false;
    timelineDragging=null;
    timelineInstruction.textContent="Drag any part of a card into broadcast order, then release it over another position.";
    timelineBoard.classList.remove("solved","incorrect","reordering");
    timelineSubmit.hidden=false;
    timelineSubmit.disabled=false;
    timelineSubmit.textContent="Check order";
    timelineOrder.forEach((id,i)=>{
      const card=document.createElement("button");
      card.type="button";
      card.className="timeline-card";
      card.dataset.episode=id;
      card.draggable=false;
      card.setAttribute("aria-label","Position "+(i+1)+", drag to reorder; use Alt+arrows with keyboard");
      const img=document.createElement("img");
      const stored=currentRound.timelineImages[id];
      img.src=stored;
      img.alt="Unknown Community episode screenshot";
      img.draggable=false;
      img.setAttribute("draggable","false");
      const caption=document.createElement("span");
      caption.className="timeline-handle";
      caption.textContent=(i+1)+" · Drag to reorder";
      card.appendChild(img);card.appendChild(caption);
      // Prevent native image dragging and selection; pointer gestures handle
      // the *whole* button, including the image itself.
      card.addEventListener("dragstart",event=>event.preventDefault());
      img.addEventListener("dragstart",event=>event.preventDefault());
      card.addEventListener("pointerdown",event=>{
        if(!timelineCanReorder()||event.button!==0)return;
        event.preventDefault();
        const rects=Array.from(timelineCards.children).map(node=>node.getBoundingClientRect());
        timelineDragging={
          id,card,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,
          active:false,rects
        };
        if(card.setPointerCapture)card.setPointerCapture(event.pointerId);
      });
      card.addEventListener("pointermove",event=>{
        const drag=timelineDragging;
        if(!drag||drag.card!==card||drag.pointerId!==event.pointerId||
           !timelineCanReorder())return;
        event.preventDefault();
        const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
        if(Math.hypot(dx,dy)>5)drag.active=true;
        if(!drag.active)return;
        card.classList.add("dragging");
        // Unlike the old implementation, the real card follows the pointer.
        card.style.transform="translate3d("+dx+"px,"+dy+"px,0)";
        const index=drag.rects.findIndex(r=>
          event.clientX>=r.left&&event.clientX<=r.right&&
          event.clientY>=r.top&&event.clientY<=r.bottom);
        Array.from(timelineCards.children).forEach((node,i)=>
          node.classList.toggle("drag-over",i===index&&node!==card));
      });
      card.addEventListener("pointerup",event=>{
        const drag=timelineDragging;
        if(!drag||drag.card!==card||drag.pointerId!==event.pointerId)return;
        event.preventDefault();
        const active=drag.active;
        const from=timelineOrder.indexOf(id);
        const position=drag.rects.findIndex(r=>
          event.clientX>=r.left&&event.clientX<=r.right&&
          event.clientY>=r.top&&event.clientY<=r.bottom);
        if(active) {
          // Read all cards before clearing the pointer transform. The dragged
          // card's rectangle now reflects exactly where it was released.
          const releaseRects=new Map(Array.from(timelineCards.children).map(node=>
            [node.dataset.episode,node.getBoundingClientRect()]));
          cancelTimelineDrag(card,true);
          moveTimelineCard(from,position>=0?position:from,releaseRects);
        } else {
          cancelTimelineDrag(card);
        }
      });
      card.addEventListener("pointercancel",()=>cancelTimelineDrag(card));
      // Keyboard accessibility without accidental click-to-select behavior.
      card.addEventListener("keydown",event=>{
        if(!timelineCanReorder()||!event.altKey||
           (event.key!=="ArrowLeft"&&event.key!=="ArrowRight"))return;
        event.preventDefault();
        moveTimelineCard(timelineOrder.indexOf(id),
          timelineOrder.indexOf(id)+(event.key==="ArrowRight"?1:-1));
        card.focus();
      });
      timelineCards.appendChild(card);
    });
  }
  async function revealTimelineInPlace(correct) {
    timelineRevealed=true;
    timelineDragging=null;
    timelineSelection=-1;
    const version=++timelineRevealVersion;
    const actual=timelineSortedIds();
    const needsReorder=!actual.every((id,i)=>id===timelineOrder[i]);
    timelineSubmit.disabled=true;
    timelineBoard.classList.remove("solved","incorrect");
    if(needsReorder) {
      timelineBoard.classList.add("reordering");
      timelineInstruction.textContent="Moving the cards into the correct broadcast order…";
      // First let every card reach its proper position.
      await animateTimelineOrder(actual,true);
    }
    if(version!==timelineRevealVersion||challenge!=="timeline")return;
    timelineBoard.classList.remove("reordering");
    timelineInstruction.textContent=correct
      ?"Perfect! You placed the episodes in the correct order."
      :"This was the correct broadcast order.";
    const popDuration=timelineAnimationDuration()===0?0:
      correct ? 90 : Math.max(130,Math.min(360,Math.round(timelineAnimationDuration()*.27)));
    // Show one answer at a time, deliberately left-to-right, only after
    // the positions have settled. Wrong answers turn red, never green.
    for(let i=0;i<timelineCards.children.length;i++) {
      if(version!==timelineRevealVersion||challenge!=="timeline")return;
      const card=timelineCards.children[i];
      card.disabled=true;
      card.setAttribute("aria-label","Position "+(i+1)+": "+label(byId[currentRound.timelineAnswerLabels[actual[i]]]));
      const caption=card.querySelector(".timeline-handle");
      if(caption) {
        caption.className="timeline-answer";
        caption.textContent=label(byId[currentRound.timelineAnswerLabels[actual[i]]]);
      }
      card.classList.add(correct?"is-solved":"is-incorrect");
      if(caption && popDuration>0 && caption.animate){
        const animation=caption.animate([
          {opacity:0,transform:"translateY(15px) scale(.87)"},
          {opacity:1,transform:"translateY(0) scale(1)"}
        ],{duration:popDuration,easing:"cubic-bezier(.2,1.4,.35,1)",fill:"both"});
        if(animation && animation.finished)await animation.finished.catch(()=>{});
      }
    }
    if(version!==timelineRevealVersion||challenge!=="timeline")return;
    timelineBoard.classList.add(correct?"solved":"incorrect");
    timelineSubmit.hidden=false;
    timelineSubmit.disabled=false;
    timelineSubmit.textContent=correct?"Next timeline →":"Play again";
  }
  timelineSubmit.addEventListener("click",()=>{
    if(challenge!=="timeline")return;
    if(gameOver){
      if(!timelineSubmit.disabled)resetGame();
      return;
    }
    if(timelineRevealed){
      if(timelineSubmit.disabled)return;
      timelineSubmit.textContent="Check order";
      timelineSubmit.disabled=false;
      timelineSubmit.hidden=false;
      createRound();
      return;
    }
    answer(timelineOrder.slice());
  });
  function finishGame(message, finalScore = score) {
    gameOver = true;
    // On a loss, restore the original in the existing viewer for every
    // mode with distortion (including Progressive Reveal and custom mixes).
    if (message.startsWith("Game over") && (revealEnabled() || distortedEnabled())) {
      showUnmodifiedAnswer = true;
      if(revealEnabled())revealStage = 5;
      displayFrame();
    }
    input.disabled = true;
    fourChoices.querySelectorAll("button").forEach(b=>b.disabled=true);
    timelineSubmit.disabled = true;
    // Keep the replay action in the same place as the original large Guess
    // button. Four Choices uses that same space after the choices close;
    // Timeline uses its existing Check order button after the reveal.
    restart.hidden = true;
    if (challenge !== "timeline") {
      if (fourEnabled()) {
        fourChoices.hidden = true;
        textAnswer.hidden = false;
        textAnswer.classList.add("replay-only");
      }
      button.hidden = false;
      button.disabled = false;
      button.textContent = "Play again";
    }
    feedback.classList.toggle("is-wrong", message.startsWith("Game over"));
    feedback.classList.toggle("is-correct", !message.startsWith("Game over"));
    feedback.textContent = message;
    closeSuggestions();
    if (!fourEnabled() && challenge !== "timeline") button.disabled = false;
    if (challenge !== "daily" && challenge !== "communityle") {
      if(challenge==="timeline"){
        // Show the corrected timeline in the same three cards.
        revealTimelineInPlace(!message.startsWith("Game over"));
      }
      // Other modes already display the answer next to the existing image.
      checkBoard(finalScore);
    }
  }
  function finishDaily() {
    gameOver = true;
    frameViewer.hidden = true;
    revealControls.hidden = true;
    textAnswer.hidden = true;
    fourChoices.hidden = true;
    const summary = "Daily Challenge complete: " + score + " / 5 correct. Next challenge at 06:00 Berlin time.";
    feedback.textContent = summary;
    progressDetail.textContent = dailyDate() + " (Berlin) · 5 / 5";
    restart.hidden = true;
    showDailyAnswerReveal();
    checkBoard(score);
  }
  function advance() {
    if (gameOver) return;
    awaitingNext = false;
    showUnmodifiedAnswer = false;
    createRound();
  }
  function pauseAfterWrongAnswer(message) {
    awaitingNext = true;
    showUnmodifiedAnswer = true;
    input.disabled = true;
    closeSuggestions();
    if (revealEnabled()) revealStage = 5;
    displayFrame();
    // Reuse the existing Guess button for Next, including custom Four Choices.
    if (fourEnabled()) {
      fourChoices.hidden = true;
      textAnswer.hidden = false;
    }
    textAnswer.classList.add("replay-only");
    button.hidden = false;
    button.disabled = false;
    button.textContent = "Next →";
    feedback.classList.add("is-wrong");
    feedback.classList.remove("is-correct");
    feedback.textContent = message;
    updateProgress();
  }
  async function answer(value, correction = "") {
    if(refreshDailyAtBoundary())return;
    if(gameOver||awaitingNext||!currentRound||remoteBusy||!sessionId)return;
    if(challenge==="communityle"){
      if(typeof value!=="string"||!byId[value])return;
      if(communityleHistory.includes(value)){
        feedback.textContent="You already guessed that episode.";
        return;
      }
    }
    const version=epoch;
    remoteBusy=true;button.disabled=true;timelineSubmit.disabled=true;
    fourChoices.querySelectorAll("button").forEach(b=>b.disabled=true);
    try{
      const guess=challenge==="timeline"?timelineOrder.slice():value;
      const result=await requestGame("guess",{guess});
      if(version!==epoch)return;
      score=result.score;answered=result.answered;lives=result.lives;
      scoreEl.textContent=String(score);setHigh();
      currentRound.id=result.answer||null;
      if(challenge==="timeline"){
        currentRound.timelineSolution=result.timelineSolution||[];
        currentRound.timelineAnswerLabels=Object.fromEntries(
          (result.timelineSolution||[]).map(item=>[item.token,item.episode]));
      }
      button.disabled=false;timelineSubmit.disabled=false;
      if(challenge==="communityle"){
        communityleHistory=(result.guesses||[]).map(g=>g.id);
        communityleHints=Object.fromEntries((result.guesses||[]).map(g=>[g.id,g.hints]));
        communityleCompleted=result.finished;
        if(result.finished)communityleSolution.id=result.answer;
        renderCommunityle();
        input.value="";selected=null;closeSuggestions();
        if(result.finished){finishCommunityle();return;}
        displayFrame();
        const hints=communityleHint(value);
        const summary=(hints[0]==="correct"?"Season correct. ":
          hints[0]==="present"?"Season number belongs in the episode position. ":
          "Season number absent. ")+
          (hints[1]==="correct"?"Episode number correct. ":
            hints[1]==="present"?"Episode number belongs in the season position. ":
            "Episode number absent. ");
        feedback.textContent=summary+"The picture is clearer now.";
        if(autoFocusInput)input.focus();
        return;
      }
      if(challenge==="daily"){
        dailyPlan=(result.history||[]).map(h=>({id:h.id,url:h.url}));
        dailyAnswers=(result.history||[]).map(h=>h.correct);
        dailyGuesses=(result.history||[]).map(h=>h.guess);
        if(result.finished){finishDaily();return;}
        if(!result.correct)pauseAfterWrongAnswer(
          "Wrong! Correct answer: "+label(byId[result.answer])+".");
        else{
          createRound();
          feedback.textContent="Correct! Next screenshot.";
        }
        return;
      }
      if(result.correct){
        if(challenge==="timeline"){
          revealTimelineInPlace(true);
          timelineSubmit.hidden=false;
          timelineSubmit.textContent="Next timeline →";
          feedback.textContent="Correct! Score: "+score+". Review the order before continuing.";
          return;
        }
        if(result.finished){
          finishGame(challenge==="one110"?"Perfect! You recognized all 110 episodes.":
            "Challenge complete! All selected episodes have been played.");
          return;
        }
        advance();
        feedback.textContent="Correct! Score: "+score;
        if(autoFocusInput&&!gameOver&&!textAnswer.hidden)input.focus();
        return;
      }
      if(challenge==="custom"&&!result.finished&&lives>0){
        pauseAfterWrongAnswer("Wrong! Correct answer: "+label(byId[result.answer])+
          ". "+lives+" "+(lives===1?"life":"lives")+" left.");
        return;
      }
      const explanation=challenge==="timeline"?"The timeline was rearranged into the correct order.":
        "Correct answer: "+label(byId[result.answer]);
      finishGame("Game over! "+explanation+" · Final score: "+score+".",score);
    }catch(error){
      if(version===epoch){
        feedback.textContent=error.message;
        button.disabled=false;timelineSubmit.disabled=false;
        fourChoices.querySelectorAll("button").forEach(b=>b.disabled=false);
      }
    }finally{
      if(version===epoch)remoteBusy=false;
    }
  }

  function resolveInput() {
    const matches = search(input.value);
    const candidate = selected || (matches.length === 1 ? matches[0] : null);
    if (!candidate || (challenge === "season" && seasonNumber(candidate) !== season) ||
      (challenge === "custom" && !customSeasons.includes(seasonNumber(candidate)))) {
      feedback.textContent = "Select an episode from the list.";
      return;
    }
    answer(candidate.id);
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    if(refreshDailyAtBoundary())return;
    if (awaitingNext) { advance(); return; }
    if (gameOver && challenge !== "daily" && challenge !== "communityle") { resetGame(); return; }
    if (fourEnabled() || challenge === "timeline" || gameOver) return;
    resolveInput();
  });
  // Legacy standalone replay control is kept hidden for compatibility.
  restart.addEventListener("click", () => { if (challenge !== "daily") resetGame(); });
  // Enter activates Next after a wrong round or Play again after a loss,
  // even if the disabled answer input caused keyboard focus to move away.
  document.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.repeat || (!gameOver && !awaitingNext) ||
        challenge === "communityle" ||
        event.altKey || event.ctrlKey || event.metaKey ||
        menu.classList.contains("open") || activeView !== "game") return;
    const target = event.target;
    if (target && target.closest && target.closest(
      "input:not(#episode-input), textarea, select, [contenteditable=true], a, button:not(#guess-btn):not(#timeline-submit)"
    )) return;
    if (awaitingNext) {
      event.preventDefault();
      advance();
      return;
    }
    if (challenge === "daily") return;
    if (challenge === "timeline" && (timelineSubmit.disabled || timelineSubmit.hidden)) return;
    event.preventDefault();
    resetGame();
  });
  // First click only focuses the field. A subsequent click while it is
  // already focused explicitly opens the full episode picker.
  input.addEventListener("pointerdown", () => {
    inputWasFocusedOnPointerDown = document.activeElement === input;
  });
  input.addEventListener("focus", () => {
    // Do not open the full catalogue from focus (including auto-focus).
  });
  input.addEventListener("click", () => {
    if (gameOver) return;
    if (inputWasFocusedOnPointerDown && !input.value.trim()) {
      fullEpisodeListOpened = true;
      renderSuggestions();
    }
    inputWasFocusedOnPointerDown = false;
  });
  input.addEventListener("input", () => {
    selected = null; feedback.textContent = "";
    if (input.value.trim()) {
      renderSuggestions();
    } else if (fullEpisodeListOpened && showOnFocus) {
      renderSuggestions();
    } else {
      closeSuggestions();
    }
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
  restoreRoute();
  // Also refresh without a page reload if the tab stays open over 06:00.
  // In background tabs browser timers may be suspended; visibility/focus
  // triggers an immediate check on return.
  if(typeof window.setInterval==="function")
    window.setInterval(refreshDailyAtBoundary,10000);
  if(typeof document.addEventListener==="function")
    document.addEventListener("visibilitychange",()=>{
      if(!document.hidden)refreshDailyAtBoundary();
    });
  if(typeof window.addEventListener==="function")
    window.addEventListener("focus",refreshDailyAtBoundary);
})();