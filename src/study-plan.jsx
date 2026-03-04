import { useState, useEffect, useCallback, useRef } from "react";

// ═══════════════════════════════════════════
//  USER TASKS HOOK
// ═══════════════════════════════════════════
export function useUserTasks() {
  const [userTasks, setUserTasks] = useState([]);

  useEffect(() => {
    try {
      const raw = window.storage?.getItem?.("user_tasks_v1");
      if (raw) setUserTasks(JSON.parse(raw));
    } catch {}
  }, []);

  const save = (tasks) => {
    try { window.storage?.setItem?.("user_tasks_v1", JSON.stringify(tasks)); } catch {}
  };

  const addUserTask = useCallback((task) => {
    setUserTasks(prev => {
      const next = [...prev, task];
      save(next);
      return next;
    });
  }, []);

  const removeUserTask = useCallback((id) => {
    setUserTasks(prev => {
      const next = prev.filter(t => t.id !== id);
      save(next);
      return next;
    });
  }, []);

  return { userTasks, addUserTask, removeUserTask };
}

// ═══════════════════════════════════════════
//  USER BOOKS HOOK
// ═══════════════════════════════════════════
export function useUserBooks() {
  const [userBooks, setUserBooks] = useState([]);

  useEffect(() => {
    try {
      const raw = window.storage?.getItem?.("user_books_v1");
      if (raw) setUserBooks(JSON.parse(raw));
    } catch {}
  }, []);

  const save = (books) => {
    try { window.storage?.setItem?.("user_books_v1", JSON.stringify(books)); } catch {}
  };

  const addUserBook = useCallback((book) => {
    setUserBooks(prev => {
      const next = [...prev, book];
      save(next);
      return next;
    });
  }, []);

  const removeUserBook = useCallback((id) => {
    setUserBooks(prev => {
      const next = prev.filter(b => b.id !== id);
      save(next);
      return next;
    });
  }, []);

  return { userBooks, addUserBook, removeUserBook };
}

// ═══════════════════════════════════════════
//  THEME HOOK
// ═══════════════════════════════════════════
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return window.storage?.getItem?.("app_theme_v1") || "dark"; } catch { return "dark"; }
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { window.storage?.setItem?.("app_theme_v1", theme); } catch {}
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(t => t === "dark" ? "light" : "dark");
  }, []);

  return { theme, toggleTheme };
}

