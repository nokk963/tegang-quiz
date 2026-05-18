const STORAGE_KEY = "tegong-quiz-progress-v1";

const els = {
  totalCount: document.querySelector("#totalCount"),
  masteredCount: document.querySelector("#masteredCount"),
  reviewCount: document.querySelector("#reviewCount"),
  searchInput: document.querySelector("#searchInput"),
  chapterSelect: document.querySelector("#chapterSelect"),
  visibleCount: document.querySelector("#visibleCount"),
  questionList: document.querySelector("#questionList"),
  cardChapter: document.querySelector("#cardChapter"),
  cardPage: document.querySelector("#cardPage"),
  questionTitle: document.querySelector("#questionTitle"),
  answerPanel: document.querySelector("#answerPanel"),
  emptyState: document.querySelector("#emptyState"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  toggleAnswerButton: document.querySelector("#toggleAnswerButton"),
  masterButton: document.querySelector("#masterButton"),
  wrongButton: document.querySelector("#wrongButton"),
  favoriteButton: document.querySelector("#favoriteButton"),
  randomButton: document.querySelector("#randomButton"),
  installHintButton: document.querySelector("#installHintButton"),
  installDialog: document.querySelector("#installDialog"),
  tabs: [...document.querySelectorAll(".tab")],
};

const app = {
  questions: [],
  filtered: [],
  progress: {},
  currentIndex: 0,
  mode: "all",
  answerVisible: false,
};

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(app.progress));
}

function stateFor(id) {
  if (!app.progress[id]) {
    app.progress[id] = {
      mastered: false,
      favorite: false,
      wrong: false,
      lastReviewedAt: null,
      reviewCount: 0,
    };
  }
  return app.progress[id];
}

function chapters() {
  return [...new Set(app.questions.map((question) => question.chapter))];
}

function normalize(value) {
  return value.trim().toLowerCase();
}

function applyFilters() {
  const keyword = normalize(els.searchInput.value);
  const chapter = els.chapterSelect.value;

  app.filtered = app.questions.filter((question) => {
    const state = stateFor(question.id);
    const matchesMode =
      app.mode === "all" ||
      (app.mode === "wrong" && (state.wrong || !state.mastered)) ||
      (app.mode === "favorite" && state.favorite);
    const matchesChapter = chapter === "all" || question.chapter === chapter;
    const haystack = `${question.question} ${question.answer}`.toLowerCase();
    const matchesKeyword = !keyword || haystack.includes(keyword);
    return matchesMode && matchesChapter && matchesKeyword;
  });

  if (app.currentIndex >= app.filtered.length) {
    app.currentIndex = Math.max(0, app.filtered.length - 1);
  }
  render();
}

function currentQuestion() {
  return app.filtered[app.currentIndex] || null;
}

function updateStats() {
  const states = Object.values(app.progress);
  const mastered = app.questions.filter((question) => stateFor(question.id).mastered).length;
  const reviews = states.reduce((sum, state) => sum + (state.reviewCount || 0), 0);
  els.totalCount.textContent = app.questions.length;
  els.masteredCount.textContent = mastered;
  els.reviewCount.textContent = reviews;
}