// ═══════════════════════════════════════════
//  CALC PAGES PER DAY
// ═══════════════════════════════════════════
export function calcPagesPerDay(book) {
  const remaining = book.totalPages - book.readPages;
  if (remaining <= 0) return 0;
  const days = Math.ceil((new Date(book.deadline) - new Date()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return remaining;
  return Math.ceil(remaining / days);
}

// ═══════════════════════════════════════════
//  CALC DAY SLOTS
// ═══════════════════════════════════════════
export function calcDaySlots(day) {
  if (!day.uni || day.uni.length === 0) {
    return {
      morningH: 2,
      commuteH: 0,
      classReadH: 0,
      homeDayH: 6,
      eveningH: 2,
      totalLightH: 2,
      totalHeavyH: 8,
    };
  }

  const readableBadges = ["читать", "делать дела", "50/50 читать"];
  const classReadH = day.uni
    .filter(cls => readableBadges.some(b => cls.badge.includes(b)))
    .reduce((sum) => sum + 1.5 * 0.7, 0);

  const lastClass = day.uni[day.uni.length - 1];
  const lastEndStr = lastClass?.time?.split("-")[1] ?? "00:00";
  const [endH, endM] = lastEndStr.split(":").map(Number);
  const lastEndMinutes = endH * 60 + (endM || 0);
  const eveningH = lastEndMinutes < 19 * 60 ? 1.5 : 0;

  const morningH = 1.5;
  const commuteH = 2;
  const homeDayH = day.freeH;

  return {
    morningH,
    commuteH,
    classReadH: Math.round(classReadH * 10) / 10,
    homeDayH,
    eveningH,
    totalLightH: Math.round((morningH + commuteH + classReadH) * 10) / 10,
    totalHeavyH: Math.round((homeDayH + eveningH) * 10) / 10,
  };
}

// ═══════════════════════════════════════════
//  AUTO SCHEDULE TASK
// ═══════════════════════════════════════════
export function autoScheduleTask(task, days) {
  const todayStr = new Date().toISOString().split("T")[0];

  // 1. Фильтруем дни от сегодня до дедлайна включительно
  const candidates = days.filter(d => d.date >= todayStr && d.date <= task.deadlineDate);
  if (candidates.length === 0) {
    return { error: "Не хватает времени, предлагаем перенести дедлайн на " + task.deadlineDate };
  }

  // 2–3. Считаем доступные часы за вычетом уже занятых
  const slots = candidates.map(day => {
    const s = calcDaySlots(day);
    const slotH = task.taskType === "light" ? s.totalLightH : s.totalHeavyH;
    const busyH = day.taskIds.reduce((sum, id) => {
      // est берётся из TASK_MAP, но функция не имеет доступа — принимаем 0 для встроенных
      return sum;
    }, 0);
    const available = Math.max(0, Math.round((slotH - busyH) * 10) / 10);
    return { date: day.date, available };
  });

  const activeDays = slots.filter(s => s.available >= 0.5);
  if (activeDays.length === 0) {
    return { error: "Не хватает времени, предлагаем перенести дедлайн на " + task.deadlineDate };
  }

  // 4. Распределяем равномерно с переносом остатка
  const idealH = Math.round((task.totalHours / activeDays.length) * 10) / 10;
  const assignments = [];
  let remaining = task.totalHours;

  for (const slot of activeDays) {
    if (remaining <= 0) break;
    const assign = Math.min(slot.available, Math.max(idealH, remaining - (activeDays.length - assignments.length - 1) * slot.available));
    const rounded = Math.round(assign * 2) / 2; // округляем до 0.5
    if (rounded < 0.5) continue;
    const actual = Math.min(rounded, remaining);
    assignments.push({ date: slot.date, assignedHours: actual });
    remaining = Math.round((remaining - actual) * 10) / 10;
  }

  // 5. Проверяем не хватило ли часов
  if (remaining > 0) {
    // Считаем дату когда хватит: берём следующий день после дедлайна как отправную точку
    const deadlineDate = new Date(task.deadlineDate);
    const extraDays = Math.ceil(remaining / (idealH || 1));
    const suggestedDate = new Date(deadlineDate);
    suggestedDate.setDate(suggestedDate.getDate() + extraDays);
    const suggested = suggestedDate.toISOString().split("T")[0];
    return { error: `Не хватает времени, предлагаем перенести дедлайн на ${suggested}` };
  }

  return assignments;
}

// ═══════════════════════════════════════════
//  GAME — LEVELS & ACHIEVEMENTS
// ═══════════════════════════════════════════
export const LEVELS = [
  { id: "junior",    label: "Junior Dev",     min: 0    },
  { id: "middle",    label: "Middle Dev",      min: 201  },
  { id: "senior",    label: "Senior Dev",      min: 501  },
  { id: "techlead",  label: "Tech Lead",       min: 1001 },
  { id: "staff",     label: "Staff Engineer",  min: 2001 },
  { id: "principal", label: "Principal",       min: 4001 },
];

export const ACHIEVEMENTS = [
  { id: "sql_master",      label: "SQL Master",      emoji: "🗄️",  desc: "Выполнить все SQL задачи" },
  { id: "kafka_producer",  label: "Kafka Producer",  emoji: "📨",  desc: "Выполнить все Kafka задачи" },
  { id: "container_queen", label: "Container Queen", emoji: "🐳",  desc: "Выполнить все Docker задачи" },
  { id: "architect",       label: "Architect",       emoji: "🏗️",  desc: "Выполнить все System Design задачи" },
  { id: "streak_7",        label: "7-Day Streak",    emoji: "🔥",  desc: "7 дней подряд без пропусков" },
  { id: "bookworm",        label: "Bookworm",        emoji: "📚",  desc: "Дочитать любую книгу до конца" },
  { id: "sprint_slayer",   label: "Sprint Slayer",   emoji: "⚡",  desc: "Закрыть весь спринт до дедлайна" },
];

const GAME_KEY = "game_state_v1";
const TODAY = () => new Date().toISOString().split("T")[0];
const YESTERDAY = () => {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
};

const defaultGameState = () => ({
  xp: 0, streak: 0, lastActiveDate: null,
  completedDays: [], unlockedAchievements: [], lastUnlocked: null,
});

const loadGame = () => {
  try {
    const raw = localStorage.getItem(GAME_KEY);
    return raw ? { ...defaultGameState(), ...JSON.parse(raw), lastUnlocked: null } : defaultGameState();
  } catch { return defaultGameState(); }
};

const saveGame = (state) => {
  try { localStorage.setItem(GAME_KEY, JSON.stringify(state)); } catch {}
};

export function useGameState() {
  const [gs, setGs] = useState(loadGame);

  const getCurrentLevel = useCallback((xp = gs.xp) => {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (xp >= LEVELS[i].min) return LEVELS[i];
    }
    return LEVELS[0];
  }, [gs.xp]);

  const level = getCurrentLevel(gs.xp);
  const levelIdx = LEVELS.findIndex(l => l.id === level.id);
  const nextLevel = LEVELS[levelIdx + 1] ?? null;
  const xpToNext = nextLevel ? nextLevel.min - gs.xp : 0;
  const progressPct = nextLevel
    ? Math.min(100, Math.round(((gs.xp - level.min) / (nextLevel.min - level.min)) * 100))
    : 100;

  const addXP = useCallback((amount) => {
    setGs(prev => {
      const next = { ...prev, xp: prev.xp + amount, lastActiveDate: TODAY() };
      saveGame(next);
      return next;
    });
  }, []);

  const checkAndUpdateStreak = useCallback(() => {
    setGs(prev => {
      const yesterday = YESTERDAY();
      let streak = prev.streak;
      let xp = prev.xp;
      if (prev.lastActiveDate === yesterday) {
        xp += 25; // streak continues — bonus
      } else if (prev.lastActiveDate && prev.lastActiveDate < yesterday) {
        streak = 0;
      }
      const next = { ...prev, streak, xp };
      saveGame(next);
      return next;
    });
  }, []);

  const markDayComplete = useCallback((date) => {
    setGs(prev => {
      if (prev.completedDays.includes(date)) return prev;
      const next = { ...prev, xp: prev.xp + 50, completedDays: [...prev.completedDays, date] };
      saveGame(next);
      return next;
    });
  }, []);

  const unlockAchievement = useCallback((id) => {
    setGs(prev => {
      if (prev.unlockedAchievements.some(a => a.id === id)) return prev;
      const entry = { id, unlockedAt: new Date().toISOString() };
      const next = { ...prev, unlockedAchievements: [...prev.unlockedAchievements, entry], lastUnlocked: id };
      saveGame(next);
      return next;
    });
  }, []);

  const checkAchievements = useCallback((completedSet) => {
    // completedSet: Set of completed taskId strings (from TASKS)
    const sqlIds    = ["sql_1","sql_2","sql_3","sql_4","sql_5","sql_6"];
    const kafkaIds  = ["kf_1","kf_2","kf_3","kf_4"];
    const dockerIds = ["dock_1","dock_2","dock_3","dock_4","dock_5","dock_6"];
    const sdIds     = ["sd_1","sd_2","sd_3","sd_4"];

    const allDone = (ids) => ids.every(id => completedSet.has(id));

    if (allDone(sqlIds))    unlockAchievement("sql_master");
    if (allDone(kafkaIds))  unlockAchievement("kafka_producer");
    if (allDone(dockerIds)) unlockAchievement("container_queen");
    if (allDone(sdIds))     unlockAchievement("architect");

    setGs(prev => {
      if (prev.streak < 7 || prev.unlockedAchievements.some(a => a.id === "streak_7")) return prev;
      const entry = { id: "streak_7", unlockedAt: new Date().toISOString() };
      const next = { ...prev, unlockedAchievements: [...prev.unlockedAchievements, entry], lastUnlocked: "streak_7" };
      saveGame(next);
      return next;
    });
  }, [unlockAchievement]);

  return {
    xp: gs.xp,
    streak: gs.streak,
    level,
    nextLevel,
    xpToNext,
    progressPct,
    completedDays: gs.completedDays,
    unlockedAchievements: gs.unlockedAchievements,
    lastUnlocked: gs.lastUnlocked,
    addXP,
    getCurrentLevel,
    checkAndUpdateStreak,
    markDayComplete,
    unlockAchievement,
    checkAchievements,
  };
}

// ═══════════════════════════════════════════
//  CATEGORIES
// ═══════════════════════════════════════════
const CAT = {
  sprint3:   { label: "Sprint 3 (приоритет!)", color: "#FF6B6B", emoji: "⚡" },
  sql:       { label: "SQL",                   color: "#FFD93D", emoji: "🗄️" },
  kafka:     { label: "Kafka & RabbitMQ",      color: "#FF8C42", emoji: "📨" },
  redis:     { label: "Redis",                 color: "#C084FC", emoji: "💾" },
  testing:   { label: "Тестирование Go",       color: "#4ADE80", emoji: "🧪" },
  docker:    { label: "Docker / K8s / CI/CD",  color: "#22D3EE", emoji: "🐳" },
  postgres:  { label: "PostgreSQL",            color: "#818CF8", emoji: "🐘" },
  sysdesign: { label: "System Design",         color: "#F9A8D4", emoji: "🏗️" },
  go_extra:  { label: "Go доп. (расслабон)",   color: "#FCD34D", emoji: "🐹" },
  sprint5:   { label: "Спринт 5",              color: "#94A3B8", emoji: "🚀" },
};

// ═══════════════════════════════════════════
//  ALL TASKS
// ═══════════════════════════════════════════
const TASKS = [
  // Sprint 3 — СНАЧАЛА ЭТО
  { id:"s3_1", cat:"sprint3", title:"Habr Avito — Go в продакшне", url:"https://habr.com/ru/companies/avito/articles/753244/", est:2 },
  { id:"s3_2", cat:"sprint3", title:"Habr VK — Go архитектура", url:"https://habr.com/ru/companies/vk/articles/776766/", est:2 },
  { id:"s3_3", cat:"sprint3", title:"Go: нововведения последней версии", url:"https://go.dev/blog/", est:1.5 },
  { id:"s3_4", cat:"sprint3", title:"Race Detector в Go (официальный блог)", url:"https://go.dev/blog/race-detector", est:1 },
  { id:"s3_5", cat:"sprint3", title:"HH.ru — тесты по Go и SQL", url:"https://hh.ru", est:2 },
  // Go доп от Кости — разбавить в процессе
  { id:"k1", cat:"go_extra", title:"Видео Кости #1 (расслабляющее)", url:"https://www.youtube.com/watch?v=7K0HweCBJwI", est:1.5 },
  { id:"k2", cat:"go_extra", title:"Видео Кости #2", url:"https://www.youtube.com/watch?v=Ss95RF268T0", est:1.5 },
  { id:"k3", cat:"go_extra", title:"Видео Кости #3", url:"https://youtu.be/rCJvW2xgnk0", est:1.5 },
  // SQL
  { id:"sql_1", cat:"sql", title:"2sql.ru — база по SQL", url:"https://2sql.ru", est:3 },
  { id:"sql_2", cat:"sql", title:"SQL Academy — интерактивный тренажёр", url:"https://sql-academy.org", est:2.5 },
  { id:"sql_3", cat:"sql", title:"Транзакции и блокировки простым языком (видео)", url:"https://youtube.com", est:1.5 },
  { id:"sql_4", cat:"sql", title:"EXPLAIN в базах данных за 10 минут (видео)", url:"https://youtube.com", est:1 },
  { id:"sql_5", cat:"sql", title:"ИНДЕКСЫ В БД — СОБЕС В OZON (видео)", url:"https://youtube.com", est:1.5 },
  { id:"sql_6", cat:"sql", title:"Как устроен B-TREE индекс (видео)", url:"https://youtube.com", est:1.5 },
  // Kafka & RabbitMQ
  { id:"kf_1", cat:"kafka", title:"Гайд по Kafka за 1 час (видео)", url:"https://youtube.com", est:2.5 },
  { id:"kf_2", cat:"kafka", title:"Про Kafka — основы (статья)", url:"https://youtube.com", est:2 },
  { id:"kf_3", cat:"kafka", title:"Чем различаются Kafka и RabbitMQ (статья)", url:"https://youtube.com", est:1.5 },
  { id:"kf_4", cat:"kafka", title:"RabbitMQ vs Kafka — два подхода (статья)", url:"https://youtube.com", est:1.5 },
  // Redis
  { id:"redis_1", cat:"redis", title:"Разбираемся с Redis (статья/видео)", url:"https://youtube.com", est:2 },
  // Testing in Go
  { id:"test_1", cat:"testing", title:"Postgres Integration Tests in Golang", url:"https://youtube.com", est:2 },
  { id:"test_2", cat:"testing", title:"Генерация и использование моков / Mockery", url:"https://youtube.com", est:2 },
  { id:"test_3", cat:"testing", title:"Unit Testing in Go — hands-on guide", url:"https://youtube.com", est:2 },
  { id:"test_4", cat:"testing", title:"Comprehensive Guide to Testing in Go (GoLand)", url:"https://youtube.com", est:2 },
  // Docker & K8s & CI/CD
  { id:"dock_1", cat:"docker", title:"Что такое Docker? (статья)", url:"https://youtube.com", est:1 },
  { id:"dock_2", cat:"docker", title:"Docker для начинающих за 1 час (видео)", url:"https://youtube.com", est:2.5 },
  { id:"dock_3", cat:"docker", title:"Что такое Kubernetes? (статья)", url:"https://youtube.com", est:1 },
  { id:"dock_4", cat:"docker", title:"GitLab CI/CD — крутое видео", url:"https://youtube.com", est:2.5 },
  { id:"dock_5", cat:"docker", title:"GitLab CI/CD — главные основы Pipeline (статья)", url:"https://youtube.com", est:2 },
  { id:"dock_6", cat:"docker", title:"Логирование (видео)", url:"https://www.youtube.com/watch?v=KHS8hPh8mtU", est:1.5 },
  // PostgreSQL
  { id:"pg_1", cat:"postgres", title:"Горизонтальный шардинг (Highload.today)", url:"https://highload.today", est:1.5 },
  { id:"pg_2", cat:"postgres", title:"Вертикальный шардинг (Highload.today)", url:"https://highload.today", est:1.5 },
  { id:"pg_3", cat:"postgres", title:"Шардинг и репликация (Highload.today)", url:"https://highload.today", est:1.5 },
  { id:"pg_4", cat:"postgres", title:"PostgreSQL: практические примеры оптимизации (видео)", url:"https://youtube.com", est:2 },
  { id:"pg_5", cat:"postgres", title:"Вся правда об индексах PostgreSQL [доп]", url:"https://youtube.com", est:2 },
  { id:"pg_6", cat:"postgres", title:"MySQL vs PostgreSQL под капотом [доп]", url:"https://youtube.com", est:1.5 },
  // System Design
  { id:"sd_1", cat:"sysdesign", title:"System Design 101 (репо/статья)", url:"https://github.com/ByteByteGoHq/system-design-101", est:3 },
  { id:"sd_2", cat:"sysdesign", title:"System Design — теория шардирования БД (видео)", url:"https://youtube.com", est:1.5 },
  { id:"sd_3", cat:"sysdesign", title:"База по сетям", url:"https://youtube.com", est:2 },
  { id:"sd_4", cat:"sysdesign", title:"Курс System Design от Балуна [большой курс]", url:"https://youtube.com", est:8 },
  // Sprint 5 — placeholder
  { id:"sp5_tbd", cat:"sprint5", title:"Задачи спринта 5 (скоро)", est:0 },
];

const TASK_MAP = Object.fromEntries(TASKS.map(t => [t.id, t]));

// ═══════════════════════════════════════════
//  DAY PLANS  (4–15 марта)
// ═══════════════════════════════════════════
const DAYS = [
  // ── Неделя ЗНАМЕНАТЕЛЬ (2–8 марта 2026) ──
  { date:"2026-03-04", dow:"Ср", short:"4", wn:"ЗН",
    taskIds:["s3_1","s3_2"], freeH:7,
    tip:"Сегодня среда ЗН. Вечерние пары (17:35–20:45) — необязательны, пропустить. Полный день дома: спорт утром 2ч, потом Sprint 3 — Habr Go-статьи. Хороший старт!",
    uni:[
      {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
      {time:"19:15-20:45", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
    ]},
  { date:"2026-03-05", dow:"Чт", short:"5", wn:"ЗН",
    taskIds:["sql_1","sql_3","sql_4"], freeH:8,
    tip:"Свободный четверг — лаба ТКЭ (ЗН) только 19.03. Спорт 2ч утром. Большой SQL-блок: база (2sql.ru) + транзакции + EXPLAIN. Вечером — книга или отдых.",
    uni:[]},
  { date:"2026-03-06", dow:"Пт", short:"6", wn:"ЗН",
    taskIds:["sql_5","sql_6","sql_2"], freeH:5,
    tip:"Утро дома 10–14ч: индексы + B-TREE + SQL Academy тренажёр. Дорога — книга Go Паттерны. Участие специалиста (14:05, Вехов) — обязательно, можно делать дела. Интернет-технологии (15:55) — пропустить, уходишь домой.",
    uni:[
      {time:"14:05-15:35", name:"Участие специалиста (лекция) Вехов", badge:"читать"},
      {time:"15:55-17:25", name:"Интернет технологии (лекция)", badge:"пропустить"},
    ]},
  { date:"2026-03-07", dow:"Сб", short:"7", wn:"ЗН",
    taskIds:["kf_1","kf_2"], freeH:4,
    tip:"Утро дома 10–13ч: Kafka видео. Дорога + обе лабы Судебная КТКЭ (14:05–17:25, Крюкова) — обязательно, только пара. После ~18:30 домой — отдыхать.",
    uni:[
      {time:"14:05-15:35", name:"Судебная КТКЭ (лаб.) Крюкова", badge:"обязательно!"},
      {time:"15:55-17:25", name:"Судебная КТКЭ (лаб.) Крюкова", badge:"обязательно!"},
    ]},
  { date:"2026-03-08", dow:"Вс", short:"8", wn:"ЗН",
    taskIds:["kf_3","kf_4","redis_1"], freeH:6,
    tip:"🌸 8 марта — праздник! Воскресенье, пар нет. Лёгкий день: Kafka статьи + Redis в своё удовольствие. Книга по настроению.",
    uni:[]},
  // ── Неделя ЧИСЛИТЕЛЬ (9–15 марта 2026) ──
  { date:"2026-03-09", dow:"Пн", short:"9", wn:"ЧС",
    taskIds:["test_1","test_2"], freeH:5,
    tip:"МСЗИ лекция (10:10) — пропустить. Схемотехника (11:50, Данилюк) — ОБЯЗАТЕЛЬНО, ничего не делать! Утром до вуза 9–11: интеграционные тесты. Вечером дома: моки.",
    uni:[
      {time:"10:10-11:40", name:"МСЗИ (лекция) Филиппов", badge:"пропустить"},
      {time:"11:50-13:55", name:"Схемотехника (лекция) Данилюк", badge:"обязательно!"},
    ]},
  { date:"2026-03-10", dow:"Вт", short:"10", wn:"ЧС",
    taskIds:["test_3","test_4","s3_3","s3_4"], freeH:3,
    tip:"Большой день в универе! Участие специалиста (11:50, Вехов) — читать. Схемотехника (14:05, Данилюк) — только пара. МСЗИ сем (15:55) — пропустить. Судебная КТКЭ (17:35, ЧС, Яковлев) — обязательно, иногда читать. Утром 9–11: unit tests.",
    uni:[
      {time:"11:50-13:55", name:"Участие специалиста (сем.) Вехов", badge:"читать"},
      {time:"14:05-15:35", name:"Схемотехника (сем.) Данилюк", badge:"обязательно!"},
      {time:"15:55-17:25", name:"МСЗИ (сем.) Филиппов", badge:"пропустить"},
      {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"иногда читать"},
    ]},
  { date:"2026-03-11", dow:"Ср", short:"11", wn:"ЧС",
    taskIds:["dock_1","dock_2","dock_3","dock_4"], freeH:8,
    tip:"Вечерние пары (17:35–20:45) — необязательны, ПРОПУСТИТЬ. Продуктивный день! Большой Docker + K8s + GitLab CI/CD блок.",
    uni:[
      {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
      {time:"19:15-20:45", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
    ]},
  { date:"2026-03-12", dow:"Чт", short:"12", wn:"ЧС",
    taskIds:["dock_5","dock_6","pg_1","pg_2","pg_3"], freeH:9,
    tip:"Свободный четверг — лаба ТКЭ (ЧС) только 23.04! Самый продуктивный день! Docker финал + GitLab pipeline статья + PostgreSQL шардирование (все три части).",
    uni:[]},
  { date:"2026-03-13", dow:"Пт", short:"13", wn:"ЧС",
    taskIds:["pg_4","sd_1","sd_2","sd_3"], freeH:3,
    tip:"Большой вечер в универе. Утром 10–14ч: PostgreSQL + System Design. Судебная КТКЭ (14:05, ЧС, Филимонов) — 50/50 читать. Интернет-технологии (15:55) — пропустить. Инет-технологии сем (17:35, ЧС, Булах) — ОБЯЗАТЕЛЬНО. ТКЭ (19:15, ЧС, Купин) — ОБЯЗАТЕЛЬНО.",
    uni:[
      {time:"14:05-15:35", name:"Судебная КТКЭ (сем.) Филимонов", badge:"50/50 читать"},
      {time:"15:55-17:25", name:"Интернет технологии (лекция)", badge:"пропустить"},
      {time:"17:35-19:05", name:"Интернет технологии (сем.) Булах", badge:"обязательно!"},
      {time:"19:15-20:45", name:"ТКЭ (сем.) Купин", badge:"обязательно!"},
    ]},
  { date:"2026-03-14", dow:"Сб", short:"14", wn:"ЧС",
    taskIds:["sd_4","s3_5","k1"], freeH:5,
    tip:"ТКЭ лекции 10:10–13:55 (Купин — работать на ноуте). После 14:00 дома: System Design курс Балуна + HH.ru тесты по Go и SQL. Видео Кости вечером.",
    uni:[
      {time:"10:10-11:40", name:"ТКЭ (лекция) Купин", badge:"работать на компе"},
      {time:"11:50-13:55", name:"ТКЭ (лекция) Купин", badge:"работать на компе"},
    ]},
  { date:"2026-03-15", dow:"Вс", short:"15 🏁", wn:"ЧС",
    taskIds:["pg_5","pg_6","k2","k3"], freeH:7,
    tip:"🎉 ФИНАЛЬНЫЙ ДЕНЬ! Воскресенье, пар нет. Спорт утром. PostgreSQL индексы + MySQL vs PG под капотом + видео Кости #2 и #3. Финальный обзор всего пройденного. ФИНИШ!",
    uni:[]},

  // ── Неделя ЗНАМЕНАТЕЛЬ (16–22 марта 2026) ──
  { date:"2026-03-16", dow:"Пн", short:"16", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[
      {time:"10:10-11:40", name:"МСЗИ (лекция) Филиппов", badge:"пропустить"},
      {time:"11:50-13:55", name:"Схемотехника (лекция) Данилюк", badge:"обязательно!"},
    ]},
  { date:"2026-03-17", dow:"Вт", short:"17", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[
      {time:"11:50-13:55", name:"Участие специалиста (сем.) Вехов", badge:"читать"},
      {time:"14:05-15:35", name:"Схемотехника (сем.) Данилюк", badge:"обязательно!"},
      {time:"15:55-17:25", name:"МСЗИ (сем.) Филиппов", badge:"пропустить"},
    ]},
  { date:"2026-03-18", dow:"Ср", short:"18", wn:"ЗН", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
      {time:"19:15-20:45", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
    ]},
  { date:"2026-03-19", dow:"Чт", short:"19", wn:"ЗН", taskIds:[], freeH:2, tip:"",
    uni:[
      {time:"11:50-17:35", name:"Лаба ТКЭ Купин", badge:"обязательно!"},
    ]},
  { date:"2026-03-20", dow:"Пт", short:"20", wn:"ЗН", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"14:05-15:35", name:"Участие специалиста (лекция) Вехов", badge:"читать"},
      {time:"15:55-17:25", name:"Интернет технологии (лекция)", badge:"пропустить"},
    ]},
  { date:"2026-03-21", dow:"Сб", short:"21", wn:"ЗН", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"14:05-15:35", name:"Судебная КТКЭ (лаб.) Крюкова", badge:"обязательно!"},
      {time:"15:55-17:25", name:"Судебная КТКЭ (лаб.) Крюкова", badge:"обязательно!"},
    ]},
  { date:"2026-03-22", dow:"Вс", short:"22", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[]},

  // ── Неделя ЧИСЛИТЕЛЬ (23–29 марта 2026) ──
  { date:"2026-03-23", dow:"Пн", short:"23", wn:"ЧС", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"10:10-11:40", name:"МСЗИ (лекция) Филиппов", badge:"пропустить"},
      {time:"11:50-13:55", name:"Схемотехника (лекция) Данилюк", badge:"обязательно!"},
    ]},
  { date:"2026-03-24", dow:"Вт", short:"24", wn:"ЧС", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"11:50-13:55", name:"Участие специалиста (сем.) Вехов", badge:"читать"},
      {time:"14:05-15:35", name:"Схемотехника (сем.) Данилюк", badge:"обязательно!"},
      {time:"15:55-17:25", name:"МСЗИ (сем.) Филиппов", badge:"пропустить"},
      {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"иногда читать"},
    ]},
  { date:"2026-03-25", dow:"Ср", short:"25", wn:"ЧС", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
      {time:"19:15-20:45", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
    ]},
  { date:"2026-03-26", dow:"Чт", short:"26", wn:"ЧС", taskIds:[], freeH:8, tip:"",
    uni:[]},
  { date:"2026-03-27", dow:"Пт", short:"27", wn:"ЧС", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"14:05-15:35", name:"Судебная КТКЭ (сем.) Филимонов", badge:"50/50 читать"},
      {time:"15:55-17:25", name:"Интернет технологии (лекция)", badge:"пропустить"},
      {time:"17:35-19:05", name:"Интернет технологии (сем.) Булах", badge:"обязательно!"},
      {time:"19:15-20:45", name:"ТКЭ (сем.) Купин", badge:"обязательно!"},
    ]},
  { date:"2026-03-28", dow:"Сб", short:"28", wn:"ЧС", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"10:10-11:40", name:"ТКЭ (лекция) Купин", badge:"работать на компе"},
      {time:"11:50-13:55", name:"ТКЭ (лекция) Купин", badge:"работать на компе"},
    ]},
  { date:"2026-03-29", dow:"Вс", short:"29", wn:"ЧС", taskIds:[], freeH:8, tip:"",
    uni:[]},

  // ── Неделя ЗНАМЕНАТЕЛЬ (30 марта – 5 апреля 2026) ──
  { date:"2026-03-30", dow:"Пн", short:"30", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[
      {time:"10:10-11:40", name:"МСЗИ (лекция) Филиппов", badge:"пропустить"},
      {time:"11:50-13:55", name:"Схемотехника (лекция) Данилюк", badge:"обязательно!"},
    ]},
  { date:"2026-03-31", dow:"Вт", short:"31", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[
      {time:"11:50-13:55", name:"Участие специалиста (сем.) Вехов", badge:"читать"},
      {time:"14:05-15:35", name:"Схемотехника (сем.) Данилюк", badge:"обязательно!"},
      {time:"15:55-17:25", name:"МСЗИ (сем.) Филиппов", badge:"пропустить"},
    ]},
  { date:"2026-04-01", dow:"Ср", short:"1", wn:"ЗН", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
      {time:"19:15-20:45", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
    ]},
  { date:"2026-04-02", dow:"Чт", short:"2", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[]},
  { date:"2026-04-03", dow:"Пт", short:"3", wn:"ЗН", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"14:05-15:35", name:"Участие специалиста (лекция) Вехов", badge:"читать"},
      {time:"15:55-17:25", name:"Интернет технологии (лекция)", badge:"пропустить"},
    ]},
  { date:"2026-04-04", dow:"Сб", short:"4", wn:"ЗН", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"14:05-15:35", name:"Судебная КТКЭ (лаб.) Крюкова", badge:"обязательно!"},
      {time:"15:55-17:25", name:"Судебная КТКЭ (лаб.) Крюкова", badge:"обязательно!"},
    ]},
  { date:"2026-04-05", dow:"Вс", short:"5", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[]},

  // ── Неделя ЧИСЛИТЕЛЬ (6–12 апреля 2026) ──
  { date:"2026-04-06", dow:"Пн", short:"6", wn:"ЧС", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"10:10-11:40", name:"МСЗИ (лекция) Филиппов", badge:"пропустить"},
      {time:"11:50-13:55", name:"Схемотехника (лекция) Данилюк", badge:"обязательно!"},
    ]},
  { date:"2026-04-07", dow:"Вт", short:"7", wn:"ЧС", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"11:50-13:55", name:"Участие специалиста (сем.) Вехов", badge:"читать"},
      {time:"14:05-15:35", name:"Схемотехника (сем.) Данилюк", badge:"обязательно!"},
      {time:"15:55-17:25", name:"МСЗИ (сем.) Филиппов", badge:"пропустить"},
      {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"иногда читать"},
    ]},
  { date:"2026-04-08", dow:"Ср", short:"8", wn:"ЧС", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
      {time:"19:15-20:45", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
    ]},
  { date:"2026-04-09", dow:"Чт", short:"9", wn:"ЧС", taskIds:[], freeH:8, tip:"",
    uni:[]},
  { date:"2026-04-10", dow:"Пт", short:"10", wn:"ЧС", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"14:05-15:35", name:"Судебная КТКЭ (сем.) Филимонов", badge:"50/50 читать"},
      {time:"15:55-17:25", name:"Интернет технологии (лекция)", badge:"пропустить"},
      {time:"17:35-19:05", name:"Интернет технологии (сем.) Булах", badge:"обязательно!"},
      {time:"19:15-20:45", name:"ТКЭ (сем.) Купин", badge:"обязательно!"},
    ]},
  { date:"2026-04-11", dow:"Сб", short:"11", wn:"ЧС", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"10:10-11:40", name:"ТКЭ (лекция) Купин", badge:"работать на компе"},
      {time:"11:50-13:55", name:"ТКЭ (лекция) Купин", badge:"работать на компе"},
    ]},
  { date:"2026-04-12", dow:"Вс", short:"12", wn:"ЧС", taskIds:[], freeH:8, tip:"",
    uni:[]},

  // ── Неделя ЗНАМЕНАТЕЛЬ (13–19 апреля 2026) ──
  { date:"2026-04-13", dow:"Пн", short:"13", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[
      {time:"10:10-11:40", name:"МСЗИ (лекция) Филиппов", badge:"пропустить"},
      {time:"11:50-13:55", name:"Схемотехника (лекция) Данилюк", badge:"обязательно!"},
    ]},
  { date:"2026-04-14", dow:"Вт", short:"14", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[
      {time:"11:50-13:55", name:"Участие специалиста (сем.) Вехов", badge:"читать"},
      {time:"14:05-15:35", name:"Схемотехника (сем.) Данилюк", badge:"обязательно!"},
      {time:"15:55-17:25", name:"МСЗИ (сем.) Филиппов", badge:"пропустить"},
    ]},
  { date:"2026-04-15", dow:"Ср", short:"15", wn:"ЗН", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
      {time:"19:15-20:45", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
    ]},
  { date:"2026-04-16", dow:"Чт", short:"16", wn:"ЗН", taskIds:[], freeH:2, tip:"",
    uni:[
      {time:"11:50-17:35", name:"Лаба ТКЭ Купин", badge:"обязательно!"},
    ]},
  { date:"2026-04-17", dow:"Пт", short:"17", wn:"ЗН", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"14:05-15:35", name:"Участие специалиста (лекция) Вехов", badge:"читать"},
      {time:"15:55-17:25", name:"Интернет технологии (лекция)", badge:"пропустить"},
    ]},
  { date:"2026-04-18", dow:"Сб", short:"18", wn:"ЗН", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"14:05-15:35", name:"Судебная КТКЭ (лаб.) Крюкова", badge:"обязательно!"},
      {time:"15:55-17:25", name:"Судебная КТКЭ (лаб.) Крюкова", badge:"обязательно!"},
    ]},
  { date:"2026-04-19", dow:"Вс", short:"19", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[]},

  // ── Неделя ЧИСЛИТЕЛЬ (20–26 апреля 2026) ──
  { date:"2026-04-20", dow:"Пн", short:"20", wn:"ЧС", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"10:10-11:40", name:"МСЗИ (лекция) Филиппов", badge:"пропустить"},
      {time:"11:50-13:55", name:"Схемотехника (лекция) Данилюк", badge:"обязательно!"},
    ]},
  { date:"2026-04-21", dow:"Вт", short:"21", wn:"ЧС", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"11:50-13:55", name:"Участие специалиста (сем.) Вехов", badge:"читать"},
      {time:"14:05-15:35", name:"Схемотехника (сем.) Данилюк", badge:"обязательно!"},
      {time:"15:55-17:25", name:"МСЗИ (сем.) Филиппов", badge:"пропустить"},
      {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"иногда читать"},
    ]},
  { date:"2026-04-22", dow:"Ср", short:"22", wn:"ЧС", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
      {time:"19:15-20:45", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
    ]},
  { date:"2026-04-23", dow:"Чт", short:"23", wn:"ЧС", taskIds:[], freeH:8, tip:"",
    uni:[]},
  { date:"2026-04-24", dow:"Пт", short:"24", wn:"ЧС", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"14:05-15:35", name:"Судебная КТКЭ (сем.) Филимонов", badge:"50/50 читать"},
      {time:"15:55-17:25", name:"Интернет технологии (лекция)", badge:"пропустить"},
      {time:"17:35-19:05", name:"Интернет технологии (сем.) Булах", badge:"обязательно!"},
      {time:"19:15-20:45", name:"ТКЭ (сем.) Купин", badge:"обязательно!"},
    ]},
  { date:"2026-04-25", dow:"Сб", short:"25", wn:"ЧС", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"10:10-11:40", name:"ТКЭ (лекция) Купин", badge:"работать на компе"},
      {time:"11:50-13:55", name:"ТКЭ (лекция) Купин", badge:"работать на компе"},
    ]},
  { date:"2026-04-26", dow:"Вс", short:"26", wn:"ЧС", taskIds:[], freeH:8, tip:"",
    uni:[]},

  // ── Неделя ЗНАМЕНАТЕЛЬ (27 апреля – 3 мая 2026) ──
  { date:"2026-04-27", dow:"Пн", short:"27", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[
      {time:"10:10-11:40", name:"МСЗИ (лекция) Филиппов", badge:"пропустить"},
      {time:"11:50-13:55", name:"Схемотехника (лекция) Данилюк", badge:"обязательно!"},
    ]},
  { date:"2026-04-28", dow:"Вт", short:"28", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[
      {time:"11:50-13:55", name:"Участие специалиста (сем.) Вехов", badge:"читать"},
      {time:"14:05-15:35", name:"Схемотехника (сем.) Данилюк", badge:"обязательно!"},
      {time:"15:55-17:25", name:"МСЗИ (сем.) Филиппов", badge:"пропустить"},
    ]},
  { date:"2026-04-29", dow:"Ср", short:"29", wn:"ЗН", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
      {time:"19:15-20:45", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
    ]},
  { date:"2026-04-30", dow:"Чт", short:"30", wn:"ЗН", taskIds:[], freeH:2, tip:"",
    uni:[
      {time:"11:50-17:35", name:"Лаба ТКЭ Купин", badge:"обязательно!"},
    ]},
  { date:"2026-05-01", dow:"Пт", short:"1", wn:"ЗН", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"14:05-15:35", name:"Участие специалиста (лекция) Вехов", badge:"читать"},
      {time:"15:55-17:25", name:"Интернет технологии (лекция)", badge:"пропустить"},
    ]},
  { date:"2026-05-02", dow:"Сб", short:"2", wn:"ЗН", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"14:05-15:35", name:"Судебная КТКЭ (лаб.) Крюкова", badge:"обязательно!"},
      {time:"15:55-17:25", name:"Судебная КТКЭ (лаб.) Крюкова", badge:"обязательно!"},
    ]},
  { date:"2026-05-03", dow:"Вс", short:"3", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[]},

  // ── Неделя ЧИСЛИТЕЛЬ (4–10 мая 2026) ──
  { date:"2026-05-04", dow:"Пн", short:"4", wn:"ЧС", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"10:10-11:40", name:"МСЗИ (лекция) Филиппов", badge:"пропустить"},
      {time:"11:50-13:55", name:"Схемотехника (лекция) Данилюк", badge:"обязательно!"},
    ]},
  { date:"2026-05-05", dow:"Вт", short:"5", wn:"ЧС", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"11:50-13:55", name:"Участие специалиста (сем.) Вехов", badge:"читать"},
      {time:"14:05-15:35", name:"Схемотехника (сем.) Данилюк", badge:"обязательно!"},
      {time:"15:55-17:25", name:"МСЗИ (сем.) Филиппов", badge:"пропустить"},
      {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"иногда читать"},
    ]},
  { date:"2026-05-06", dow:"Ср", short:"6", wn:"ЧС", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
      {time:"19:15-20:45", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
    ]},
  { date:"2026-05-07", dow:"Чт", short:"7", wn:"ЧС", taskIds:[], freeH:8, tip:"",
    uni:[]},
  { date:"2026-05-08", dow:"Пт", short:"8", wn:"ЧС", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"14:05-15:35", name:"Судебная КТКЭ (сем.) Филимонов", badge:"50/50 читать"},
      {time:"15:55-17:25", name:"Интернет технологии (лекция)", badge:"пропустить"},
      {time:"17:35-19:05", name:"Интернет технологии (сем.) Булах", badge:"обязательно!"},
      {time:"19:15-20:45", name:"ТКЭ (сем.) Купин", badge:"обязательно!"},
    ]},
  { date:"2026-05-09", dow:"Сб", short:"9", wn:"ЧС", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"10:10-11:40", name:"ТКЭ (лекция) Купин", badge:"работать на компе"},
      {time:"11:50-13:55", name:"ТКЭ (лекция) Купин", badge:"работать на компе"},
    ]},
  { date:"2026-05-10", dow:"Вс", short:"10", wn:"ЧС", taskIds:[], freeH:8, tip:"",
    uni:[]},

  // ── Неделя ЗНАМЕНАТЕЛЬ (11–17 мая 2026) ──
  { date:"2026-05-11", dow:"Пн", short:"11", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[
      {time:"10:10-11:40", name:"МСЗИ (лекция) Филиппов", badge:"пропустить"},
      {time:"11:50-13:55", name:"Схемотехника (лекция) Данилюк", badge:"обязательно!"},
    ]},
  { date:"2026-05-12", dow:"Вт", short:"12", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[
      {time:"11:50-13:55", name:"Участие специалиста (сем.) Вехов", badge:"читать"},
      {time:"14:05-15:35", name:"Схемотехника (сем.) Данилюк", badge:"обязательно!"},
      {time:"15:55-17:25", name:"МСЗИ (сем.) Филиппов", badge:"пропустить"},
    ]},
  { date:"2026-05-13", dow:"Ср", short:"13", wn:"ЗН", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
      {time:"19:15-20:45", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
    ]},
  { date:"2026-05-14", dow:"Чт", short:"14", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[]},
  { date:"2026-05-15", dow:"Пт", short:"15", wn:"ЗН", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"14:05-15:35", name:"Участие специалиста (лекция) Вехов", badge:"читать"},
      {time:"15:55-17:25", name:"Интернет технологии (лекция)", badge:"пропустить"},
    ]},
  { date:"2026-05-16", dow:"Сб", short:"16", wn:"ЗН", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"14:05-15:35", name:"Судебная КТКЭ (лаб.) Крюкова", badge:"обязательно!"},
      {time:"15:55-17:25", name:"Судебная КТКЭ (лаб.) Крюкова", badge:"обязательно!"},
    ]},
  { date:"2026-05-17", dow:"Вс", short:"17", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[]},

  // ── Неделя ЧИСЛИТЕЛЬ (18–24 мая 2026) ──
  { date:"2026-05-18", dow:"Пн", short:"18", wn:"ЧС", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"10:10-11:40", name:"МСЗИ (лекция) Филиппов", badge:"пропустить"},
      {time:"11:50-13:55", name:"Схемотехника (лекция) Данилюк", badge:"обязательно!"},
    ]},
  { date:"2026-05-19", dow:"Вт", short:"19", wn:"ЧС", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"11:50-13:55", name:"Участие специалиста (сем.) Вехов", badge:"читать"},
      {time:"14:05-15:35", name:"Схемотехника (сем.) Данилюк", badge:"обязательно!"},
      {time:"15:55-17:25", name:"МСЗИ (сем.) Филиппов", badge:"пропустить"},
      {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"иногда читать"},
    ]},
  { date:"2026-05-20", dow:"Ср", short:"20", wn:"ЧС", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
      {time:"19:15-20:45", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
    ]},
  { date:"2026-05-21", dow:"Чт", short:"21", wn:"ЧС", taskIds:[], freeH:8, tip:"",
    uni:[]},
  { date:"2026-05-22", dow:"Пт", short:"22", wn:"ЧС", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"14:05-15:35", name:"Судебная КТКЭ (сем.) Филимонов", badge:"50/50 читать"},
      {time:"15:55-17:25", name:"Интернет технологии (лекция)", badge:"пропустить"},
      {time:"17:35-19:05", name:"Интернет технологии (сем.) Булах", badge:"обязательно!"},
      {time:"19:15-20:45", name:"ТКЭ (сем.) Купин", badge:"обязательно!"},
    ]},
  { date:"2026-05-23", dow:"Сб", short:"23", wn:"ЧС", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"10:10-11:40", name:"ТКЭ (лекция) Купин", badge:"работать на компе"},
      {time:"11:50-13:55", name:"ТКЭ (лекция) Купин", badge:"работать на компе"},
    ]},
  { date:"2026-05-24", dow:"Вс", short:"24", wn:"ЧС", taskIds:[], freeH:8, tip:"",
    uni:[]},

  // ── Неделя ЗНАМЕНАТЕЛЬ (25–31 мая 2026) ──
  { date:"2026-05-25", dow:"Пн", short:"25", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[
      {time:"10:10-11:40", name:"МСЗИ (лекция) Филиппов", badge:"пропустить"},
      {time:"11:50-13:55", name:"Схемотехника (лекция) Данилюк", badge:"обязательно!"},
    ]},
  { date:"2026-05-26", dow:"Вт", short:"26", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[
      {time:"11:50-13:55", name:"Участие специалиста (сем.) Вехов", badge:"читать"},
      {time:"14:05-15:35", name:"Схемотехника (сем.) Данилюк", badge:"обязательно!"},
      {time:"15:55-17:25", name:"МСЗИ (сем.) Филиппов", badge:"пропустить"},
    ]},
  { date:"2026-05-27", dow:"Ср", short:"27", wn:"ЗН", taskIds:[], freeH:4, tip:"",
    uni:[
      {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
      {time:"19:15-20:45", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
    ]},
  { date:"2026-05-28", dow:"Чт", short:"28", wn:"ЗН", taskIds:[], freeH:2, tip:"",
    uni:[
      {time:"11:50-17:35", name:"Лаба ТКЭ Купин", badge:"обязательно!"},
    ]},
  { date:"2026-05-29", dow:"Пт", short:"29", wn:"ЗН", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"14:05-15:35", name:"Участие специалиста (лекция) Вехов", badge:"читать"},
      {time:"15:55-17:25", name:"Интернет технологии (лекция)", badge:"пропустить"},
    ]},
  { date:"2026-05-30", dow:"Сб", short:"30", wn:"ЗН", taskIds:[], freeH:5, tip:"",
    uni:[
      {time:"14:05-15:35", name:"Судебная КТКЭ (лаб.) Крюкова", badge:"обязательно!"},
      {time:"15:55-17:25", name:"Судебная КТКЭ (лаб.) Крюкова", badge:"обязательно!"},
    ]},
  { date:"2026-05-31", dow:"Вс", short:"31", wn:"ЗН", taskIds:[], freeH:8, tip:"",
    uni:[]},
];

// ═══════════════════════════════════════════
//  BADGE COLORS
// ═══════════════════════════════════════════
const badgeStyle = (badge, theme) => {
  const m = theme === "light" ? 1.5 : 1;
  if (badge.includes("пропустить")) return { bg:`rgba(255,107,107,${0.12*m})`, color:"#FF6B6B" };
  if (badge.includes("обязательно")) return { bg:`rgba(255,165,0,${0.15*m})`, color:"#FFA500" };
  if (badge.includes("50/50") || badge.includes("иногда")) return { bg:`rgba(253,224,71,${0.12*m})`, color:"#FDE047" };
  if (badge.includes("компе")) return { bg:`rgba(34,211,238,${0.12*m})`, color:"#22D3EE" };
  return { bg:`rgba(74,222,128,${0.12*m})`, color:"#4ADE80" }; // читать
};

// ═══════════════════════════════════════════
//  ADD TASK MODAL
// ═══════════════════════════════════════════
const EMPTY_FORM = { title:"", cat:"sprint3", type:"day", date:"", deadlineDate:"", totalHours:"", est:"", url:"" };
const LIGHT_CATS = new Set(["sprint3", "go_extra", "sql", "kafka", "redis"]);
const HEAVY_CATS = new Set(["testing", "docker", "sysdesign", "sprint5"]);
const getAutoTaskType = (cat) => LIGHT_CATS.has(cat) ? "light" : HEAVY_CATS.has(cat) ? "heavy" : null;