function renderList() {
  els.visibleCount.textContent = `${app.filtered.length} 题`;
  const fragment = document.createDocumentFragment();

  app.filtered.forEach((question, index) => {
    const state = stateFor(question.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `list-item${index === app.currentIndex ? " current" : ""}`;
    button.dataset.index = index;
    const markers = [
      state.mastered ? "已掌握" : "未掌握",
      state.favorite ? "收藏" : "",
      state.wrong ? "错题" : "",
    ].filter(Boolean);
    button.innerHTML = `<strong>${question.number}. ${escapeHtml(question.question)}</strong><small>${escapeHtml(markers.join(" · ") || question.chapter)}</small>`;
    fragment.appendChild(button);
  });

  replaceContent(els.questionList, fragment);
}

function renderCard() {
  const question = currentQuestion();
  const hasQuestion = Boolean(question);

  els.emptyState.hidden = hasQuestion;
  els.answerPanel.hidden = !hasQuestion;
  els.prevButton.disabled = !hasQuestion || app.currentIndex === 0;
  els.nextButton.disabled = !hasQuestion || app.currentIndex >= app.filtered.length - 1;
  els.toggleAnswerButton.disabled = !hasQuestion;
  els.masterButton.disabled = !hasQuestion;
  els.wrongButton.disabled = !hasQuestion;
  els.favoriteButton.disabled = !hasQuestion;

  if (!question) {
    els.cardChapter.textContent = "无结果";
    els.cardPage.textContent = "";
    els.questionTitle.textContent = "";
    els.answerPanel.textContent = "";
    return;
  }

  const state = stateFor(question.id);
  els.cardChapter.textContent = question.chapter;
  els.cardPage.textContent = `第 ${question.sourcePage} 页`;
  els.questionTitle.textContent = `${question.number}. ${question.question}`;
  els.answerPanel.classList.toggle("hidden", !app.answerVisible);
  els.answerPanel.textContent = app.answerVisible ? question.answer : "";
  els.toggleAnswerButton.textContent = app.answerVisible ? "隐藏答案" : "显示答案";
  els.masterButton.textContent = state.mastered ? "取消掌握" : "标记掌握";
  els.wrongButton.textContent = state.wrong ? "移出错题" : "加入错题";
  els.favoriteButton.textContent = state.favorite ? "取消收藏" : "收藏";
  els.masterButton.classList.toggle("is-on", state.mastered);
  els.wrongButton.classList.toggle("is-on", state.wrong);
  els.favoriteButton.classList.toggle("is-on", state.favorite);
}

function render() {
  updateStats();
  renderList();
  renderCard();
}

function showQuestion(index) {
  app.currentIndex = Math.min(Math.max(index, 0), Math.max(app.filtered.length - 1, 0));
  app.answerVisible = false;
  render();
}

function markReviewed(question) {
  const state = stateFor(question.id);
  state.reviewCount = (state.reviewCount || 0) + 1;
  state.lastReviewedAt = new Date().toISOString();
  saveProgress();
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}
function replaceContent(element, content) {
  element.textContent = "";
  if (Array.isArray(content)) {
    content.forEach((item) => element.appendChild(item));
    return;
  }
  element.appendChild(content);
}
function setupChapters() {
  const options = [new Option("全部章节", "all")];
  for (const chapter of chapters()) {
    options.push(new Option(chapter, chapter));
  }
  replaceContent(els.chapterSelect, options);
}

function bindEvents() {
  els.searchInput.addEventListener("input", () => {
    app.currentIndex = 0;
    applyFilters();
  });

  els.chapterSelect.addEventListener("change", () => {
    app.currentIndex = 0;
    applyFilters();
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      app.mode = tab.dataset.mode;
      els.tabs.forEach((item) => item.classList.toggle("active", item === tab));
      app.currentIndex = 0;
      applyFilters();
    });
  });

  els.questionList.addEventListener("click", (event) => {
    const button = event.target.closest(".list-item");
    if (!button) return;
    showQuestion(Number(button.dataset.index));
  });

  els.prevButton.addEventListener("click", () => showQuestion(app.currentIndex - 1));
  els.nextButton.addEventListener("click", () => showQuestion(app.currentIndex + 1));

  els.toggleAnswerButton.addEventListener("click", () => {
    const question = currentQuestion();
    if (!question) return;
    app.answerVisible = !app.answerVisible;
    if (app.answerVisible) {
      markReviewed(question);
    }
    render();
  });

  els.masterButton.addEventListener("click", () => {
    const question = currentQuestion();
    if (!question) return;
    const state = stateFor(question.id);
    state.mastered = !state.mastered;
    if (state.mastered) state.wrong = false;
    saveProgress();
    applyFilters();
  });

  els.wrongButton.addEventListener("click", () => {
    const question = currentQuestion();
    if (!question) return;
    const state = stateFor(question.id);
    state.wrong = !state.wrong;
    if (state.wrong) state.mastered = false;
    saveProgress();
    applyFilters();
  });

  els.favoriteButton.addEventListener("click", () => {
    const question = currentQuestion();
    if (!question) return;
    const state = stateFor(question.id);
    state.favorite = !state.favorite;
    saveProgress();
    render();
  });

  els.randomButton.addEventListener("click", () => {
    if (!app.filtered.length) return;
    showQuestion(Math.floor(Math.random() * app.filtered.length));
  });

  els.installHintButton.addEventListener("click", () => {
    if (typeof els.installDialog.showModal === "function") {
      els.installDialog.showModal();
    } else {
      alert("在 Safari 中点分享按钮，再选“添加到主屏幕”。");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") showQuestion(app.currentIndex - 1);
    if (event.key === "ArrowRight") showQuestion(app.currentIndex + 1);
    if (event.key === " ") {
      event.preventDefault();
      els.toggleAnswerButton.click();
    }
  });
}

async function init() {
  const response = await fetch("./questions.json", { cache: "no-store" });
  if (!response.ok) throw new Error("题库读取失败");
  const data = await response.json();
  app.questions = data.questions;
  app.progress = loadProgress();
  setupChapters();
  bindEvents();
  applyFilters();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js");
  }
}

init().catch((error) => {
  els.questionTitle.textContent = "题库读取失败";
  els.emptyState.hidden = false;
  els.emptyState.textContent = error.message;
});