function AddTaskModal({ isOpen, onClose, onSave, categories }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [manualType, setManualType] = useState("light");
  const [pendingTask, setPendingTask] = useState(null);
  const [scheduleResult, setScheduleResult] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (!isOpen) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const needsManual = form.type === "deadline" && getAutoTaskType(form.cat) === null;

  const buildTask = () => {
    const catInfo = form.cat === "own"
      ? { color:"#94A3B8", emoji:"📌" }
      : (categories[form.cat] || { color:"#94A3B8", emoji:"📌" });
    return {
      id: `ut_${Date.now()}`,
      title: form.title.trim(),
      cat: form.cat,
      type: form.type,
      date: form.type === "day" ? form.date : "",
      deadlineDate: form.type === "deadline" ? form.deadlineDate : "",
      totalHours: form.type === "deadline" ? Number(form.totalHours) : 0,
      est: Number(form.est) || 0,
      url: form.url.trim(),
      color: catInfo.color,
      emoji: catInfo.emoji,
      createdAt: new Date().toISOString(),
    };
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const task = buildTask();

    if (form.type === "day") {
      onSave(task);
      setForm(EMPTY_FORM);
      onClose();
      return;
    }

    // deadline flow → автопланировщик
    const taskType = getAutoTaskType(form.cat) ?? manualType;
    const result = autoScheduleTask({ ...task, taskType }, DAYS);
    setPendingTask(task);
    setScheduleResult(result);
    setPreviewOpen(true);
  };

  const handleConfirm = (editedSchedule) => {
    onSave(pendingTask);
    try {
      const raw = window.localStorage.getItem("user_schedule_v1");
      const stored = raw ? JSON.parse(raw) : {};
      stored[pendingTask.id] = editedSchedule;
      window.localStorage.setItem("user_schedule_v1", JSON.stringify(stored));
    } catch {}
    setPreviewOpen(false);
    setForm(EMPTY_FORM);
    onClose();
  };

  const inp = {
    background:"var(--bg-surface)", border:"1px solid var(--border)", borderRadius:6,
    color:"var(--text-primary)", fontSize:12, padding:"6px 10px", width:"100%",
    fontFamily:"'IBM Plex Mono','Fira Code',monospace", outline:"none",
  };
  const label = { fontSize:9, letterSpacing:2, color:"var(--text-faint)", display:"block", marginBottom:4, marginTop:12 };

  return (
    <>
      <div style={{
        position:"fixed", inset:0, zIndex:1000,
        background:"rgba(7,7,15,0.85)", display:"flex",
        alignItems:"center", justifyContent:"center", padding:20,
      }} onClick={onClose}>
        <div style={{
          background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:12,
          padding:24, width:"100%", maxWidth:420,
          fontFamily:"'IBM Plex Mono','Fira Code',monospace",
          boxShadow:"var(--shadow-elevated)",
        }} onClick={e => e.stopPropagation()}>

          <div style={{ fontSize:9, letterSpacing:4, color:"var(--text-faint)", marginBottom:2 }}>НОВАЯ ЗАДАЧА</div>
          <div style={{ fontFamily:"'IBM Plex Sans'", fontWeight:700, fontSize:16, color:"var(--text-primary)", marginBottom:16 }}>
            Добавить задачу
          </div>

          <form onSubmit={handleSubmit}>
            <label style={label}>НАЗВАНИЕ *</label>
            <input style={inp} value={form.title} onChange={e => set("title", e.target.value)}
              placeholder="Название задачи" required />

            <label style={label}>КАТЕГОРИЯ</label>
            <select style={inp} value={form.cat} onChange={e => set("cat", e.target.value)}>
              {Object.entries(categories).map(([k, v]) => (
                <option key={k} value={k}>{v.emoji} {v.label}</option>
              ))}
              <option value="own">📌 Свои</option>
            </select>

            <label style={label}>ТИП</label>
            <div style={{ display:"flex", gap:16 }}>
              {[["day","На конкретный день"],["deadline","С дедлайном"]].map(([v, l]) => (
                <label key={v} style={{ fontSize:11, color: form.type===v?"var(--text-primary)":"var(--text-secondary)", cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                  <input type="radio" name="type" value={v} checked={form.type===v}
                    onChange={() => set("type", v)} style={{ accentColor:"#818CF8" }} />
                  {l}
                </label>
              ))}
            </div>

            {form.type === "day" && (<>
              <label style={label}>ДАТА</label>
              <input type="date" style={inp} value={form.date} onChange={e => set("date", e.target.value)} />
            </>)}

            {form.type === "deadline" && (<>
              <label style={label}>ДЕДЛАЙН</label>
              <input type="date" style={inp} value={form.deadlineDate} onChange={e => set("deadlineDate", e.target.value)} />
              <label style={label}>ВСЕГО ЧАСОВ</label>
              <input type="number" min="0" step="0.5" style={inp} value={form.totalHours}
                onChange={e => set("totalHours", e.target.value)} placeholder="0" />
              {needsManual && (<>
                <label style={label}>ТИП НАГРУЗКИ</label>
                <div style={{ display:"flex", gap:16 }}>
                  {[["light","Лёгкая (читать/смотреть)"],["heavy","Тяжёлая (кодить/конспектировать)"]].map(([v, l]) => (
                    <label key={v} style={{ fontSize:11, color: manualType===v?"var(--text-primary)":"var(--text-secondary)", cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                      <input type="radio" name="manualType" value={v} checked={manualType===v}
                        onChange={() => setManualType(v)} style={{ accentColor:"#818CF8" }} />
                      {l}
                    </label>
                  ))}
                </div>
              </>)}
            </>)}

            <label style={label}>ОЦЕНКА ВРЕМЕНИ (ч)</label>
            <input type="number" min="0" step="0.5" style={inp} value={form.est}
              onChange={e => set("est", e.target.value)} placeholder="0" />

            <label style={label}>ССЫЛКА (необязательно)</label>
            <input style={inp} value={form.url} onChange={e => set("url", e.target.value)}
              placeholder="https://..." />

            <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
              <button type="button" onClick={onClose}
                style={{ padding:"7px 16px", borderRadius:6, border:"1px solid var(--border)", background:"transparent",
                  color:"var(--text-secondary)", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>
                Отмена
              </button>
              <button type="submit"
                style={{ padding:"7px 16px", borderRadius:6, border:"none",
                  background:"linear-gradient(90deg,#818CF8,#22D3EE)", color:"var(--bg-base)",
                  fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                Добавить
              </button>
            </div>
          </form>
        </div>
      </div>

      <SchedulePreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onConfirm={handleConfirm}
        schedule={scheduleResult}
        task={pendingTask}
      />
    </>
  );
}

// ═══════════════════════════════════════════
//  ADD BOOK MODAL
// ═══════════════════════════════════════════
const EMPTY_BOOK_FORM = { title:"", totalPages:"", readPages:"0", deadline:"", readingType:"оба варианта", pagesPerHour:"30" };

function AddBookModal({ isOpen, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY_BOOK_FORM);

  if (!isOpen) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const preview = (() => {
    if (!form.deadline || !form.totalPages) return null;
    const ppd = calcPagesPerDay({
      totalPages: Number(form.totalPages) || 0,
      readPages: Number(form.readPages) || 0,
      deadline: form.deadline,
    });
    const d = new Date(form.deadline);
    const dateStr = isNaN(d) ? form.deadline : d.toLocaleDateString("ru-RU", { day:"numeric", month:"long" });
    return { ppd, dateStr };
  })();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.totalPages || !form.deadline) return;
    onSave({
      id: `ub_${Date.now()}`,
      title: form.title.trim(),
      totalPages: Number(form.totalPages),
      readPages: Number(form.readPages) || 0,
      deadline: form.deadline,
      readingType: form.readingType,
      pagesPerHour: Number(form.pagesPerHour) || 30,
      createdAt: new Date().toISOString(),
    });
    setForm(EMPTY_BOOK_FORM);
    onClose();
  };

  const inp = {
    background:"var(--bg-surface)", border:"1px solid var(--border)", borderRadius:6,
    color:"var(--text-primary)", fontSize:12, padding:"6px 10px", width:"100%",
    fontFamily:"'IBM Plex Mono','Fira Code',monospace", outline:"none",
  };
  const label = { fontSize:9, letterSpacing:2, color:"var(--text-faint)", display:"block", marginBottom:4, marginTop:12 };

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:1000,
      background:"rgba(7,7,15,0.85)", display:"flex",
      alignItems:"center", justifyContent:"center", padding:20,
    }} onClick={onClose}>
      <div style={{
        background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:12,
        padding:24, width:"100%", maxWidth:420,
        fontFamily:"'IBM Plex Mono','Fira Code',monospace",
        boxShadow:"var(--shadow-elevated)",
      }} onClick={e => e.stopPropagation()}>

        <div style={{ fontSize:9, letterSpacing:4, color:"var(--text-faint)", marginBottom:2 }}>НОВАЯ КНИГА</div>
        <div style={{ fontFamily:"'IBM Plex Sans'", fontWeight:700, fontSize:16, color:"var(--text-primary)", marginBottom:16 }}>
          Добавить книгу
        </div>

        <form onSubmit={handleSubmit}>
          <label style={label}>НАЗВАНИЕ *</label>
          <input style={inp} value={form.title} onChange={e => set("title", e.target.value)}
            placeholder="Название книги" required />

          <label style={label}>ВСЕГО СТРАНИЦ *</label>
          <input type="number" min="1" style={inp} value={form.totalPages}
            onChange={e => set("totalPages", e.target.value)} placeholder="300" required />

          <label style={label}>УЖЕ ПРОЧИТАНО (стр.)</label>
          <input type="number" min="0" style={inp} value={form.readPages}
            onChange={e => set("readPages", e.target.value)} placeholder="0" />

          <label style={label}>ДЕДЛАЙН *</label>
          <input type="date" style={inp} value={form.deadline}
            onChange={e => set("deadline", e.target.value)} required />

          <label style={label}>ТИП ЧТЕНИЯ</label>
          <select style={inp} value={form.readingType} onChange={e => set("readingType", e.target.value)}>
            <option value="в дороге">в дороге</option>
            <option value="дома">дома</option>
            <option value="оба варианта">оба варианта</option>
          </select>

          <label style={label}>СТРАНИЦ В ЧАС</label>
          <input type="number" min="1" style={inp} value={form.pagesPerHour}
            onChange={e => set("pagesPerHour", e.target.value)} placeholder="30" />

          {preview && (
            <div style={{ marginTop:14, padding:"8px 12px", background:"rgba(129,140,248,0.08)",
              borderRadius:6, border:"1px solid rgba(129,140,248,0.15)" }}>
              <span style={{ fontSize:11, color:"#818CF8" }}>
                Нужно читать ~ <strong>{preview.ppd}</strong> стр/день до {preview.dateStr}
              </span>
            </div>
          )}

          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button type="button" onClick={onClose}
              style={{ padding:"7px 16px", borderRadius:6, border:"1px solid var(--border)", background:"transparent",
                color:"var(--text-secondary)", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>
              Отмена
            </button>
            <button type="submit"
              style={{ padding:"7px 16px", borderRadius:6, border:"none",
                background:"linear-gradient(90deg,#818CF8,#22D3EE)", color:"var(--bg-base)",
                fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
              Добавить книгу
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
//  SCHEDULE PREVIEW MODAL
// ═══════════════════════════════════════════
const MONTHS_RU = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
const DAYS_RU   = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];

function SchedulePreviewModal({ isOpen, onClose, onConfirm, schedule, task }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!schedule || schedule.error) { setRows([]); return; }
    setRows(schedule.map(s => ({ ...s })));
  }, [schedule]);

  if (!isOpen) return null;

  const isError = schedule && schedule.error;
  const totalAssigned = rows.reduce((s, r) => s + (Number(r.assignedHours) || 0), 0);
  const maxH = rows.length > 0 ? Math.max(...rows.map(r => Number(r.assignedHours) || 0)) : 1;

  const setRowH = (date, val) => {
    setRows(prev => prev.map(r => r.date === date ? { ...r, assignedHours: val } : r));
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${DAYS_RU[d.getDay()]}, ${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
  };

  const overlay = {
    position:"fixed", inset:0, zIndex:1001,
    background:"rgba(7,7,15,0.88)", display:"flex",
    alignItems:"center", justifyContent:"center", padding:20,
  };
  const modal = {
    background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:12,
    padding:24, width:"100%", maxWidth:480,
    fontFamily:"'IBM Plex Mono','Fira Code',monospace",
    maxHeight:"80vh", display:"flex", flexDirection:"column",
    boxShadow:"var(--shadow-elevated)",
  };
  const inp = {
    background:"var(--bg-surface)", border:"1px solid var(--border)", borderRadius:4,
    color:"var(--text-primary)", fontSize:11, padding:"3px 6px", width:52,
    fontFamily:"inherit", outline:"none", textAlign:"center",
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>

        <div style={{ fontSize:9, letterSpacing:4, color:"var(--text-faint)", marginBottom:2 }}>ПРЕДПРОСМОТР</div>
        <div style={{ fontFamily:"'IBM Plex Sans'", fontWeight:700, fontSize:15, color:"var(--text-primary)", marginBottom:16, lineHeight:1.3 }}>
          Как распределится «{task?.title}»
        </div>

        {isError ? (
          <div style={{ padding:"10px 14px", background:"rgba(253,224,71,0.08)", border:"1px solid rgba(253,224,71,0.2)",
            borderRadius:8, marginBottom:16 }}>
            <div style={{ fontSize:12, color:"#FDE047", lineHeight:1.5 }}>⚠️ {schedule.error}</div>
          </div>
        ) : (
          <>
            <div style={{ overflowY:"auto", flex:1, marginBottom:12 }}>
              {rows.map(row => {
                const h = Number(row.assignedHours) || 0;
                const barW = maxH > 0 ? Math.round(h / maxH * 100) : 0;
                return (
                  <div key={row.date} style={{ display:"flex", alignItems:"center", gap:8,
                    padding:"5px 4px", borderBottom:"1px solid var(--bg-card)" }}>
                    <span style={{ fontSize:11, color:"var(--text-muted)", width:100, flexShrink:0 }}>
                      {formatDate(row.date)}
                    </span>
                    <div style={{ flex:1, height:4, background:"var(--border)", borderRadius:2, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${barW}%`, borderRadius:2,
                        background:"linear-gradient(90deg,#818CF8,#22D3EE)", transition:"width .3s" }} />
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
                      <input type="number" min="0" max="12" step="0.5" style={inp}
                        value={row.assignedHours}
                        onChange={e => setRowH(row.date, Number(e.target.value))} />
                      <span style={{ fontSize:10, color:"var(--text-faint)" }}>ч</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ padding:"8px 4px", borderTop:"1px solid var(--border)", marginBottom:14,
              display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:10, color:"var(--text-secondary)" }}>Итого</span>
              <span style={{ fontSize:12,
                color: Math.abs(totalAssigned - (task?.totalHours || 0)) < 0.1 ? "#4ADE80" : "#FFD93D" }}>
                {Math.round(totalAssigned * 10) / 10} / {task?.totalHours || 0} ч
              </span>
            </div>
          </>
        )}

        <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
          <button onClick={onClose}
            style={{ padding:"7px 16px", borderRadius:6, border:"1px solid var(--border)", background:"transparent",
              color:"var(--text-secondary)", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>
            Отмена
          </button>
          {!isError && (
            <button onClick={() => { onConfirm(rows); onClose(); }}
              style={{ padding:"7px 16px", borderRadius:6, border:"none",
                background:"linear-gradient(90deg,#818CF8,#22D3EE)", color:"var(--bg-base)",
                fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
              Подтвердить расписание
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
//  BULK SCHEDULE MODAL
// ═══════════════════════════════════════════
function BulkScheduleModal({ isOpen, onClose, onConfirm, items }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [editedItems, setEditedItems] = useState([]);

  useEffect(() => {
    if (!items || !items.length) return;
    setEditedItems(items.map(item => ({
      task: item.task,
      rows: item.schedule && !item.schedule.error ? item.schedule.map(s => ({ ...s })) : null,
      error: item.schedule?.error || null,
    })));
    setActiveIdx(0);
  }, [items]);

  if (!isOpen || !editedItems.length) return null;

  const active = editedItems[activeIdx];
  const maxH = active?.rows ? Math.max(...active.rows.map(r => Number(r.assignedHours) || 0), 1) : 1;
  const totalAssigned = active?.rows ? active.rows.reduce((s, r) => s + (Number(r.assignedHours) || 0), 0) : 0;

  const setRowH = (date, val) => setEditedItems(prev => prev.map((item, i) =>
    i !== activeIdx || !item.rows ? item
    : { ...item, rows: item.rows.map(r => r.date === date ? { ...r, assignedHours: Number(val) } : r) }
  ));

  const MONTHS = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
  const DOWS   = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
  const fmt = (ds) => { const d = new Date(ds); return `${DOWS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };

  const inp = {
    background:"var(--bg-surface)", border:"1px solid var(--border)", borderRadius:4,
    color:"var(--text-primary)", fontSize:11, padding:"3px 6px", width:52,
    fontFamily:"'IBM Plex Mono','Fira Code',monospace", outline:"none", textAlign:"center",
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:1002, background:"rgba(7,7,15,0.88)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}
      onClick={onClose}>
      <div style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:12,
        padding:24, width:"100%", maxWidth:580, maxHeight:"82vh",
        fontFamily:"'IBM Plex Mono','Fira Code',monospace", display:"flex", flexDirection:"column",
        boxShadow:"var(--shadow-elevated)" }}
        onClick={e => e.stopPropagation()}>

        <div style={{ fontSize:9, letterSpacing:4, color:"var(--text-faint)", marginBottom:2 }}>АВТОРАСПИСАНИЕ</div>
        <div style={{ fontFamily:"'IBM Plex Sans'", fontWeight:700, fontSize:15, color:"var(--text-primary)", marginBottom:14 }}>
          Пересчёт расписания
        </div>

        <div style={{ display:"flex", gap:12, flex:1, minHeight:0 }}>
          {/* Tabs */}
          <div style={{ width:160, flexShrink:0, display:"flex", flexDirection:"column", gap:4 }}>
            {editedItems.map((item, i) => (
              <button key={item.task.id} onClick={() => setActiveIdx(i)}
                style={{ textAlign:"left", padding:"7px 10px", borderRadius:6, border:"1px solid",
                  borderColor: i===activeIdx ? "#2A2A6E" : "var(--border)",
                  background: i===activeIdx ? "rgba(129,140,248,0.1)" : "transparent",
                  color: i===activeIdx ? "#C0C0FF" : "var(--text-secondary)",
                  fontSize:11, cursor:"pointer", fontFamily:"inherit",
                  whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {item.error ? "⚠️ " : item.task.emoji + " "}
                {item.task.title}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column" }}>
            {active?.error ? (
              <div style={{ padding:"10px 14px", background:"rgba(253,224,71,0.08)",
                border:"1px solid rgba(253,224,71,0.2)", borderRadius:8 }}>
                <div style={{ fontSize:12, color:"#FDE047", lineHeight:1.5 }}>⚠️ {active.error}</div>
              </div>
            ) : (
              <>
                <div style={{ overflowY:"auto", flex:1, marginBottom:10 }}>
                  {(active?.rows || []).map(row => {
                    const h = Number(row.assignedHours) || 0;
                    return (
                      <div key={row.date} style={{ display:"flex", alignItems:"center", gap:8,
                        padding:"5px 2px", borderBottom:"1px solid var(--bg-card)" }}>
                        <span style={{ fontSize:11, color:"var(--text-muted)", width:90, flexShrink:0 }}>{fmt(row.date)}</span>
                        <div style={{ flex:1, height:4, background:"var(--border)", borderRadius:2, overflow:"hidden" }}>
                          <div style={{ height:"100%", borderRadius:2, transition:"width .3s",
                            width:`${maxH > 0 ? Math.round(h/maxH*100) : 0}%`,
                            background:"linear-gradient(90deg,#818CF8,#22D3EE)" }} />
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
                          <input type="number" min="0" max="12" step="0.5" style={inp}
                            value={row.assignedHours}
                            onChange={e => setRowH(row.date, e.target.value)} />
                          <span style={{ fontSize:10, color:"var(--text-faint)" }}>ч</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize:11, color: Math.abs(totalAssigned - active?.task?.totalHours) < 0.1 ? "#4ADE80" : "#FFD93D",
                  textAlign:"right", marginBottom:4 }}>
                  {Math.round(totalAssigned*10)/10} / {active?.task?.totalHours} ч
                </div>
              </>
            )}
          </div>
        </div>

        <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:14, borderTop:"1px solid var(--border)", paddingTop:14 }}>
          <button onClick={onClose}
            style={{ padding:"7px 16px", borderRadius:6, border:"1px solid var(--border)", background:"transparent",
              color:"var(--text-secondary)", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>
            Отмена
          </button>
          <button onClick={() => { onConfirm(editedItems); onClose(); }}
            style={{ padding:"7px 16px", borderRadius:6, border:"none",
              background:"linear-gradient(90deg,#818CF8,#22D3EE)", color:"var(--bg-base)",
              fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            Подтвердить всё
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════
export default function StudyDashboard() {
  const [completed, setCompleted] = useState(new Set());
  const [expanded, setExpanded] = useState(new Set(["2026-03-04"]));
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("days"); // "days" | "all"
  const [modalOpen, setModalOpen] = useState(false);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkItems, setBulkItems] = useState([]);
  const [toast, setToast] = useState("");
  const [schedule, setSchedule] = useState({});           // { taskId: [{date, assignedHours}] }
  const [completedSessions, setCompletedSessions] = useState(new Set()); // "taskId::date"
  const { userTasks, addUserTask, removeUserTask } = useUserTasks();
  const { userBooks, addUserBook, removeUserBook } = useUserBooks();
  const { theme, toggleTheme } = useTheme();
  const {
    xp, streak, level, nextLevel, xpToNext, progressPct: xpPct,
    unlockedAchievements, lastUnlocked,
    addXP, checkAndUpdateStreak, markDayComplete,
    unlockAchievement, checkAchievements,
  } = useGameState();
  const [achievementPopup, setAchievementPopup] = useState(null);
  const prevCompletedRef = useRef(null);
  const prevUserBooksRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const r = localStorage.getItem("sp4_done_v3");
        if (r) setCompleted(new Set(JSON.parse(r)));
        const sc = localStorage.getItem("user_schedule_v1");
        if (sc) setSchedule(JSON.parse(sc));
        const ss = localStorage.getItem("user_sessions_v1");
        if (ss) setCompletedSessions(new Set(JSON.parse(ss)));
      } catch {}
      setLoaded(true);
    })();
  }, []);

  // Check streak on mount
  useEffect(() => { checkAndUpdateStreak(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!lastUnlocked) return;
    const achievement = ACHIEVEMENTS.find(a => a.id === lastUnlocked);
    if (!achievement) return;
    setAchievementPopup(achievement);
    const t = setTimeout(() => setAchievementPopup(null), 4000);
    return () => clearTimeout(t);
  }, [lastUnlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Award XP for completed tasks and day bonuses
  useEffect(() => {
    if (!loaded) return;
    const prev = prevCompletedRef.current;
    if (prev === null) {
      prevCompletedRef.current = completed;
      return;
    }
    for (const id of completed) {
      if (!prev.has(id)) {
        const task = TASKS.find(t => t.id === id);
        if (task) addXP(Math.round(task.est * 10));
      }
    }
    checkAchievements(completed);
    for (const day of DAYS) {
      if (!day.taskIds?.length) continue;
      const allDone = day.taskIds.every(completed.has.bind(completed));
      const wasDone = day.taskIds.every(prev.has.bind(prev));
      if (allDone && !wasDone) markDayComplete(day.date);
    }
    prevCompletedRef.current = completed;
  }, [completed, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Award XP + bookworm when a book is finished
  useEffect(() => {
    const prev = prevUserBooksRef.current;
    if (prev === null) {
      prevUserBooksRef.current = userBooks;
      return;
    }
    for (const book of userBooks) {
      if (book.totalPages > 0 && book.readPages >= book.totalPages) {
        const wasComplete = prev.find(b => b.id === book.id && b.readPages >= b.totalPages);
        if (!wasComplete) {
          addXP(200);
          unlockAchievement("bookworm");
        }
      }
    }
    prevUserBooksRef.current = userBooks;
  }, [userBooks]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem("sp4_done_v3", JSON.stringify([...completed])); } catch {}
  }, [completed, loaded]);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem("user_sessions_v1", JSON.stringify([...completedSessions])); } catch {}
  }, [completedSessions, loaded]);

  const [xpPopups, setXpPopups] = useState([]);

  const spawnXpPopup = useCallback((amount, rect, bonus) => {
    const popup = { id: Date.now() + Math.random(), amount, bonus,
      x: rect.left + rect.width / 2, y: rect.top };
    setXpPopups(p => [...p, popup]);
    setTimeout(() => setXpPopups(p => p.filter(pp => pp.id !== popup.id)), 1000);
  }, []);

  const toggle = useCallback(id => {
    setCompleted(p => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  const handleToggle = useCallback((e, taskId, dayTaskIds) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const wasCompleted = completed.has(taskId);
    if (!wasCompleted) {
      const task = TASKS.find(t => t.id === taskId);
      if (task) spawnXpPopup(Math.round(task.est * 10), rect, false);
      if (dayTaskIds) {
        const allDoneAfter = dayTaskIds.every(tid => tid === taskId || completed.has(tid));
        if (allDoneAfter) spawnXpPopup(50, rect, true);
      }
    }
    toggle(taskId);
  }, [completed, toggle, spawnXpPopup]);

  const toggleDay = useCallback(date => {
    setExpanded(p => {
      const n = new Set(p);
      n.has(date) ? n.delete(date) : n.add(date);
      return n;
    });
  }, []);

  const toggleSession = useCallback((taskId, date) => {
    setCompletedSessions(p => {
      const key = `${taskId}::${date}`;
      const n = new Set(p);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleReschedule = useCallback(() => {
    const deadlineTasks = userTasks.filter(t => t.type === "deadline");
    if (!deadlineTasks.length) { setToast("Нет задач для авторасписания"); return; }
    const todayStr = new Date().toISOString().split("T")[0];
    const futureDays = DAYS.filter(d => d.date >= todayStr);
    const items = deadlineTasks.map(task => {
      const slots = schedule[task.id] || [];
      const doneH = slots.reduce((sum, s) =>
        completedSessions.has(`${task.id}::${s.date}`) ? sum + s.assignedHours : sum, 0);
      const remainingH = Math.max(0, Math.round((task.totalHours - doneH) * 10) / 10);
      const taskType = LIGHT_CATS.has(task.cat) ? "light" : HEAVY_CATS.has(task.cat) ? "heavy" : "light";
      const result = autoScheduleTask({ ...task, totalHours: remainingH, taskType }, futureDays);
      return { task: { ...task, totalHours: remainingH }, schedule: result };
    });
    setBulkItems(items);
    setBulkOpen(true);
  }, [userTasks, schedule, completedSessions]);

  const handleBulkConfirm = useCallback((editedItems) => {
    const newSchedule = { ...schedule };
    for (const item of editedItems) {
      if (item.rows && !item.error) newSchedule[item.task.id] = item.rows;
    }
    setSchedule(newSchedule);
    try { localStorage.setItem("user_schedule_v1", JSON.stringify(newSchedule)); } catch {}
  }, [schedule]);

  // Stats
  const totalTasks = TASKS.length;
  const doneCount  = TASKS.filter(t => completed.has(t.id)).length;
  const totalH     = TASKS.reduce((s, t) => s + t.est, 0);
  const doneH      = TASKS.filter(t => completed.has(t.id)).reduce((s, t) => s + t.est, 0);
  const pct        = Math.round(doneCount / totalTasks * 100);

  const [todayStr, setTodayStr] = useState(() => new Date().toISOString().split("T")[0]);
  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date().toISOString().split("T")[0];
      setTodayStr(prev => prev !== d ? d : prev);
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  const daysUntil = (target) => {
    const diff = new Date(target) - new Date(todayStr);
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };
  const daysToSemester = daysUntil("2026-05-31");
  const daysToSprint   = daysUntil("2026-03-15");

  const catStats = Object.keys(CAT).map(c => {
    const ts = TASKS.filter(t => t.cat === c);
    return { c, total: ts.length, done: ts.filter(t => completed.has(t.id)).length };
  });

  if (!loaded) return (
    <div style={{ minHeight:"100vh", background:"var(--bg-base)", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-secondary)", fontFamily:"monospace", fontSize:12, letterSpacing:3 }}>
      ЗАГРУЗКА...
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg-base)", color:"var(--text-primary)", fontFamily:"'IBM Plex Mono','Fira Code','Courier New',monospace" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
        [data-theme="dark"]{
          --bg-base:#07070F;--bg-surface:#0A0A16;--bg-elevated:#0D0D1A;--bg-card:#0F0F20;
          --border:#181830;--border-subtle:#131326;
          --text-primary:#E0E0F0;--text-secondary:#9898B8;--text-muted:#6E6E90;--text-faint:#3A3A5E;--text-ghost:#2A2A4E;
          --shadow-card:none;--shadow-elevated:none;
        }
        [data-theme="light"]{
          --bg-base:#FAFAF7;--bg-surface:#F4F4EF;--bg-elevated:#FFFFFF;--bg-card:#FFFFFF;
          --border:#E8E8E0;--border-subtle:#EFEFEA;
          --text-primary:#1A1A2E;--text-secondary:var(--text-secondary);--text-muted:var(--text-muted);--text-faint:#ABABBB;--text-ghost:#C8C8D8;
          --shadow-card:0 1px 3px rgba(0,0,0,0.08),0 1px 2px rgba(0,0,0,0.04);--shadow-elevated:0 4px 12px rgba(0,0,0,0.1);
          --cbx-bg-empty:#F0F0EA;
        }
        *{box-sizing:border-box;margin:0;padding:0}
        *:not(.pf):not(.cbx){transition:background-color 0.3s ease,color 0.3s ease,border-color 0.3s ease,box-shadow 0.3s ease}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:var(--bg-base)}::-webkit-scrollbar-thumb{background:#222238;border-radius:2px}
        .tr{transition:all .15s}
        .task-row:hover{background:rgba(255,255,255,0.025)!important}
        .day-card:hover{border-color:rgba(255,255,255,0.1)!important}
        .pf{transition:width .5s ease}
        .xpf{transition:width 0.6s cubic-bezier(0.34,1.56,0.64,1)}
        @keyframes slideIn{from{opacity:0;transform:translateX(100px)}to{opacity:1;transform:translateX(0)}}
        @keyframes slideOut{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(100px)}}
        @keyframes shrink{from{width:100%}to{width:0%}}
        @keyframes floatUp{0%{opacity:1;transform:translateY(0) scale(1)}50%{opacity:1;transform:translateY(-20px) scale(1.1)}100%{opacity:0;transform:translateY(-45px) scale(0.9)}}
        @media(max-width:599px){.xp-num{display:none!important}}
        .cbx{width:15px;height:15px;border-radius:3px;border:1.5px solid var(--border);background:var(--cbx-bg-empty,transparent);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:all .15s}
        .cbx:hover{border-color:#5A5A8A}
        .cbx.on{border-color:transparent}
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ background:"var(--bg-surface)", borderBottom:"1px solid var(--border)", padding:"18px 20px 14px" }}>
        <div style={{ maxWidth:1100, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
            <div>
              <div style={{ fontSize:9, letterSpacing:4, color:"var(--text-faint)", marginBottom:4 }}>ПЛАН ОБУЧЕНИЯ</div>
              <div style={{ fontFamily:"'IBM Plex Sans'", fontWeight:700, fontSize:20, color:"var(--text-primary)" }}>
                Спринт 4 &rarr; <span style={{ color:"#4ADE80" }}>15 марта</span>
              </div>
              <div style={{ fontSize:11, color:"var(--text-secondary)", marginTop:3 }}>
                {doneCount}/{totalTasks} задач · {doneH.toFixed(0)}ч/{totalH}ч выполнено
              </div>
            </div>

            {/* ── LEVEL & XP ── */}
            {(() => {
              const LEVEL_EMOJI  = { junior:"🌱", middle:"⚡", senior:"🔥", techlead:"🚀", staff:"💎", principal:"👑" };
              const LEVEL_COLOR  = { junior:"#4ADE80", middle:"#22D3EE", senior:"#818CF8", techlead:"#F9A8D4", staff:"#FFD93D", principal:"#FF6B6B" };
              const LEVEL_IDS    = ["junior","middle","senior","techlead","staff","principal"];
              const currIdx      = LEVEL_IDS.indexOf(level.id);
              const fromColor    = LEVEL_COLOR[level.id];
              const toColor      = LEVEL_COLOR[LEVEL_IDS[currIdx + 1]] ?? fromColor;
              return (
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:20, lineHeight:1 }}>{LEVEL_EMOJI[level.id]}</span>
                  <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                    <span style={{ fontSize:10, color:fromColor, fontWeight:600, letterSpacing:0.5, lineHeight:1 }}>{level.label}</span>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <div title={`${xpToNext} XP до следующего уровня`}
                        style={{ width:120, height:6, background:"var(--border)", borderRadius:3, overflow:"hidden" }}>
                        <div className="xpf" style={{ height:"100%", width:`${xpPct}%`,
                          background:`linear-gradient(90deg,${fromColor},${toColor})`, borderRadius:3 }} />
                      </div>
                      <span className="xp-num" style={{ fontSize:11, color:"var(--text-muted)", lineHeight:1 }}>{xp} XP</span>
                      {streak > 0 && (
                        <span style={{ fontSize:11, color: streak >= 7 ? "#FF6B6B" : "#FFD93D", lineHeight:1 }}>
                          🔥 {streak}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <button onClick={handleReschedule}
                  style={{ padding:"6px 14px", borderRadius:6, border:"1px solid #1A2A3A",
                    background:"rgba(34,211,238,0.07)", color:"#22D3EE", fontSize:11,
                    cursor:"pointer", fontFamily:"inherit", letterSpacing:0.5 }}>
                  ⟳ Авторасписание
                </button>
                <button onClick={() => setModalOpen(true)}
                  style={{ padding:"6px 14px", borderRadius:6, border:"1px solid #2A2A6E",
                    background:"rgba(129,140,248,0.1)", color:"#818CF8", fontSize:11,
                    cursor:"pointer", fontFamily:"inherit", letterSpacing:0.5 }}>
                  ＋ Задача
                </button>
                <button onClick={() => setBookModalOpen(true)}
                  style={{ padding:"6px 14px", borderRadius:6, border:"1px solid #1A3A2E",
                    background:"rgba(74,222,128,0.08)", color:"#4ADE80", fontSize:11,
                    cursor:"pointer", fontFamily:"inherit", letterSpacing:0.5 }}>
                  ＋ Книга
                </button>
                <button onClick={toggleTheme}
                  style={{ width:32, height:32, borderRadius:"50%", border:"1px solid var(--border)",
                    background:"var(--bg-elevated)", fontSize:16, cursor:"pointer",
                    display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {theme === "dark" ? "🌙" : "☀️"}
                </button>
                <div style={{ fontFamily:"'IBM Plex Sans'", fontWeight:700, fontSize:32,
                  color: pct>75?"#4ADE80":pct>40?"#FFD93D":"#818CF8" }}>
                  {pct}%
                </div>
              </div>
              <div style={{ width:180, height:5, background:"var(--border)", borderRadius:3, overflow:"hidden" }}>
                <div className="pf" style={{ height:"100%", width:`${pct}%`,
                  background:"linear-gradient(90deg,#818CF8,#22D3EE)", borderRadius:3 }} />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display:"flex", gap:4, marginTop:14 }}>
            {[["days","📅 По дням"],["all","📋 Все задачи"],["achievements","🏆 Достижения"]].map(([id,label]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ padding:"5px 14px", borderRadius:6, border:"1px solid var(--border)", cursor:"pointer", fontSize:11,
                  background: tab===id ? "#181838" : "transparent",
                  color: tab===id ? "#C0C0FF" : "var(--text-secondary)",
                  fontFamily:"inherit", transition:"all .15s" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"16px 20px", display:"flex", gap:18 }}>

        {/* ── SIDEBAR ── */}
        <div style={{ width:210, flexShrink:0 }}>

          {/* Counters */}
          <div style={{ marginBottom:14, display:"flex", flexDirection:"column", gap:6 }}>
            <div style={{ padding:"10px 12px", background:"var(--bg-elevated)", borderRadius:8, border:"1px solid var(--border)" }}>
              <div style={{ fontSize:9, letterSpacing:3, color:"var(--text-faint)", marginBottom:4 }}>ДО КОНЦА СЕМЕСТРА</div>
              <div style={{ fontFamily:"'IBM Plex Sans'", fontWeight:700, fontSize:22,
                color: daysToSemester <= 14 ? "#FF6B6B" : daysToSemester <= 30 ? "#FFD93D" : "#4ADE80" }}>
                {daysToSemester} дн.
              </div>
              <div style={{ fontSize:9, color:"var(--text-faint)", marginTop:2 }}>31 мая 2026</div>
            </div>
            {daysToSprint > 0 && (
              <div style={{ padding:"10px 12px", background:"var(--bg-elevated)", borderRadius:8, border:"1px solid var(--border)" }}>
                <div style={{ fontSize:9, letterSpacing:3, color:"var(--text-faint)", marginBottom:4 }}>ДО ДЕДЛАЙНА СПРИНТА</div>
                <div style={{ fontFamily:"'IBM Plex Sans'", fontWeight:700, fontSize:22,
                  color: daysToSprint <= 3 ? "#FF6B6B" : daysToSprint <= 7 ? "#FFD93D" : "#818CF8" }}>
                  {daysToSprint} дн.
                </div>
                <div style={{ fontSize:9, color:"var(--text-faint)", marginTop:2 }}>15 марта 2026</div>
              </div>
            )}
          </div>

          <div style={{ fontSize:9, letterSpacing:3, color:"var(--text-faint)", marginBottom:10 }}>ПО ТЕМАМ</div>
          {catStats.map(({ c, total, done }) => {
            const cat = CAT[c];
            const p = total > 0 ? Math.round(done/total*100) : 0;
            const allDone = done === total && total > 0;
            return (
              <div key={c} style={{ marginBottom:9 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3, alignItems:"center" }}>
                  <span style={{ fontSize:11, color: allDone ? cat.color : "var(--text-muted)" }}>
                    {cat.emoji} {cat.label}
                  </span>
                  <span style={{ fontSize:9, color:"var(--text-faint)" }}>{done}/{total}</span>
                </div>
                <div style={{ height:2.5, background:"var(--border)", borderRadius:2, overflow:"hidden" }}>
                  <div className="pf" style={{ height:"100%", width:`${p}%`, background:cat.color, opacity: allDone?1:0.7, borderRadius:2 }} />
                </div>
              </div>
            );
          })}

          {/* Side projects */}
          <div style={{ marginTop:20, padding:12, background:"var(--bg-elevated)", borderRadius:8, border:"1px solid var(--border)" }}>
            <div style={{ fontSize:9, letterSpacing:3, color:"var(--text-faint)", marginBottom:8 }}>ПАРАЛЛЕЛЬНО</div>
            {[
              ["📖","GO Паттерны","в пути"],
              ["📖","Психология влияния","финал"],
              ["📖","Общая психопатология","начать до конца мес."],
              ["📖","Black Hat GO","после паттернов"],
              ["💻","EventManager","20–30ч/нед"],
              ["🏃","Спорт","утром ~2ч"],
            ].map(([e,n,s]) => (
              <div key={n} style={{ fontSize:10, color:"var(--text-secondary)", marginBottom:5, lineHeight:1.4 }}>
                {e} <span style={{ color:"var(--text-muted)" }}>{n}</span>
                <span style={{ fontSize:9, color:"var(--text-faint)", display:"block", paddingLeft:16 }}>{s}</span>
              </div>
            ))}
            {userBooks.map(book => {
              const pct = book.totalPages > 0 ? Math.round(book.readPages / book.totalPages * 100) : 0;
              const ppd = calcPagesPerDay(book);
              return (
                <div key={book.id} style={{ marginTop:8, paddingTop:8, borderTop:"1px solid var(--border-subtle)" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:4 }}>
                    <div style={{ fontSize:10, color:"var(--text-muted)", lineHeight:1.4, flex:1, minWidth:0 }}>
                      📖 <span style={{ color:"var(--text-secondary)" }}>{book.title}</span>
                    </div>
                    <button onClick={() => removeUserBook(book.id)}
                      style={{ background:"none", border:"none", cursor:"pointer", fontSize:10,
                        color:"var(--text-faint)", padding:0, flexShrink:0, lineHeight:1 }}>
                      ✕
                    </button>
                  </div>
                  <div style={{ fontSize:9, color:"var(--text-secondary)", marginTop:3, paddingLeft:16 }}>
                    стр {book.readPages} / {book.totalPages}
                    {ppd > 0 && <span style={{ color:"#818CF8", marginLeft:6 }}>~{ppd} стр/день</span>}
                  </div>
                  <div style={{ fontSize:9, color:"var(--text-faint)", paddingLeft:16, marginTop:1 }}>{book.readingType}</div>
                  <div style={{ height:2, background:"var(--border)", borderRadius:2, overflow:"hidden", marginTop:5 }}>
                    <div style={{ height:"100%", width:`${pct}%`, background:"#818CF8", borderRadius:2, transition:"width .4s" }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ marginTop:12, padding:10, background:"var(--bg-elevated)", borderRadius:8, border:"1px solid var(--border)" }}>
            <div style={{ fontSize:9, letterSpacing:3, color:"var(--text-faint)", marginBottom:8 }}>ПАРЫ</div>
            {[
              ["обязательно!","rgba(255,165,0,0.15)","#FFA500"],
              ["читать","rgba(74,222,128,0.12)","#4ADE80"],
              ["50/50 читать","rgba(253,224,71,0.12)","#FDE047"],
              ["работать на компе","rgba(34,211,238,0.12)","#22D3EE"],
              ["пропустить","rgba(255,107,107,0.12)","#FF6B6B"],
            ].map(([label,bg,color]) => (
              <div key={label} style={{ display:"inline-flex", alignItems:"center", marginRight:6, marginBottom:4 }}>
                <span style={{ fontSize:9, padding:"1px 5px", borderRadius:3, background:bg, color, whiteSpace:"nowrap" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── MAIN AREA ── */}
        <div style={{ flex:1, minWidth:0 }}>

          {/* ── TAB: BY DAYS ── */}
          {tab === "days" && (
            <div style={{ display:"grid", gap:8 }}>
              {DAYS.map(day => {
                const tasks = day.taskIds.map(id => TASK_MAP[id]).filter(Boolean);
                const dayUserTasks = userTasks.filter(t =>
                  (t.type === "day" && t.date === day.date) ||
                  (t.type === "deadline" && t.deadlineDate === day.date)
                );
                const daySessions = Object.entries(schedule).flatMap(([taskId, slots]) =>
                  slots.filter(s => s.date === day.date).map(s => ({ taskId, assignedHours: s.assignedHours }))
                );
                const doneTasks = tasks.filter(t => completed.has(t.id));
                const dayPct = tasks.length > 0 ? Math.round(doneTasks.length/tasks.length*100) : 0;
                const isToday = day.date === todayStr;
                const isPast  = day.date < todayStr;
                const isOpen  = expanded.has(day.date);
                const totalEstDay = tasks.reduce((s,t) => s+t.est, 0);
                const allDone = dayPct === 100 && tasks.length > 0;

                return (
                  <div key={day.date} className="day-card tr"
                    style={{
                      background: isToday ? "var(--bg-card)" : "var(--bg-surface)",
                      border:`1px solid ${isToday?"#2A2A6E": allDone?"rgba(74,222,128,0.2)":"#151528"}`,
                      borderRadius:10, overflow:"hidden", boxShadow:"var(--shadow-card)",
                      opacity: isPast && !allDone ? 0.75 : 1,
                    }}>

                    {/* ─ Day header ─ */}
                    <div onClick={() => toggleDay(day.date)}
                      style={{ padding:"10px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, userSelect:"none" }}>

                      {/* Calendar tile */}
                      <div style={{ width:38, height:38, borderRadius:7,
                        background: isToday?"#1C1C48": allDone?"rgba(74,222,128,0.1)":"#101020",
                        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <span style={{ fontSize:8, color:"var(--text-faint)", lineHeight:1 }}>{day.dow}</span>
                        <span style={{ fontSize:15, fontWeight:600,
                          color: isToday?"#9898FF": allDone?"#4ADE80":"#8888AA", lineHeight:1.2 }}>
                          {day.short}
                        </span>
                      </div>

                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap", gap:6, marginBottom:4 }}>
                          <span style={{ fontFamily:"'IBM Plex Sans'", fontWeight:500, fontSize:13,
                            color: isToday?"#C0C0FF": allDone?"#4ADE80":"var(--text-secondary)" }}>
                            {day.dow}, {day.short} {["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"][+day.date.split("-")[1]-1]}
                          </span>
                          <span style={{ fontSize:8, padding:"1px 5px", borderRadius:3, letterSpacing:1,
                            background: day.wn==="ЗН"?"rgba(34,211,238,0.1)":"rgba(192,132,252,0.1)",
                            color: day.wn==="ЗН"?"#22D3EE":"#C084FC" }}>
                            {day.wn}
                          </span>
                          {isToday && <span style={{ fontSize:8, padding:"1px 6px", borderRadius:3, background:"rgba(74,222,128,0.15)", color:"#4ADE80", letterSpacing:1 }}>СЕГОДНЯ</span>}
                          {allDone && <span style={{ fontSize:8, padding:"1px 6px", borderRadius:3, background:"rgba(74,222,128,0.1)", color:"#4ADE80" }}>✓ ГОТОВО</span>}
                          {day.uni.length > 0 && <span style={{ fontSize:9, color:"var(--text-faint)" }}>🎓 {day.uni.length} пар.</span>}
                          <span style={{ fontSize:9, color:"var(--text-faint)" }}>~{totalEstDay}ч задач</span>
                          <span style={{ fontSize:8, padding:"1px 6px", borderRadius:3,
                            background:"rgba(34,211,238,0.08)", color:"#22D3EE",
                            letterSpacing:0.5, whiteSpace:"nowrap" }}>
                            ⏱ {day.freeH}ч свободно
                          </span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ flex:1, height:2.5, background:"var(--border)", borderRadius:2, overflow:"hidden" }}>
                            <div style={{ height:"100%", width:`${dayPct}%`, borderRadius:2,
                              background: allDone?"#4ADE80":"#4A4AAA", transition:"width .4s" }} />
                          </div>
                          <span style={{ fontSize:9, color:"var(--text-faint)", flexShrink:0 }}>{doneTasks.length}/{tasks.length}</span>
                        </div>
                      </div>

                      <span style={{ color:"var(--text-ghost)", fontSize:10, transition:"transform .2s",
                        transform: isOpen?"rotate(180deg)":"none", display:"inline-block" }}>▼</span>
                    </div>

                    {/* ─ Expanded ─ */}
                    {isOpen && (
                      <div style={{ borderTop:"1px solid var(--border-subtle)" }}>

                        {/* Tip */}
                        <div style={{ padding:"8px 14px", background:"var(--bg-base)", fontSize:11, color:"var(--text-muted)", lineHeight:1.6, borderBottom:"1px solid var(--border-subtle)" }}>
                          💡 {day.tip}
                        </div>

                        {/* Uni */}
                        {day.uni.length > 0 && (
                          <div style={{ padding:"8px 14px", borderBottom:"1px solid var(--border-subtle)" }}>
                            <div style={{ fontSize:8, letterSpacing:3, color:"var(--text-ghost)", marginBottom:6 }}>РАСПИСАНИЕ</div>
                            <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 12px" }}>
                              {day.uni.map((cls,i) => {
                                const bs = badgeStyle(cls.badge, theme);
                                return (
                                  <div key={i} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10 }}>
                                    <span style={{ color:"var(--text-faint)" }}>{cls.time}</span>
                                    <span style={{ color:"var(--text-muted)" }}>{cls.name}</span>
                                    <span style={{ fontSize:9, padding:"1px 5px", borderRadius:3,
                                      background:bs.bg, color:bs.color }}>{cls.badge}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Overdue rollover — only on today's card */}
                        {isToday && (() => {
                          const overdue = DAYS
                            .filter(d => d.date < todayStr)
                            .flatMap(d => (d.taskIds || [])
                              .filter(tid => !completed.has(tid))
                              .map(tid => ({ task: TASKS.find(t => t.id === tid), fromDate: d.date }))
                            )
                            .filter(x => x.task);
                          if (!overdue.length) return null;
                          return (
                            <div style={{ padding:"8px 14px", borderBottom:"1px solid var(--border-subtle)",
                              background:"rgba(255,107,107,0.04)" }}>
                              <div style={{ fontSize:8, letterSpacing:3, color:"#FF6B6B", marginBottom:8, opacity:0.8 }}>
                                ⏰ ПЕРЕНЕСЕНО С ПРЕДЫДУЩИХ ДНЕЙ ({overdue.length})
                              </div>
                              {overdue.map(({ task, fromDate }) => {
                                const cat = CAT[task.cat];
                                const done = completed.has(task.id);
                                const dayLabel = new Date(fromDate + "T00:00:00").toLocaleDateString("ru-RU", { day:"numeric", month:"short" });
                                return (
                                  <div key={task.id + fromDate} className="task-row tr"
                                    style={{ display:"flex", alignItems:"flex-start", gap:9, padding:"5px 7px",
                                      borderRadius:6, cursor:"pointer", opacity: done ? 0.5 : 1 }}
                                    onClick={e => handleToggle(e, task.id)}>
                                    <div className={`cbx${done?" on":""}`}
                                      style={{ marginTop:2, background: done ? cat.color : "transparent" }}>
                                      {done && <span style={{ fontSize:9, color:"#000", fontWeight:700 }}>✓</span>}
                                    </div>
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:12, color: done?"var(--text-faint)":"var(--text-primary)",
                                        textDecoration: done?"line-through":"none", lineHeight:1.4 }}>
                                        <span style={{ display:"inline-block", width:6, height:6, borderRadius:"50%",
                                          background:cat.color, marginRight:6, verticalAlign:"middle", opacity: done?0.4:1 }} />
                                        {task.title}
                                      </div>
                                      <div style={{ display:"flex", gap:8, marginTop:2 }}>
                                        <span style={{ fontSize:9, color:"#FF6B6B", opacity:0.7 }}>с {dayLabel}</span>
                                        <span style={{ fontSize:9, color:"var(--text-faint)" }}>~{task.est}ч</span>
                                        <span style={{ fontSize:9, color:"var(--text-ghost)" }}>{cat.emoji} {cat.label}</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}

                        {/* Tasks */}
                        <div style={{ padding:"8px 14px 12px" }}>
                          <div style={{ fontSize:8, letterSpacing:3, color:"var(--text-ghost)", marginBottom:8 }}>ЗАДАЧИ НА ДЕНЬ</div>
                          {tasks.map(task => {
                            const cat = CAT[task.cat];
                            const done = completed.has(task.id);
                            const dayIds = tasks.map(t => t.id);
                            return (
                              <div key={task.id} className="task-row tr"
                                style={{ display:"flex", alignItems:"flex-start", gap:9, padding:"5px 7px",
                                  borderRadius:6, cursor:"pointer" }}
                                onClick={e => handleToggle(e, task.id, dayIds)}>
                                <div className={`cbx${done?" on":""}`}
                                  style={{ marginTop:2, background: done?cat.color:"transparent" }}>
                                  {done && <span style={{ fontSize:9, color:"#000", fontWeight:700 }}>✓</span>}
                                </div>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontSize:12, color: done?"var(--text-faint)":"var(--text-primary)",
                                    textDecoration: done?"line-through":"none", lineHeight:1.4 }}>
                                    <span style={{ display:"inline-block", width:6, height:6, borderRadius:"50%",
                                      background:cat.color, marginRight:6, verticalAlign:"middle",
                                      flexShrink:0, opacity: done?0.4:1 }} />
                                    {task.title}
                                  </div>
                                  <div style={{ display:"flex", gap:8, marginTop:2 }}>
                                    <span style={{ fontSize:9, color:"var(--text-faint)" }}>~{task.est}ч</span>
                                    <span style={{ fontSize:9, color:"var(--text-ghost)" }}>{cat.emoji} {cat.label}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {dayUserTasks.map(task => (
                            <div key={task.id} className="task-row tr"
                              style={{ display:"flex", alignItems:"flex-start", gap:9, padding:"5px 7px", borderRadius:6 }}>
                              <span style={{ fontSize:13, marginTop:1, flexShrink:0 }}>👤</span>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:12, color:"var(--text-primary)", lineHeight:1.4 }}>
                                  {task.type === "deadline" && <span style={{ marginRight:5 }}>⚠️</span>}
                                  {task.title}
                                </div>
                                <div style={{ display:"flex", gap:8, marginTop:2 }}>
                                  {task.est > 0 && <span style={{ fontSize:9, color:"var(--text-faint)" }}>~{task.est}ч</span>}
                                  {task.type === "deadline" && <span style={{ fontSize:9, color:"#FFD93D" }}>дедлайн</span>}
                                </div>
                              </div>
                              <button onClick={() => removeUserTask(task.id)}
                                style={{ background:"none", border:"none", cursor:"pointer", fontSize:13,
                                  color:"var(--text-faint)", padding:"2px 4px", flexShrink:0, lineHeight:1 }}
                                title="Удалить">
                                🗑️
                              </button>
                            </div>
                          ))}
                          {daySessions.length > 0 && (
                            <div style={{ marginTop:8, paddingTop:8, borderTop:"1px solid var(--bg-card)" }}>
                              <div style={{ fontSize:8, letterSpacing:3, color:"var(--text-ghost)", marginBottom:6 }}>⏱ ЗАПЛАНИРОВАНО АВТОМАТИЧЕСКИ</div>
                              {daySessions.map(({ taskId, assignedHours }) => {
                                const ut = userTasks.find(t => t.id === taskId);
                                const sessionKey = `${taskId}::${day.date}`;
                                const sessDone = completedSessions.has(sessionKey);
                                return (
                                  <div key={taskId}
                                    style={{ display:"flex", alignItems:"center", gap:9, padding:"4px 7px",
                                      borderRadius:6, cursor:"pointer", opacity: sessDone ? 0.5 : 1 }}
                                    onClick={() => toggleSession(taskId, day.date)}>
                                    <div className={`cbx${sessDone?" on":""}`}
                                      style={{ background: sessDone?"#818CF8":"transparent", flexShrink:0 }}>
                                      {sessDone && <span style={{ fontSize:9, color:"#000", fontWeight:700 }}>✓</span>}
                                    </div>
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:12, color: sessDone?"var(--text-faint)":"var(--text-secondary)",
                                        textDecoration: sessDone?"line-through":"none", lineHeight:1.4 }}>
                                        {ut?.title ?? taskId}
                                      </div>
                                      <span style={{ fontSize:9, color:"var(--text-faint)" }}>{assignedHours}ч</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── TAB: ALL TASKS ── */}
          {tab === "all" && (
            <div>
              {Object.keys(CAT).map(c => {
                const cat = CAT[c];
                const tasks = TASKS.filter(t => t.cat === c);
                const done = tasks.filter(t => completed.has(t.id)).length;
                const p = Math.round(done/tasks.length*100);
                return (
                  <div key={c} style={{ marginBottom:16 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8, paddingBottom:6, borderBottom:"1px solid var(--border-subtle)" }}>
                      <span style={{ fontSize:15 }}>{cat.emoji}</span>
                      <span style={{ fontFamily:"'IBM Plex Sans'", fontWeight:600, fontSize:13, color:cat.color }}>{cat.label}</span>
                      <div style={{ flex:1, height:2, background:"var(--border)", borderRadius:2, overflow:"hidden", maxWidth:120 }}>
                        <div className="pf" style={{ height:"100%", width:`${p}%`, background:cat.color, borderRadius:2 }} />
                      </div>
                      <span style={{ fontSize:9, color:"var(--text-faint)" }}>{done}/{tasks.length}</span>
                    </div>
                    {tasks.map(task => {
                      if (task.id === "sp5_tbd") return (
                        <div key={task.id} style={{ display:"flex", alignItems:"center", gap:9, padding:"5px 8px", marginBottom:2 }}>
                          <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, background:"rgba(148,163,184,0.1)", color:"var(--text-secondary)", flexShrink:0 }}>скоро</span>
                          <span style={{ fontSize:12, color:"var(--text-faint)" }}>{task.title}</span>
                        </div>
                      );
                      const done = completed.has(task.id);
                      return (
                        <div key={task.id} className="task-row tr"
                          style={{ display:"flex", alignItems:"flex-start", gap:9, padding:"5px 8px",
                            borderRadius:6, cursor:"pointer", marginBottom:2 }}
                          onClick={e => handleToggle(e, task.id)}>
                          <div className={`cbx${done?" on":""}`}
                            style={{ marginTop:2, background: done?cat.color:"transparent" }}>
                            {done && <span style={{ fontSize:9, color:"#000", fontWeight:700 }}>✓</span>}
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:12, color: done?"var(--text-faint)":"var(--text-primary)",
                              textDecoration: done?"line-through":"none" }}>
                              {task.title}
                            </div>
                            <span style={{ fontSize:9, color:"var(--text-faint)" }}>~{task.est}ч</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Запланированные пользовательские задачи */}
              {userTasks.filter(t => schedule[t.id]).length > 0 && (
                <div style={{ marginTop:8 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8, paddingBottom:6, borderBottom:"1px solid var(--border-subtle)" }}>
                    <span style={{ fontSize:15 }}>⏱</span>
                    <span style={{ fontFamily:"'IBM Plex Sans'", fontWeight:600, fontSize:13, color:"#818CF8" }}>Запланированные задачи</span>
                  </div>
                  {userTasks.filter(t => schedule[t.id]).map(task => {
                    const slots = schedule[task.id] || [];
                    const doneH = slots.reduce((sum, s) =>
                      completedSessions.has(`${task.id}::${s.date}`) ? sum + s.assignedHours : sum, 0);
                    const pct = task.totalHours > 0 ? Math.round(doneH / task.totalHours * 100) : 0;
                    return (
                      <div key={task.id} style={{ padding:"5px 8px", marginBottom:4, borderRadius:6 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                          <span style={{ fontSize:12, color:"var(--text-primary)" }}>{task.emoji} {task.title}</span>
                          <span style={{ fontSize:9, color:"var(--text-faint)" }}>{Math.round(doneH*10)/10}/{task.totalHours}ч</span>
                        </div>
                        <div style={{ height:2.5, background:"var(--border)", borderRadius:2, overflow:"hidden" }}>
                          <div className="pf" style={{ height:"100%", width:`${pct}%`, background:"#818CF8", borderRadius:2 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "achievements" && (() => {
            const LEVEL_EMOJI  = { junior:"🌱", middle:"⚡", senior:"🔥", techlead:"🚀", staff:"💎", principal:"👑" };
            const LEVEL_COLOR  = { junior:"#4ADE80", middle:"#22D3EE", senior:"#818CF8", techlead:"#F9A8D4", staff:"#FFD93D", principal:"#FF6B6B" };
            const LEVEL_IDS    = ["junior","middle","senior","techlead","staff","principal"];
            const ACH_COLOR    = { sql_master:"#FFD93D", kafka_producer:"#FF8C42", container_queen:"#22D3EE", architect:"#F9A8D4", streak_7:"#FF6B6B", bookworm:"#4ADE80", sprint_slayer:"#818CF8" };
            const currIdx      = LEVEL_IDS.indexOf(level.id);
            const fromColor    = LEVEL_COLOR[level.id];
            const toColor      = LEVEL_COLOR[LEVEL_IDS[currIdx + 1]] ?? fromColor;
            const totalDoneH   = TASKS.filter(t => completed.has(t.id)).reduce((s, t) => s + t.est, 0);

            return (
              <div style={{ padding:"4px 0 24px" }}>

                {/* — Уровень и прогресс — */}
                <div style={{ fontSize:9, letterSpacing:3, color:"var(--text-faint)", marginBottom:10 }}>УРОВЕНЬ И ПРОГРЕСС</div>
                <div style={{ background:"var(--bg-card)", border:"1px solid var(--border)", borderRadius:12,
                  padding:"24px 28px", marginBottom:16, textAlign:"center", boxShadow:"var(--shadow-card)" }}>
                  <div style={{ fontSize:52, lineHeight:1, marginBottom:8 }}>{LEVEL_EMOJI[level.id]}</div>
                  <div style={{ fontFamily:"'IBM Plex Sans'", fontWeight:700, fontSize:22, color:fromColor, marginBottom:4 }}>{level.label}</div>
                  <div style={{ fontSize:13, color:"var(--text-muted)", marginBottom:16 }}>{xp} XP</div>
                  <div style={{ width:"100%", height:10, background:"var(--border)", borderRadius:5, overflow:"hidden", marginBottom:6 }}>
                    <div className="xpf" style={{ height:"100%", width:`${xpPct}%`,
                      background:`linear-gradient(90deg,${fromColor},${toColor})`, borderRadius:5 }} />
                  </div>
                  {nextLevel
                    ? <div style={{ fontSize:11, color:"var(--text-muted)" }}>До {nextLevel.label}: {xpToNext} XP</div>
                    : <div style={{ fontSize:11, color:fromColor }}>Максимальный уровень 👑</div>
                  }
                </div>

                {/* — Статистика — */}
                <div style={{ display:"flex", gap:10, marginBottom:24 }}>
                  {[
                    ["🔥", streak, "дней подряд"],
                    ["✅", TASKS.filter(t => completed.has(t.id)).length, "задач выполнено"],
                    ["⏱", Math.round(totalDoneH * 10) / 10 + "ч", "изучено"],
                  ].map(([icon, val, label]) => (
                    <div key={label} style={{ flex:1, background:"var(--bg-card)", border:"1px solid var(--border)",
                      borderRadius:10, padding:"14px 10px", textAlign:"center", boxShadow:"var(--shadow-card)" }}>
                      <div style={{ fontSize:20, marginBottom:4 }}>{icon}</div>
                      <div style={{ fontFamily:"'IBM Plex Sans'", fontWeight:700, fontSize:18, color:"var(--text-primary)" }}>{val}</div>
                      <div style={{ fontSize:10, color:"var(--text-muted)", marginTop:2 }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* — Достижения — */}
                <div style={{ fontSize:9, letterSpacing:3, color:"var(--text-faint)", marginBottom:10 }}>ДОСТИЖЕНИЯ</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>
                  {ACHIEVEMENTS.map(ach => {
                    const unlocked = unlockedAchievements.find(a => a.id === ach.id);
                    const color = ACH_COLOR[ach.id] ?? "#818CF8";
                    const dateStr = unlocked ? new Date(unlocked.unlockedAt).toLocaleDateString("ru-RU", { day:"numeric", month:"long" }) : null;
                    return (
                      <div key={ach.id}
                        title={unlocked ? `Получено: ${dateStr}` : ach.desc}
                        style={{
                          background: unlocked ? `rgba(${color.slice(1).match(/../g).map(h=>parseInt(h,16)).join(",")},0.1)` : "var(--bg-card)",
                          border:`1px solid ${unlocked ? color : "var(--border)"}`,
                          borderRadius:10, padding:"16px 14px",
                          opacity: unlocked ? 1 : 0.4,
                          filter: unlocked ? "none" : "grayscale(1)",
                          transition:"opacity .2s,filter .2s",
                          cursor:"default", boxShadow:"var(--shadow-card)",
                        }}>
                        <div style={{ fontSize:28, marginBottom:6, lineHeight:1 }}>{ach.emoji}</div>
                        <div style={{ fontFamily:"'IBM Plex Sans'", fontWeight:700, fontSize:12,
                          color: unlocked ? "var(--text-primary)" : "var(--text-muted)", marginBottom:3 }}>
                          {ach.label}
                        </div>
                        <div style={{ fontSize:10, color:"var(--text-muted)", lineHeight:1.4 }}>
                          {unlocked ? ach.desc : "?"}
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>
            );
          })()}
        </div>
      </div>

      <AddTaskModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={addUserTask}
        categories={CAT}
      />
      <AddBookModal
        isOpen={bookModalOpen}
        onClose={() => setBookModalOpen(false)}
        onSave={addUserBook}
      />
      <BulkScheduleModal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onConfirm={handleBulkConfirm}
        items={bulkItems}
      />
      {toast && (
        <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)",
          background:"var(--bg-elevated)", border:"1px solid var(--text-ghost)", borderRadius:8,
          padding:"10px 20px", fontSize:12, color:"var(--text-secondary)", zIndex:2000,
          fontFamily:"'IBM Plex Mono','Fira Code',monospace", whiteSpace:"nowrap" }}>
          {toast}
        </div>
      )}

      {achievementPopup && (
        <div style={{
          position:"fixed", bottom:24, right:24, width:280, minHeight:90,
          background:"var(--bg-elevated)", border:"1px solid var(--border)",
          borderRadius:12, padding:16, zIndex:4000,
          boxShadow:"0 8px 32px rgba(0,0,0,0.3)",
          animation:"slideIn 0.3s ease-out, slideOut 0.3s ease-in 3.7s forwards",
          fontFamily:"'IBM Plex Mono','Fira Code',monospace", overflow:"hidden",
        }}>
          <div style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
            <span style={{ fontSize:32, lineHeight:1, flexShrink:0 }}>{achievementPopup.emoji}</span>
            <div>
              <div style={{ fontSize:9, letterSpacing:2, color:"var(--text-muted)", marginBottom:3 }}>ДОСТИЖЕНИЕ РАЗБЛОКИРОВАНО!</div>
              <div style={{ fontSize:13, fontWeight:700, color:"var(--text-primary)", lineHeight:1.3 }}>{achievementPopup.label}</div>
              <div style={{ fontSize:10, color:"var(--text-secondary)", marginTop:3, lineHeight:1.4 }}>{achievementPopup.desc}</div>
            </div>
          </div>
          <div style={{ position:"absolute", bottom:0, left:0, height:3, background:"var(--border)", width:"100%" }}>
            <div style={{ height:"100%", background:"#4ADE80", borderRadius:"0 0 0 12px",
              animation:"shrink 4s linear forwards" }} />
          </div>
        </div>
      )}

      {xpPopups.map(p => (
        <div key={p.id} style={{
          position:"fixed", left:p.x, top:p.y, transform:"translateX(-50%)",
          fontSize:13, fontWeight:700, color: p.bonus ? "#FFD93D" : "#4ADE80",
          pointerEvents:"none", zIndex:3000, whiteSpace:"nowrap",
          animation:"floatUp 0.9s ease-out forwards",
          fontFamily:"'IBM Plex Mono','Fira Code',monospace",
        }}>
          +{p.amount} XP{p.bonus ? " 🎉" : ""}
        </div>
      ))}
    </div>
  );
}
