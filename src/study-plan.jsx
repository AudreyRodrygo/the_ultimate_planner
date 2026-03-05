import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";

const AnalyticsCharts     = lazy(() => import('./analytics-charts').then(m => ({ default: m.AnalyticsCharts })));
const ReadingProgressPanel = lazy(() => import('./analytics-charts').then(m => ({ default: m.ReadingProgressPanel })));
const SummaryStats         = lazy(() => import('./analytics-charts').then(m => ({ default: m.SummaryStats })));

// ═══════════════════════════════════════════
//  DEBOUNCED STORAGE WRITES
// ═══════════════════════════════════════════
const _pendingTimers  = new Map(); // key → timerId
const _pendingValues  = new Map(); // key → { value, writeFn }
const _pendingListeners = new Set();

function _notifyListeners() {
  const n = _pendingTimers.size;
  _pendingListeners.forEach(fn => fn(n));
}

function debouncedWrite(key, value, writeFn, delay = 500) {
  if (_pendingTimers.has(key)) clearTimeout(_pendingTimers.get(key));
  _pendingValues.set(key, { value, writeFn });
  const id = setTimeout(() => {
    try { writeFn(value); } catch {}
    _pendingTimers.delete(key);
    _pendingValues.delete(key);
    _notifyListeners();
  }, delay);
  _pendingTimers.set(key, id);
  _notifyListeners();
}

function flushAllPending() {
  for (const [key, { value, writeFn }] of _pendingValues) {
    clearTimeout(_pendingTimers.get(key));
    try { writeFn(value); } catch {}
  }
  _pendingTimers.clear();
  _pendingValues.clear();
  _notifyListeners();
}
window.addEventListener("beforeunload", flushAllPending);

function useStoragePending() {
  const [count, setCount] = useState(_pendingTimers.size);
  useEffect(() => {
    _pendingListeners.add(setCount);
    return () => { _pendingListeners.delete(setCount); };
  }, []);
  return count > 0;
}

// ═══════════════════════════════════════════
//  SYNCED STORAGE HOOK
// ═══════════════════════════════════════════
const SYNC_KEYS = [
  "sp4_done_v3",
  "game_state_v1",
  "user_tasks_v1",
  "user_books_v1",
  "user_projects_v1",
  "user_settings_v1",
  "user_schedule_v1",
  "work_sessions_done_v1",
];

export function useSyncedStorage() {
  const [userId] = useState(() => {
    try {
      const existing = window.storage?.getItem?.("device_user_id");
      if (existing) return existing;
      const newId = "u_" + Date.now().toString(36);
      window.storage?.setItem?.("device_user_id", newId);
      return newId;
    } catch {
      return "u_" + Date.now().toString(36);
    }
  });

  const syncedGet = useCallback((key) => {
    try {
      // Prefer shared storage, fall back to local
      const sharedRaw = window.storage?.getItem?.(userId + "_" + key, true);
      if (sharedRaw != null) return sharedRaw;
    } catch {}
    try {
      return window.storage?.getItem?.(key) ?? null;
    } catch {
      return null;
    }
  }, [userId]);

  const syncedSet = useCallback((key, value) => {
    try {
      window.storage?.setItem?.(key, value);                          // local
    } catch {}
    try {
      window.storage?.setItem?.(userId + "_" + key, value, true);    // shared
    } catch {}
  }, [userId]);

  const syncFromShared = useCallback((targetUserId) => {
    let keysRestored = 0;
    const uid = targetUserId ?? userId;
    for (const key of SYNC_KEYS) {
      try {
        const value = window.storage?.getItem?.(uid + "_" + key, true);
        if (value != null) {
          window.storage?.setItem?.(key, value);
          keysRestored++;
        }
      } catch {}
    }
    return { synced: true, keysRestored };
  }, [userId]);

  return { userId, syncedGet, syncedSet, syncFromShared };
}

// ═══════════════════════════════════════════
//  USER TASKS HOOK
// ═══════════════════════════════════════════
export function useUserTasks({ syncedGet, syncedSet } = {}) {
  const _get = syncedGet ?? ((k) => { try { return window.storage?.getItem?.(k) ?? null; } catch { return null; } });
  const _set = syncedSet ?? ((k, v) => { try { window.storage?.setItem?.(k, v); } catch {} });

  const [userTasks, setUserTasks] = useState(() => {
    try { const raw = _get("user_tasks_v1"); if (raw) return JSON.parse(raw); } catch {}
    return [];
  });

  useEffect(() => {
    try { const raw = _get("user_tasks_v1"); if (raw) setUserTasks(JSON.parse(raw)); } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (tasks) => _set("user_tasks_v1", JSON.stringify(tasks));

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
export function useUserBooks({ syncedGet, syncedSet } = {}) {
  const _get = syncedGet ?? ((k) => { try { return window.storage?.getItem?.(k) ?? null; } catch { return null; } });
  const _set = syncedSet ?? ((k, v) => { try { window.storage?.setItem?.(k, v); } catch {} });

  const [userBooks, setUserBooks] = useState(() => {
    try { const raw = _get("user_books_v1"); if (raw) return JSON.parse(raw); } catch {}
    return [];
  });

  useEffect(() => {
    try { const raw = _get("user_books_v1"); if (raw) setUserBooks(JSON.parse(raw)); } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (books) => _set("user_books_v1", JSON.stringify(books));

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
//  USER SETTINGS HOOK
// ═══════════════════════════════════════════
const DEFAULT_SETTINGS = {
  wakeUpTime:        7,
  hasSportDays:      [1, 3, 5],
  sportDuration:     1.5,
  commuteBook:       "auto",
  defaultHeavyStart: 10,
};

export function useUserSettings({ syncedGet, syncedSet } = {}) {
  const _get = syncedGet ?? ((k) => { try { return window.storage?.getItem?.(k) ?? null; } catch { return null; } });
  const _set = syncedSet ?? ((k, v) => { try { window.storage?.setItem?.(k, v); } catch {} });

  const [settings, setSettings] = useState(() => {
    try {
      const raw = _get("user_settings_v1");
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch { return { ...DEFAULT_SETTINGS }; }
  });

  const updateSettings = useCallback((patch) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      _set("user_settings_v1", JSON.stringify(next));
      return next;
    });
  }, [_set]); // eslint-disable-line react-hooks/exhaustive-deps

  return { settings, updateSettings };
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
//  TIMELINE BUILDER
// ═══════════════════════════════════════════

/**
 * @typedef {Object} TimelineBlock
 * @property {string}  startTime  — "07:00"
 * @property {string}  endTime    — "08:30"
 * @property {"wake"|"sport"|"home_work"|"commute"|"class"|"break"|"free"} type
 * @property {string}  label
 * @property {string}  [sublabel]
 * @property {number}  [opacity]
 * @property {string}  [color]
 * @property {string}  [taskId]
 * @property {boolean} [isLight]
 */

/** Convert decimal hours to "HH:MM" */
const _fmtTime = (totalMinutes) => {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/** Parse "HH:MM" to minutes-from-midnight */
const _parseTime = (str) => {
  const [h, m] = str.split(":").map(Number);
  return h * 60 + (m || 0);
};

/**
 * Build a ordered array of TimelineBlock for a given day.
 *
 * @param {object} day        — entry from DAYS[]
 * @param {object} options
 * @param {number}   options.wakeUpTime  — wake hour (e.g. 7)
 * @param {boolean}  options.hasSport
 * @param {object[]} options.books       — userBooks array
 * @param {object[]} options.tasks       — all Task objects for this day (study + work)
 * @param {number}   options.bookIndex   — which book is up for commute reading
 * @returns {TimelineBlock[]}
 */
export function buildDayTimeline(day, options) {
  const {
    wakeUpTime = 7,
    hasSport = false,
    books = [],
    tasks = [],
    bookIndex = 0,
  } = options;

  /** @type {TimelineBlock[]} */
  const blocks = [];
  let cursor = wakeUpTime * 60; // minutes from midnight

  const push = (durationMin, block) => {
    const start = cursor;
    const end   = cursor + durationMin;
    blocks.push({ startTime: _fmtTime(start), endTime: _fmtTime(end), ...block });
    cursor = end;
  };

  // ── 1. Wake up ──────────────────────────────────────────────────────────
  push(30, { type: "wake", label: "Подъём / утренние дела" });

  // ── 2. Sport (optional) ─────────────────────────────────────────────────
  if (hasSport) {
    push(90, { type: "home_work", label: "Спорт", color: "#4ADE80" });
  }

  const hasUni = day.uni && day.uni.length > 0;

  // Mutable task queue — consume as we schedule
  const taskQueue = [...tasks];
  const popTask = () => taskQueue.shift() ?? null;
  const peekLightTask = () => taskQueue.find(t => !t.taskType || t.taskType === "light") ?? taskQueue[0] ?? null;

  // Book for commute
  const commuteBook = books.length > 0 ? books[bookIndex % books.length] : null;

  // ── 3. No-uni day ────────────────────────────────────────────────────────
  if (!hasUni) {
    while (taskQueue.length > 0 && cursor < 23 * 60) {
      const task = popTask();
      const dur  = Math.round((task.est ?? 1.5) * 60);
      push(dur, {
        type:    "home_work",
        label:   task.title,
        color:   task.color,
        taskId:  task.id,
      });
    }
  } else {
    // ── 4. Day with uni classes ─────────────────────────────────────────
    const firstClassStart = _parseTime(day.uni[0].time.split("-")[0]);
    const leaveForUni     = firstClassStart - 60; // 1h before first class

    // ── 4a. Morning home_work before leaving ─────────────────────────────
    const morningFree = leaveForUni - cursor;
    if (morningFree >= 30 && taskQueue.length > 0) {
      const task = popTask();
      // Use available time up to full task estimate
      const dur = Math.min(morningFree, Math.round((task.est ?? 1.5) * 60));
      push(dur, {
        type:   "home_work",
        label:  task.title,
        color:  task.color,
        taskId: task.id,
      });
    }

    // Advance to departure if we finished early
    if (cursor < leaveForUni) cursor = leaveForUni;

    // ── 4b. Commute to uni ───────────────────────────────────────────────
    push(60, {
      type:     "commute",
      label:    "Дорога в универ",
      sublabel: commuteBook ? commuteBook.title : undefined,
      opacity:  0.6,
      isLight:  true,
    });

    // ── 4c. Classes + breaks ─────────────────────────────────────────────
    let lastEndMin = cursor;

    for (let i = 0; i < day.uni.length; i++) {
      const cls        = day.uni[i];
      const clsStart   = _parseTime(cls.time.split("-")[0]);
      const clsEnd     = _parseTime(cls.time.split("-")[1]);
      const clsDurMin  = clsEnd - clsStart;

      // ── 4d. Break between classes ──────────────────────────────────────
      const gapMin = clsStart - lastEndMin;
      if (gapMin > 30) {
        cursor = lastEndMin;
        push(gapMin, { type: "break", label: "Перерыв между парами", opacity: 0.5 });
      }

      // ── 4c. Class block ────────────────────────────────────────────────
      cursor = clsStart;
      const isReadable = cls.badge && (
        cls.badge.includes("читать") || cls.badge.includes("делать дела")
      );
      const lightTask = isReadable ? peekLightTask() : null;

      push(clsDurMin, {
        type:     "class",
        label:    cls.name,
        sublabel: lightTask ? lightTask.title : (cls.badge || undefined),
        color:    cls.badge?.includes("пропустить") ? "#FF6B6B"
                : cls.badge?.includes("обязательно") ? "#FFA500"
                : cls.badge?.includes("компе")       ? "#22D3EE"
                : cls.badge?.includes("читать")      ? "#4ADE80"
                : undefined,
        isLight:  isReadable || undefined,
        taskId:   lightTask?.id ?? undefined,
      });

      lastEndMin = clsEnd;
    }

    // ── 4e. Commute home ─────────────────────────────────────────────────
    cursor = lastEndMin;
    push(60, {
      type:     "commute",
      label:    "Дорога домой",
      sublabel: commuteBook ? commuteBook.title : undefined,
      opacity:  0.6,
      isLight:  true,
    });

    // ── 4f. Evening home_work with remaining tasks ───────────────────────
    while (taskQueue.length > 0 && cursor < 23 * 60) {
      const task = popTask();
      const dur  = Math.min(
        Math.round((task.est ?? 1.5) * 60),
        23 * 60 - cursor,
      );
      if (dur <= 0) break;
      push(dur, {
        type:   "home_work",
        label:  task.title,
        color:  task.color,
        taskId: task.id,
      });
    }
  }

  // ── 5. Evening / rest ────────────────────────────────────────────────────
  if (cursor < 23 * 60) {
    push(23 * 60 - cursor, {
      type:    "free",
      label:   "Вечер / отдых",
      opacity: 0.4,
    });
  }

  return blocks;
}

// ═══════════════════════════════════════════
//  PROJECTS HOOK
// ═══════════════════════════════════════════
export function useProjects({ syncedGet, syncedSet } = {}) {
  const _get = syncedGet ?? ((k) => { try { return window.storage?.getItem?.(k) ?? null; } catch { return null; } });
  const _set = syncedSet ?? ((k, v) => { try { window.storage?.setItem?.(k, v); } catch {} });

  const [projects, setProjects] = useState(() => {
    try { const raw = _get("user_projects_v1"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });

  useEffect(() => {
    try { const raw = _get("user_projects_v1"); if (raw) setProjects(JSON.parse(raw)); } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (list) => _set("user_projects_v1", JSON.stringify(list));

  const _computeTotalHours = (project) => {
    if (project.totalHoursGoal != null) return project.totalHoursGoal;
    if (!project.deadline) return null;
    const weeks = Math.max(1, Math.ceil(
      (new Date(project.deadline) - new Date(project.startDate)) / (7 * 24 * 3600 * 1000)
    ));
    return project.weeklyHours * weeks;
  };

  const addProject = useCallback((project) => {
    const newProject = {
      id:              Date.now().toString(36),
      title:           project.title ?? "Проект",
      emoji:           project.emoji ?? "💼",
      color:           project.color ?? "#818CF8",
      weeklyHours:     project.weeklyHours ?? 10,
      taskType:        project.taskType ?? "heavy",
      deadline:        project.deadline ?? null,
      startDate:       project.startDate ?? new Date().toISOString().split("T")[0],
      status:          "active",
      completedAt:     null,
      totalHoursGoal:  project.totalHoursGoal ?? null,
    };
    newProject.totalHoursGoal = _computeTotalHours(newProject);
    setProjects(prev => {
      const next = [...prev, newProject];
      save(next);
      return next;
    });
  }, []);

  const completeProject = useCallback((id) => {
    setProjects(prev => {
      const next = prev.map(p => p.id === id
        ? { ...p, status: "done", completedAt: new Date().toISOString() }
        : p
      );
      save(next);
      return next;
    });
  }, []);

  const updateProject = useCallback((id, changes) => {
    setProjects(prev => {
      const next = prev.map(p => {
        if (p.id !== id) return p;
        const updated = { ...p, ...changes };
        updated.totalHoursGoal = _computeTotalHours(updated);
        return updated;
      });
      save(next);
      return next;
    });
  }, []);

  const deleteProject = useCallback((id) => {
    setProjects(prev => {
      const next = prev.filter(p => p.id !== id);
      save(next);
      return next;
    });
  }, []);

  const activeProjects = useMemo(
    () => projects.filter(p => p.status === "active"),
    [projects]
  );

  return { projects, activeProjects, addProject, completeProject, updateProject, deleteProject };
}

// ═══════════════════════════════════════════
//  RECURRING WORK
// ═══════════════════════════════════════════
export function useRecurringWork(userTasks = [], activeProjects = []) {
  const [overrides, setOverrides] = useState({});

  useEffect(() => {
    try {
      const raw = window.storage?.getItem?.("recurring_overrides_v1");
      if (raw) setOverrides(JSON.parse(raw));
    } catch {}
  }, []);

  // Возвращает ISO week key вида "2026-W10"
  const getWeekKey = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    const thu = new Date(d);
    thu.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3); // четверг той же недели (ISO)
    const jan4 = new Date(thu.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round((thu - jan4) / 604800000);
    return `${thu.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
  };

  const getWeekAllocation = useCallback((weekStartDate) => {
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStartDate + "T00:00:00");
      d.setDate(d.getDate() + i);
      return d.toISOString().split("T")[0];
    });

    const weekKey = getWeekKey(weekStartDate);
    const result = {}; // { [projectId]: { [date]: hours } }

    // Higher weeklyHours = higher priority
    const sorted = [...activeProjects].sort((a, b) => b.weeklyHours - a.weeklyHours);

    // Track hours already allocated per day across projects
    const dayAllocated = Object.fromEntries(weekDates.map(d => [d, 0]));

    for (const proj of sorted) {
      if (proj.startDate && weekDates[6] < proj.startDate) continue;
      if (proj.deadline  && weekDates[0] > proj.deadline)  continue;

      const targetHours = overrides[weekKey]?.[proj.id] ?? proj.weeklyHours;

      const dayAvail = weekDates.map((dateStr) => {
        const dayData = DAYS.find(d => d.date === dateStr);
        const slots   = dayData ? calcDaySlots(dayData) : null;
        const slotH   = slots
          ? (proj.taskType === "light" ? slots.totalLightH : slots.totalHeavyH)
          : 8;

        const taskBusyH = dayData
          ? dayData.taskIds.reduce((sum, id) => sum + (TASK_MAP[id]?.est ?? 0), 0)
          : 0;

        const userBusyH = userTasks
          .filter(t =>
            (t.type === "day"      && t.date         === dateStr) ||
            (t.type === "deadline" && t.deadlineDate  === dateStr)
          )
          .reduce((sum, t) => sum + (t.est ?? 0), 0);

        return Math.max(0, Math.round(
          (slotH - taskBusyH - userBusyH - dayAllocated[dateStr]) * 10
        ) / 10);
      });

      const totalAvail = dayAvail.reduce((s, h) => s + h, 0);

      const dateHours = {};
      for (let i = 0; i < weekDates.length; i++) {
        const avail = dayAvail[i];
        if (avail < 1) { dateHours[weekDates[i]] = 0; continue; }
        const proportional = totalAvail > 0 ? (avail / totalAvail) * targetHours : 0;
        const clamped  = Math.min(6, proportional);        // max 6h per project/day
        const rounded  = Math.round(clamped * 2) / 2;
        const hours    = rounded < 1 ? 0 : rounded;        // min 1h session
        dateHours[weekDates[i]] = hours;
        dayAllocated[weekDates[i]] += hours;
      }

      result[proj.id] = dateHours;
    }

    return result; // { [projectId]: { [date]: hours } }
  }, [overrides, userTasks, activeProjects]);

  const setWeekOverride = useCallback((weekKey, workId, hours) => {
    setOverrides(prev => {
      const next = {
        ...prev,
        [weekKey]: { ...(prev[weekKey] ?? {}), [workId]: hours },
      };
      try { window.storage?.setItem?.("recurring_overrides_v1", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return { recurringWork: activeProjects, getWeekAllocation, setWeekOverride };
}

// ═══════════════════════════════════════════
//  ANALYTICS HOOK
// ═══════════════════════════════════════════
export function useAnalytics(activeProjects = []) {
  // ── raw storage reads ───────────────────────────────────────────
  const [completed, setCompleted] = useState(() => {
    try {
      const raw = localStorage.getItem("sp4_done_v3");
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });

  const [completedWorkBlocks, setCompletedWorkBlocks] = useState(() => {
    try {
      const raw = window.storage?.getItem?.("work_sessions_done_v1");
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });

  const [overrides, setOverrides] = useState(() => {
    try {
      const raw = window.storage?.getItem?.("recurring_overrides_v1");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  const [analyticsBooks, setAnalyticsBooks] = useState(() => {
    try {
      const raw = window.storage?.getItem?.("user_books_v1");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem("sp4_done_v3");
      setCompleted(new Set(raw ? JSON.parse(raw) : []));
    } catch {}
    try {
      const raw = window.storage?.getItem?.("work_sessions_done_v1");
      setCompletedWorkBlocks(new Set(raw ? JSON.parse(raw) : []));
    } catch {}
    try {
      const raw = window.storage?.getItem?.("recurring_overrides_v1");
      if (raw) setOverrides(JSON.parse(raw));
    } catch {}
    try {
      const raw = window.storage?.getItem?.("user_books_v1");
      if (raw) setAnalyticsBooks(JSON.parse(raw));
    } catch {}
  }, []);

  // ── computed ─────────────────────────────────────────────────────
  return useMemo(() => {
    // helpers (inline to avoid module-level duplication)
    const getWeekKey = (dateStr) => {
      const d = new Date(dateStr + "T00:00:00");
      const thu = new Date(d);
      thu.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
      const jan4 = new Date(thu.getFullYear(), 0, 4);
      const weekNum = 1 + Math.round((thu - jan4) / 604800000);
      return `${thu.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
    };

    const getWeekStart = (dateStr) => {
      const d = new Date(dateStr + "T00:00:00");
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return d.toISOString().split("T")[0];
    };

    // Returns allocated work hours using the same proportional logic as getWeekAllocation
    // (sorted by weeklyHours desc, type-aware, inter-project deduction, min 1h, max 6h)
    const getWorkHoursForDate = (work, dateStr) => {
      const weekStart = getWeekStart(dateStr);
      const weekDates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart + "T00:00:00");
        d.setDate(d.getDate() + i);
        return d.toISOString().split("T")[0];
      });
      const weekKey   = getWeekKey(dateStr);
      const sorted    = [...activeProjects].sort((a, b) => b.weeklyHours - a.weeklyHours);
      const dayAllocated = Object.fromEntries(weekDates.map(d => [d, 0]));

      for (const proj of sorted) {
        if (proj.startDate && weekDates[6] < proj.startDate) continue;
        if (proj.deadline  && weekDates[0] > proj.deadline)  continue;

        const target = overrides[weekKey]?.[proj.id] ?? proj.weeklyHours;
        const dayAvail = weekDates.map(dt => {
          const dayData = DAYS.find(d => d.date === dt);
          const slots   = dayData ? calcDaySlots(dayData) : null;
          const slotH   = slots ? (proj.taskType === "light" ? slots.totalLightH : slots.totalHeavyH) : 8;
          const taskBusy = dayData
            ? dayData.taskIds.reduce((s, id) => s + (TASK_MAP[id]?.est ?? 0), 0)
            : 0;
          return Math.max(0, slotH - taskBusy - dayAllocated[dt]);
        });
        const totalAvail = dayAvail.reduce((s, h) => s + h, 0);
        const dateHours = {};
        for (let i = 0; i < weekDates.length; i++) {
          const avail = dayAvail[i];
          if (avail < 1) { dateHours[weekDates[i]] = 0; continue; }
          const p = totalAvail > 0 ? (avail / totalAvail) * target : 0;
          const h = Math.round(Math.min(6, p) * 2) / 2;
          dateHours[weekDates[i]] = h < 1 ? 0 : h;
          dayAllocated[weekDates[i]] += dateHours[weekDates[i]];
        }
        if (proj.id === work.id) return dateHours[dateStr] ?? 0;
      }
      return 0;
    };

    // ── weeklyProgress ──────────────────────────────────────────
    const weekMap = {};
    for (const day of DAYS) {
      const wk = getWeekKey(day.date);
      if (!weekMap[wk]) weekMap[wk] = [];
      weekMap[wk].push(day);
    }

    const weeklyProgress = Object.entries(weekMap).map(([week, days]) => {
      let learnedH = 0, targetLearnH = 0;
      for (const day of days) {
        for (const tid of day.taskIds) {
          const task = TASK_MAP[tid];
          if (!task) continue;
          targetLearnH += task.est ?? 0;
          if (completed.has(tid)) learnedH += task.est ?? 0;
        }
      }
      let workedH = 0, targetWorkH = 0;
      for (const work of activeProjects) {
        targetWorkH += work.weeklyHours;
        for (const day of days) {
          if (completedWorkBlocks.has(`${work.id}_${day.date}`)) {
            workedH += getWorkHoursForDate(work, day.date);
          }
        }
      }
      return {
        week,
        learnedH:     Math.round(learnedH     * 10) / 10,
        workedH:      Math.round(workedH       * 10) / 10,
        targetLearnH: Math.round(targetLearnH  * 10) / 10,
        targetWorkH,
      };
    }).sort((a, b) => a.week.localeCompare(b.week));

    // ── categoryProgress ────────────────────────────────────────
    const categoryProgress = Object.entries(CAT).map(([cat, info]) => {
      const catTasks = TASKS.filter(t => t.cat === cat);
      const doneTasks = catTasks.filter(t => completed.has(t.id));
      const totalH = catTasks.reduce((s, t) => s + (t.est ?? 0), 0);
      const doneH  = doneTasks.reduce((s, t) => s + (t.est ?? 0), 0);
      return {
        cat, label: info.label, color: info.color,
        total:  catTasks.length, done: doneTasks.length,
        totalH: Math.round(totalH * 10) / 10,
        doneH:  Math.round(doneH  * 10) / 10,
      };
    });

    // ── dailyActivity ───────────────────────────────────────────
    const dailyActivity = DAYS.map(day => {
      let hoursLearned = 0, tasksCompleted = 0;
      for (const tid of day.taskIds) {
        if (completed.has(tid)) {
          hoursLearned += TASK_MAP[tid]?.est ?? 0;
          tasksCompleted++;
        }
      }
      let hoursWorked = 0;
      for (const work of activeProjects) {
        if (completedWorkBlocks.has(`${work.id}_${day.date}`)) {
          hoursWorked += getWorkHoursForDate(work, day.date);
        }
      }
      return {
        date: day.date,
        hoursLearned:   Math.round(hoursLearned * 10) / 10,
        hoursWorked:    Math.round(hoursWorked  * 10) / 10,
        tasksCompleted,
      };
    });

    // ── readingProgress ─────────────────────────────────────────
    const readingProgress = analyticsBooks.map(book => {
      const pagesPerDay = calcPagesPerDay(book);
      const daysLeft = Math.ceil((new Date(book.deadline) - new Date()) / (1000 * 60 * 60 * 24));
      const remaining = book.totalPages - book.readPages;
      const onTrack = daysLeft > 0 ? remaining <= pagesPerDay * daysLeft : remaining === 0;
      return {
        bookId:     book.id,
        title:      book.title,
        totalPages: book.totalPages,
        readPages:  book.readPages,
        pagesPerDay,
        onTrack,
      };
    });

    // ── summary ─────────────────────────────────────────────────
    const totalHoursLearned = Math.round(dailyActivity.reduce((s, d) => s + d.hoursLearned, 0) * 10) / 10;
    const totalHoursWorked  = Math.round(dailyActivity.reduce((s, d) => s + d.hoursWorked,  0) * 10) / 10;

    const activeDays = dailyActivity.filter(d => d.hoursLearned + d.hoursWorked > 0);
    const avgDailyHours = activeDays.length > 0
      ? Math.round((totalHoursLearned + totalHoursWorked) / activeDays.length * 10) / 10
      : 0;

    const bestDay = dailyActivity.reduce((best, d) => {
      const h = d.hoursLearned + d.hoursWorked;
      return h > (best?.h ?? 0) ? { date: d.date, h } : best;
    }, null);
    const mostProductiveDay = bestDay
      ? (DAYS.find(d => d.date === bestDay.date)?.dow ?? bestDay.date)
      : null;

    const activeDayObjs = dailyActivity.filter(d => d.hoursLearned + d.hoursWorked > 0);
    const mostProductiveTime = activeDayObjs.length === 0 ? null
      : activeDayObjs.some(d => {
          const day = DAYS.find(x => x.date === d.date);
          return day && (!day.uni || day.uni.length === 0);
        }) ? "утро" : "вечер";

    const countableTasks = TASKS.filter(t => t.id !== "sp5_tbd");
    const completionRate = countableTasks.length > 0
      ? Math.round((countableTasks.filter(t => completed.has(t.id)).length / countableTasks.length) * 100)
      : 0;

    return {
      weeklyProgress,
      categoryProgress,
      dailyActivity,
      readingProgress,
      summary: {
        totalHoursLearned,
        totalHoursWorked,
        avgDailyHours,
        mostProductiveDay,
        mostProductiveTime,
        completionRate,
      },
    };
  }, [completed, completedWorkBlocks, overrides, analyticsBooks, activeProjects]);
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
  { id: "week_warrior",    label: "Week Warrior",    emoji: "⚔️", desc: "Выполнить недельную норму EventManager (35ч) за одну неделю" },
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
  debouncedWrite(GAME_KEY, state, v => localStorage.setItem(GAME_KEY, JSON.stringify(v)), 1000);
};

export function useGameState({ syncedGet, syncedSet } = {}) {
  const [gs, setGs] = useState(() => {
    // Try shared storage first (for cross-device restore), then local
    if (syncedGet) {
      try {
        const raw = syncedGet(GAME_KEY);
        if (raw) return { ...defaultGameState(), ...JSON.parse(raw), lastUnlocked: null };
      } catch {}
    }
    return loadGame();
  });

  // Dual-write helper: always local + optionally shared
  const _saveGame = (state) => {
    saveGame(state);
    try { syncedSet?.(GAME_KEY, JSON.stringify(state)); } catch {}
  };

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
      _saveGame(next);
      return next;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      _saveGame(next);
      return next;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const markDayComplete = useCallback((date) => {
    setGs(prev => {
      if (prev.completedDays.includes(date)) return prev;
      const next = { ...prev, xp: prev.xp + 50, completedDays: [...prev.completedDays, date] };
      _saveGame(next);
      return next;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const unlockAchievement = useCallback((id) => {
    setGs(prev => {
      if (prev.unlockedAchievements.some(a => a.id === id)) return prev;
      const entry = { id, unlockedAt: new Date().toISOString() };
      const next = { ...prev, unlockedAchievements: [...prev.unlockedAchievements, entry], lastUnlocked: id };
      _saveGame(next);
      return next;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      _saveGame(next);
      return next;
    });
  }, [unlockAchievement]); // eslint-disable-line react-hooks/exhaustive-deps

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
//  SCHEDULE GENERATOR  (replaces static DAYS)
// ═══════════════════════════════════════════
const ALL_MONTHS = ["2026-03","2026-04","2026-05"];

// Thu ЗН dates with Лаба ТКЭ (mandatory lab)
const LABA_DATES = new Set(["2026-03-19","2026-04-16","2026-04-30","2026-05-28"]);

// DOW abbreviations indexed by Date.getDay() (0=Sun)
const _DOW_RU = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];

// Base: week of 2026-03-02 (Mon) = ЗН (even = ЗН, odd = ЧС)
const _BASE_MON_MS = new Date("2026-03-02T00:00:00").getTime();

function _getWn(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const weekDiff = Math.round((d.getTime() - daysFromMon * 86400000 - _BASE_MON_MS) / (7 * 86400000));
  return weekDiff % 2 === 0 ? "ЗН" : "ЧС";
}

function _getDaySchedule(dateStr, dow, wn) {
  if (LABA_DATES.has(dateStr)) return {
    uni: [{time:"11:50-17:35", name:"Лаба ТКЭ Купин", badge:"обязательно!"}], freeH: 2,
  };
  switch (dow) {
    case "Пн": return {
      uni: [
        {time:"10:10-11:40", name:"МСЗИ (лекция) Филиппов", badge:"пропустить"},
        {time:"11:50-13:55", name:"Схемотехника (лекция) Данилюк", badge:"обязательно!"},
      ], freeH: wn === "ЧС" ? 5 : 8,
    };
    case "Вт": return wn === "ЧС" ? {
      uni: [
        {time:"11:50-13:55", name:"Участие специалиста (сем.) Вехов", badge:"читать"},
        {time:"14:05-15:35", name:"Схемотехника (сем.) Данилюк", badge:"обязательно!"},
        {time:"15:55-17:25", name:"МСЗИ (сем.) Филиппов", badge:"пропустить"},
        {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"иногда читать"},
      ], freeH: 4,
    } : {
      uni: [
        {time:"11:50-13:55", name:"Участие специалиста (сем.) Вехов", badge:"читать"},
        {time:"14:05-15:35", name:"Схемотехника (сем.) Данилюк", badge:"обязательно!"},
        {time:"15:55-17:25", name:"МСЗИ (сем.) Филиппов", badge:"пропустить"},
      ], freeH: 8,
    };
    case "Ср": return {
      uni: [
        {time:"17:35-19:05", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
        {time:"19:15-20:45", name:"Судебная КТКЭ (лекция) Яковлев", badge:"пропустить"},
      ], freeH: 4,
    };
    case "Чт": return { uni: [], freeH: 8 };
    case "Пт": return wn === "ЧС" ? {
      uni: [
        {time:"14:05-15:35", name:"Судебная КТКЭ (сем.) Филимонов", badge:"50/50 читать"},
        {time:"15:55-17:25", name:"Интернет технологии (лекция)", badge:"пропустить"},
        {time:"17:35-19:05", name:"Интернет технологии (сем.) Булах", badge:"обязательно!"},
        {time:"19:15-20:45", name:"ТКЭ (сем.) Купин", badge:"обязательно!"},
      ], freeH: 4,
    } : {
      uni: [
        {time:"14:05-15:35", name:"Участие специалиста (лекция) Вехов", badge:"читать"},
        {time:"15:55-17:25", name:"Интернет технологии (лекция)", badge:"пропустить"},
      ], freeH: 5,
    };
    case "Сб": return wn === "ЧС" ? {
      uni: [
        {time:"10:10-11:40", name:"ТКЭ (лекция) Купин", badge:"работать на компе"},
        {time:"11:50-13:55", name:"ТКЭ (лекция) Купин", badge:"работать на компе"},
      ], freeH: 5,
    } : {
      uni: [
        {time:"14:05-15:35", name:"Судебная КТКЭ (лаб.) Крюкова", badge:"обязательно!"},
        {time:"15:55-17:25", name:"Судебная КТКЭ (лаб.) Крюкова", badge:"обязательно!"},
      ], freeH: 5,
    };
    default: return { uni: [], freeH: 8 }; // Sun
  }
}

// Overrides for early March: custom taskIds, tips, and non-standard freeH
const _OVERRIDES = {
  "2026-03-04": { taskIds:["s3_1","s3_2"], freeH:7,
    tip:"Сегодня среда ЗН. Вечерние пары (17:35–20:45) — необязательны, пропустить. Полный день дома: спорт утром 2ч, потом Sprint 3 — Habr Go-статьи. Хороший старт!" },
  "2026-03-05": { taskIds:["sql_1","sql_3","sql_4"],
    tip:"Свободный четверг — лаба ТКЭ (ЗН) только 19.03. Спорт 2ч утром. Большой SQL-блок: база (2sql.ru) + транзакции + EXPLAIN. Вечером — книга или отдых." },
  "2026-03-06": { taskIds:["sql_5","sql_6","sql_2"],
    tip:"Утро дома 10–14ч: индексы + B-TREE + SQL Academy тренажёр. Дорога — книга Go Паттерны. Участие специалиста (14:05, Вехов) — обязательно, можно делать дела. Интернет-технологии (15:55) — пропустить, уходишь домой." },
  "2026-03-07": { taskIds:["kf_1","kf_2"], freeH:4,
    tip:"Утро дома 10–13ч: Kafka видео. Дорога + обе лабы Судебная КТКЭ (14:05–17:25, Крюкова) — обязательно, только пара. После ~18:30 домой — отдыхать." },
  "2026-03-08": { taskIds:["kf_3","kf_4","redis_1"], freeH:6,
    tip:"🌸 8 марта — праздник! Воскресенье, пар нет. Лёгкий день: Kafka статьи + Redis в своё удовольствие. Книга по настроению." },
  "2026-03-09": { taskIds:["test_1","test_2"],
    tip:"МСЗИ лекция (10:10) — пропустить. Схемотехника (11:50, Данилюк) — ОБЯЗАТЕЛЬНО, ничего не делать! Утром до вуза 9–11: интеграционные тесты. Вечером дома: моки." },
  "2026-03-10": { taskIds:["test_3","test_4","s3_3","s3_4"], freeH:3,
    tip:"Большой день в универе! Участие специалиста (11:50, Вехов) — читать. Схемотехника (14:05, Данилюк) — только пара. МСЗИ сем (15:55) — пропустить. Судебная КТКЭ (17:35, ЧС, Яковлев) — обязательно, иногда читать. Утром 9–11: unit tests." },
  "2026-03-11": { taskIds:["dock_1","dock_2","dock_3","dock_4"], freeH:8,
    tip:"Вечерние пары (17:35–20:45) — необязательны, ПРОПУСТИТЬ. Продуктивный день! Большой Docker + K8s + GitLab CI/CD блок." },
  "2026-03-12": { taskIds:["dock_5","dock_6","pg_1","pg_2","pg_3"], freeH:9,
    tip:"Свободный четверг — лаба ТКЭ (ЧС) только 23.04! Самый продуктивный день! Docker финал + GitLab pipeline статья + PostgreSQL шардирование (все три части)." },
  "2026-03-13": { taskIds:["pg_4","sd_1","sd_2","sd_3"], freeH:3,
    tip:"Большой вечер в универе. Утром 10–14ч: PostgreSQL + System Design. Судебная КТКЭ (14:05, ЧС, Филимонов) — 50/50 читать. Интернет-технологии (15:55) — пропустить. Инет-технологии сем (17:35, ЧС, Булах) — ОБЯЗАТЕЛЬНО. ТКЭ (19:15, ЧС, Купин) — ОБЯЗАТЕЛЬНО." },
  "2026-03-14": { taskIds:["sd_4","s3_5","k1"],
    tip:"ТКЭ лекции 10:10–13:55 (Купин — работать на ноуте). После 14:00 дома: System Design курс Балуна + HH.ru тесты по Go и SQL. Видео Кости вечером." },
  "2026-03-15": { taskIds:["pg_5","pg_6","k2","k3"], freeH:7, short:"15 🏁",
    tip:"🎉 ФИНАЛЬНЫЙ ДЕНЬ! Воскресенье, пар нет. Спорт утром. PostgreSQL индексы + MySQL vs PG под капотом + видео Кости #2 и #3. Финальный обзор всего пройденного. ФИНИШ!" },
};

function generateDays(yearMonth) {
  const [year, month] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const result = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const d = new Date(date + "T00:00:00");
    const dow = _DOW_RU[d.getDay()];
    const wn = _getWn(date);
    const { uni, freeH: baseFreeH } = _getDaySchedule(date, dow, wn);
    const ov = _OVERRIDES[date] ?? {};
    result.push({
      date, dow,
      short: ov.short ?? String(day),
      wn,
      taskIds: ov.taskIds ?? [],
      freeH: ov.freeH ?? baseFreeH,
      tip: ov.tip ?? "",
      uni,
    });
  }
  return result;
}

// Full range used by hooks that need all months
const DAYS = ALL_MONTHS.flatMap(m => generateDays(m));

// ═══════════════════════════════════════════
//  BADGE COLORS
// ═══════════════════════════════════════════
const badgeStyle = (badge, theme) => {
  if (theme === "light") {
    if (badge.includes("пропустить")) return { bg:"rgba(232,180,192,0.25)", color:"#A03050" };
    if (badge.includes("обязательно")) return { bg:"rgba(240,196,176,0.3)", color:"#B05830" };
    if (badge.includes("50/50") || badge.includes("иногда")) return { bg:"rgba(184,168,216,0.25)", color:"#6040A0" };
    if (badge.includes("компе")) return { bg:"rgba(168,200,232,0.3)", color:"#304E80" };
    return { bg:"rgba(168,216,204,0.3)", color:"#2A7A68" }; // читать
  }
  if (badge.includes("пропустить")) return { bg:"rgba(255,107,107,0.12)", color:"#FF6B6B" };
  if (badge.includes("обязательно")) return { bg:"rgba(255,165,0,0.15)", color:"#FFA500" };
  if (badge.includes("50/50") || badge.includes("иногда")) return { bg:"rgba(253,224,71,0.12)", color:"#FDE047" };
  if (badge.includes("компе")) return { bg:"rgba(34,211,238,0.12)", color:"#22D3EE" };
  return { bg:"rgba(74,222,128,0.12)", color:"#4ADE80" }; // читать
};

// ═══════════════════════════════════════════
//  ADD TASK MODAL
// ═══════════════════════════════════════════
const EMPTY_FORM = { title:"", cat:"sprint3", type:"day", date:"", deadlineDate:"", totalHours:"", est:"", url:"" };
const LIGHT_CATS = new Set(["sprint3", "go_extra", "sql", "kafka", "redis"]);
const HEAVY_CATS = new Set(["testing", "docker", "sysdesign", "sprint5"]);
const getAutoTaskType = (cat) => LIGHT_CATS.has(cat) ? "light" : HEAVY_CATS.has(cat) ? "heavy" : null;

const AddTaskModal = React.memo(function AddTaskModal({ isOpen, onClose, onSave, categories }) {
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
});

// ═══════════════════════════════════════════
//  ADD BOOK MODAL
// ═══════════════════════════════════════════
const EMPTY_BOOK_FORM = { title:"", totalPages:"", readPages:"0", deadline:"", readingType:"оба варианта", pagesPerHour:"30" };

const AddBookModal = React.memo(function AddBookModal({ isOpen, onClose, onSave }) {
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
});

// ═══════════════════════════════════════════
//  SCHEDULE PREVIEW MODAL
// ═══════════════════════════════════════════
const MONTHS_RU = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
const DAYS_RU   = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];

const SchedulePreviewModal = React.memo(function SchedulePreviewModal({ isOpen, onClose, onConfirm, schedule, task }) {
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
});

// ═══════════════════════════════════════════
//  ADD PROJECT MODAL
// ═══════════════════════════════════════════
const PROJECT_COLORS = ["#22D3EE","#4ADE80","#818CF8","#F9A8D4","#FFD93D","#FF8C42","#C084FC","#FF6B6B"];
const TODAY_STR = new Date().toISOString().split("T")[0];
const EMPTY_PROJECT_FORM = {
  title: "", emoji: "💻", color: "#22D3EE",
  weeklyHours: "35", taskType: "heavy",
  noDeadline: false, deadline: "",
  startDate: TODAY_STR,
};

const AddProjectModal = React.memo(function AddProjectModal({ isOpen, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY_PROJECT_FORM);

  if (!isOpen) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const wh    = Math.max(1, parseFloat(form.weeklyHours) || 0);
  const today = new Date();
  const deadlineDate = form.deadline ? new Date(form.deadline + "T00:00:00") : null;
  const weeksLeft = deadlineDate
    ? Math.max(1, Math.ceil((deadlineDate - today) / (7 * 24 * 3600 * 1000)))
    : null;
  const totalH   = weeksLeft ? Math.round(wh * weeksLeft) : null;
  const hoursDay = Math.round((wh / 7) * 10) / 10;
  const lowTime  = !form.noDeadline && weeksLeft && totalH < 40;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave({
      title:       form.title.trim(),
      emoji:       form.emoji || "💻",
      color:       form.color,
      weeklyHours: wh,
      taskType:    form.taskType,
      deadline:    form.noDeadline ? null : (form.deadline || null),
      startDate:   form.startDate || TODAY_STR,
      totalHoursGoal: totalH,
    });
    setForm(EMPTY_PROJECT_FORM);
    onClose();
  };

  const inp = {
    background:"var(--bg-surface)", border:"1px solid var(--border)", borderRadius:6,
    color:"var(--text-primary)", fontSize:12, padding:"6px 10px", width:"100%",
    fontFamily:"'IBM Plex Mono','Fira Code',monospace", outline:"none", boxSizing:"border-box",
  };
  const lbl = { fontSize:9, letterSpacing:2, color:"var(--text-faint)", display:"block", marginBottom:4, marginTop:12 };

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:1000,
      background:"rgba(7,7,15,0.85)", display:"flex",
      alignItems:"center", justifyContent:"center", padding:20,
    }} onClick={onClose}>
      <div style={{
        background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:12,
        padding:24, width:"100%", maxWidth:440, maxHeight:"90vh", overflowY:"auto",
        fontFamily:"'IBM Plex Mono','Fira Code',monospace",
        boxShadow:"var(--shadow-elevated)",
      }} onClick={e => e.stopPropagation()}>

        <div style={{ fontSize:9, letterSpacing:4, color:"var(--text-faint)", marginBottom:2 }}>НОВЫЙ ПРОЕКТ</div>
        <div style={{ fontFamily:"'IBM Plex Sans'", fontWeight:700, fontSize:16, color:"var(--text-primary)", marginBottom:16 }}>
          Создать проект
        </div>

        <form onSubmit={handleSubmit}>
          {/* Row: emoji + title */}
          <label style={lbl}>НАЗВАНИЕ *</label>
          <div style={{ display:"flex", gap:8 }}>
            <input style={{ ...inp, width:52, textAlign:"center", fontSize:18, padding:"4px 6px", flexShrink:0 }}
              value={form.emoji} maxLength={2}
              onChange={e => set("emoji", e.target.value)} />
            <input style={{ ...inp, flex:1 }}
              value={form.title} onChange={e => set("title", e.target.value)}
              placeholder="Название проекта" required />
          </div>

          {/* Color */}
          <label style={lbl}>ЦВЕТ</label>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {PROJECT_COLORS.map(c => (
              <div key={c} onClick={() => set("color", c)} style={{
                width:24, height:24, borderRadius:"50%", background:c, cursor:"pointer",
                outline: form.color === c ? `2px solid ${c}` : "none",
                outlineOffset:2, flexShrink:0,
              }} />
            ))}
          </div>

          {/* Hours per week */}
          <label style={lbl}>ЧАСОВ В НЕДЕЛЮ</label>
          <input type="number" min="1" max="80" step="0.5" style={inp}
            value={form.weeklyHours} onChange={e => set("weeklyHours", e.target.value)} />

          {/* Task type */}
          <label style={lbl}>ТИП РАБОТЫ</label>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {[["heavy","Требует компьютер 💻"],["light","Можно читать/думать 📖"]].map(([v,label]) => (
              <label key={v} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:12,
                color: form.taskType === v ? "var(--text-primary)" : "var(--text-secondary)" }}>
                <input type="radio" name="taskType" value={v} checked={form.taskType === v}
                  onChange={() => set("taskType", v)} style={{ accentColor:"#818CF8" }} />
                {label}
              </label>
            ))}
          </div>

          {/* Deadline */}
          <label style={lbl}>ДЕДЛАЙН</label>
          <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12,
            color:"var(--text-secondary)", cursor:"pointer", marginBottom:6 }}>
            <input type="checkbox" checked={form.noDeadline}
              onChange={e => set("noDeadline", e.target.checked)}
              style={{ accentColor:"#818CF8" }} />
            Бессрочный проект
          </label>
          {!form.noDeadline && (
            <input type="date" style={inp} value={form.deadline}
              onChange={e => set("deadline", e.target.value)} />
          )}

          {/* Start date */}
          <label style={lbl}>ДАТА НАЧАЛА</label>
          <input type="date" style={inp} value={form.startDate}
            onChange={e => set("startDate", e.target.value)} />

          {/* Live preview */}
          <div style={{ marginTop:14, padding:"10px 12px", background:"rgba(129,140,248,0.07)",
            borderRadius:6, border:"1px solid rgba(129,140,248,0.15)", fontSize:11, color:"#818CF8" }}>
            ~{hoursDay} ч/день
            {weeksLeft ? ` · до дедлайна ~${weeksLeft} нед.` : " · бессрочно"}
            {totalH   ? ` · всего ~${totalH} ч` : ""}
          </div>

          {lowTime && (
            <div style={{ marginTop:8, padding:"8px 12px", background:"rgba(253,211,70,0.08)",
              borderRadius:6, border:"1px solid rgba(253,211,70,0.25)", fontSize:11, color:"#FCD34D" }}>
              ⚠️ Мало времени — рассмотри увеличение часов/нед
            </div>
          )}

          <div style={{ display:"flex", gap:8, marginTop:20, justifyContent:"flex-end" }}>
            <button type="button" onClick={onClose}
              style={{ padding:"7px 16px", borderRadius:6, border:"1px solid var(--border)",
                background:"transparent", color:"var(--text-secondary)", fontSize:11,
                cursor:"pointer", fontFamily:"inherit" }}>
              Отмена
            </button>
            <button type="submit"
              style={{ padding:"7px 16px", borderRadius:6, border:"none",
                background:`linear-gradient(90deg,${form.color},#818CF8)`,
                color:"var(--bg-base)", fontSize:11, fontWeight:700,
                cursor:"pointer", fontFamily:"inherit" }}>
              Создать проект
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════
//  BULK SCHEDULE MODAL
// ═══════════════════════════════════════════
const BulkScheduleModal = React.memo(function BulkScheduleModal({ isOpen, onClose, onConfirm, items }) {
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
});

// ═══════════════════════════════════════════
//  DAY TIMELINE COMPONENT
// ═══════════════════════════════════════════
const BLOCK_ICONS = {
  wake:      "🌅",
  sport:     "🏃",
  home_work: "🏠",
  commute:   "🚌",
  class:     "🎓",
  break:     "☕",
  free:      "✨",
};

const BLOCK_DEFAULT_COLOR = {
  wake:      "#818CF8",
  sport:     "#4ADE80",
  home_work: "#22D3EE",
  commute:   "#FFD93D",
  class:     "#C084FC",
  break:     "#6B7280",
  free:      "#F9A8D4",
};

/** Parse "HH:MM" → minutes */
const _tlParse = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };

/** Height in px: 1h = 60px, min 40px */
const _blockH = (start, end) => Math.max(40, (_tlParse(end) - _tlParse(start)));

export const DayTimeline = React.memo(function DayTimeline({ blocks = [], theme = "dark", onBlockClick }) {
  if (!blocks.length) return null;

  return (
    <div style={{ display:"flex", flexDirection:"column", position:"relative", paddingLeft:52 }}>

      {/* Vertical time rail */}
      <div style={{
        position:"absolute", left:44, top:8, bottom:8,
        width:2, background:"var(--border)", borderRadius:1,
      }} />

      {blocks.map((block, i) => {
        const h         = _blockH(block.startTime, block.endTime);
        const color     = block.color ?? BLOCK_DEFAULT_COLOR[block.type] ?? "#818CF8";
        const dimmed    = block.opacity != null && block.opacity < 1;
        const textCol   = dimmed ? "var(--text-muted)" : "var(--text-primary)";
        const icon      = BLOCK_ICONS[block.type] ?? "•";
        const clickable = block.type === "home_work" && !!block.taskId && !!onBlockClick;

        return (
          <div key={i}
            style={{ display:"flex", alignItems:"flex-start", minHeight:h, position:"relative",
              cursor: clickable ? "pointer" : "default",
              borderRadius:6,
            }}
            onClick={clickable ? () => onBlockClick(block) : undefined}>

            {/* Time label */}
            <div style={{
              position:"absolute", left:-52, top:0,
              width:40, textAlign:"right",
              fontSize:10, color:"var(--text-faint)", lineHeight:"20px",
              flexShrink:0, userSelect:"none",
            }}>
              {block.startTime}
            </div>

            {/* Dot on rail */}
            <div style={{
              position:"absolute", left:-10, top:6,
              width:8, height:8, borderRadius:"50%",
              background: color,
              border:`2px solid ${theme === "light" ? "#fff" : "#07070F"}`,
              zIndex:1,
            }} />

            {/* Block content */}
            <div style={{
              flex:1, marginLeft:12, marginBottom:4,
              display:"flex", alignItems:"stretch",
              opacity: block.opacity ?? 1,
              minHeight:h - 4,
            }}>
              {/* Color strip */}
              <div style={{
                width:3, borderRadius:2, flexShrink:0,
                background: color, marginRight:10, alignSelf:"stretch",
              }} />

              {/* Text */}
              <div style={{ flex:1, paddingTop:2 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                  <span style={{ fontSize:14, lineHeight:1 }}>{icon}</span>
                  <span style={{ fontSize:13, color: textCol, lineHeight:1.3 }}>{block.label}</span>
                  {block.isLight && (
                    <span style={{
                      fontSize:9, color:"var(--text-faint)",
                      marginLeft:"auto", flexShrink:0, paddingRight:4,
                    }}>
                      можно читать 📖
                    </span>
                  )}
                </div>
                {block.sublabel && (
                  <div style={{
                    fontSize:11, color:"var(--text-faint)",
                    fontStyle:"italic", marginTop:3, paddingLeft:20,
                    lineHeight:1.4,
                  }}>
                    {block.sublabel}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});


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
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkItems, setBulkItems] = useState([]);
  const [toast, setToast] = useState("");
  const [schedule, setSchedule] = useState({});           // { taskId: [{date, assignedHours}] }
  const [completedSessions, setCompletedSessions] = useState(new Set()); // "taskId::date"
  const { userId, syncedGet, syncedSet, syncFromShared } = useSyncedStorage();
  const { userTasks, addUserTask, removeUserTask } = useUserTasks({ syncedGet, syncedSet });
  const { userBooks, addUserBook, removeUserBook } = useUserBooks({ syncedGet, syncedSet });
  const { theme, toggleTheme } = useTheme();
  const { settings, updateSettings } = useUserSettings({ syncedGet, syncedSet });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);
  const { projects, activeProjects, addProject, completeProject, updateProject, deleteProject } = useProjects({ syncedGet, syncedSet });
  const { recurringWork, getWeekAllocation, setWeekOverride } = useRecurringWork(userTasks, activeProjects);
  const [completedWorkBlocks, setCompletedWorkBlocks] = useState(new Set());
  const [workEdit, setWorkEdit] = useState(null); // { workId, date, value }
  const [dayViews, setDayViews] = useState({}); // { [date]: "timeline" | "tasks" }
  const [highlightTask, setHighlightTask] = useState(null); // { id, date }
  const [doneProjectsOpen, setDoneProjectsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    try { return window.storage?.getItem?.("current_month_v1") || "2026-03"; } catch { return "2026-03"; }
  });
  const [calendarView, setCalendarView] = useState(() => {
    try { return window.storage?.getItem?.("calendar_view_v1") || "month"; } catch { return "month"; }
  });
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    const dow = today.getDay();
    const d = new Date(today);
    d.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    return d.toISOString().split("T")[0];
  });
  const analyticsData = useAnalytics(activeProjects);
  const {
    xp, streak, level, nextLevel, xpToNext, progressPct: xpPct,
    unlockedAchievements, lastUnlocked,
    addXP, checkAndUpdateStreak, markDayComplete,
    unlockAchievement, checkAchievements,
  } = useGameState({ syncedGet, syncedSet });
  const [syncInput, setSyncInput] = useState("");
  const [syncStatus, setSyncStatus] = useState(null); // { ok: bool, msg: string } | null
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const hasPendingWrites = useStoragePending();
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
        const wb = window.storage?.getItem?.("work_sessions_done_v1");
        if (wb) setCompletedWorkBlocks(new Set(JSON.parse(wb)));
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
    debouncedWrite("sp4_done_v3", [...completed], v => localStorage.setItem("sp4_done_v3", JSON.stringify(v)), 800);
  }, [completed, loaded]);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem("user_sessions_v1", JSON.stringify([...completedSessions])); } catch {}
  }, [completedSessions, loaded]);

  useEffect(() => {
    if (!loaded) return;
    debouncedWrite("work_sessions_done_v1", [...completedWorkBlocks], v => window.storage?.setItem?.("work_sessions_done_v1", JSON.stringify(v)), 800);
    // Check week_warrior: if done hours this week >= weeklyHours for any recurring work
    const todayDate = new Date().toISOString().split("T")[0];
    const ws = (() => {
      const d = new Date(todayDate + "T00:00:00");
      const dow = d.getDay();
      d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
      return d.toISOString().split("T")[0];
    })();
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ws + "T00:00:00");
      d.setDate(d.getDate() + i);
      return d.toISOString().split("T")[0];
    });
    for (const work of recurringWork) {
      const dateMap = allWeekAllocations[ws]?.[work.id] || {};
      const doneH = weekDates.reduce((sum, d) =>
        completedWorkBlocks.has(`${work.id}_${d}`) ? sum + (dateMap[d] || 0) : sum, 0);
      if (doneH >= work.weeklyHours) unlockAchievement("week_warrior");
    }
  }, [completedWorkBlocks, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const [xpPopups, setXpPopups] = useState([]);

  const spawnXpPopup = useCallback((amount, rect, bonus) => {
    const popup = { id: Date.now() + Math.random(), amount, bonus,
      x: rect.left + rect.width / 2, y: rect.top };
    setXpPopups(p => [...p, popup]);
    requestAnimationFrame(() => setTimeout(() => setXpPopups(p => p.filter(pp => pp.id !== popup.id)), 900));
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

  const toggleWorkBlock = useCallback((workId, date) => {
    setCompletedWorkBlocks(p => {
      const key = `${workId}_${date}`;
      const n = new Set(p);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }, []);

  const handleWorkBlockToggle = useCallback((e, work, date, hours) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const blockKey = `${work.id}_${date}`;
    const wasCompleted = completedWorkBlocks.has(blockKey);
    if (!wasCompleted) {
      const xpAmount = Math.round(hours * 8);
      addXP(xpAmount);
      spawnXpPopup(xpAmount, rect, false);
    }
    toggleWorkBlock(work.id, date);
  }, [completedWorkBlocks, addXP, spawnXpPopup, toggleWorkBlock]); // eslint-disable-line react-hooks/exhaustive-deps

  // Week helpers
  const getWeekStartDate = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    return d.toISOString().split("T")[0];
  };

  const getWeekKeyStr = (dateStr) => {
    const ws = getWeekStartDate(dateStr);
    const d = new Date(ws + "T00:00:00");
    const thu = new Date(d);
    thu.setDate(d.getDate() + 3);
    const jan4 = new Date(thu.getFullYear(), 0, 4);
    const wn = 1 + Math.round((thu - jan4) / 604800000);
    return `${thu.getFullYear()}-W${String(wn).padStart(2, "0")}`;
  };

  // Pre-compute week allocations for all unique weeks in DAYS
  const allWeekAllocations = useMemo(() => {
    const result = {};
    const seen = new Set();
    for (const day of DAYS) {
      const ws = getWeekStartDate(day.date);
      if (!seen.has(ws)) {
        seen.add(ws);
        result[ws] = getWeekAllocation(ws);
      }
    }
    return result;
  }, [getWeekAllocation]); // eslint-disable-line react-hooks/exhaustive-deps

  const getWorkHoursForDay = (dateStr) => {
    const ws    = getWeekStartDate(dateStr);
    const alloc = allWeekAllocations[ws] || {};
    const result = {};
    for (const [projId, dateMap] of Object.entries(alloc)) {
      result[projId] = dateMap[dateStr] ?? 0;
    }
    return result;
  };

  // Close settings dropdown on outside click
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [settingsOpen]);

  // Stats
  const { totalTasks, doneCount, totalH, doneH, pct } = useMemo(() => {
    const totalTasks = TASKS.length;
    const doneCount  = TASKS.filter(t => completed.has(t.id)).length;
    const totalH     = TASKS.reduce((s, t) => s + t.est, 0);
    const doneH      = TASKS.filter(t => completed.has(t.id)).reduce((s, t) => s + t.est, 0);
    const pct        = Math.round(doneCount / totalTasks * 100);
    return { totalTasks, doneCount, totalH, doneH, pct };
  }, [completed]);

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

  const catStats = useMemo(() => Object.keys(CAT).map(c => {
    const ts = TASKS.filter(t => t.cat === c);
    return { c, total: ts.length, done: ts.filter(t => completed.has(t.id)).length };
  }), [completed]);

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
          --bg-base:#F7F4FB;--bg-surface:#F0ECF8;--bg-elevated:#FFFFFF;--bg-card:#FFFFFF;
          --border:#DDD6EE;--border-subtle:#EAE6F4;
          --text-primary:#2A2040;--text-secondary:#5A4E7A;--text-muted:#8A7EAA;--text-faint:#B0A6C8;--text-ghost:#CEC8E0;
          --shadow-card:0 1px 4px rgba(100,80,160,0.08),0 1px 2px rgba(100,80,160,0.04);
          --shadow-elevated:0 4px 16px rgba(100,80,160,0.12);
          --cbx-bg-empty:#EDE8F6;
          --accent-lavender:#B8A8D8;--accent-pink:#E8B4C0;--accent-blue:#A8C8E8;--accent-mint:#A8D8CC;--accent-peach:#F0C4B0;
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
        @media(max-width:599px){.xp-num{display:none!important}.week-scroll{flex-direction:column!important;overflow-x:visible!important}}
        .cbx{width:15px;height:15px;border-radius:3px;border:1.5px solid var(--border);background:var(--cbx-bg-empty,transparent);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:all .15s}
        .cbx:hover{border-color:#5A5A8A}
        .cbx.on{border-color:transparent}
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ background:"var(--bg-elevated)", borderBottom:"1px solid var(--border)", padding:"18px 20px 14px" }}>
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
                          background: theme==="light" ? "linear-gradient(90deg,#B8A8D8,#A8C8E8)" : `linear-gradient(90deg,${fromColor},${toColor})`, borderRadius:3 }} />
                      </div>
                      <span className="xp-num" style={{ fontSize:11, color: theme==="light" ? "var(--text-secondary)" : "var(--text-muted)", lineHeight:1 }}>{xp} XP</span>
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
                <button onClick={() => setProjectModalOpen(true)}
                  style={{ padding:"6px 14px", borderRadius:6, border:"1px solid #2A1A4E",
                    background:"rgba(192,132,252,0.1)", color:"#C084FC", fontSize:11,
                    cursor:"pointer", fontFamily:"inherit", letterSpacing:0.5 }}>
                  ＋ Проект
                </button>
                <button onClick={toggleTheme}
                  style={{ width:32, height:32, borderRadius:"50%", border:"1px solid var(--border)",
                    background:"var(--bg-elevated)", fontSize:16, cursor:"pointer",
                    display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {theme === "dark" ? "🌙" : "☀️"}
                </button>

                {/* ⚙️ Settings */}
                <div ref={settingsRef} style={{ position:"relative" }}>
                  <button onClick={() => setSettingsOpen(o => !o)}
                    style={{ width:32, height:32, borderRadius:"50%", border:"1px solid var(--border)",
                      background: settingsOpen ? "var(--bg-surface)" : "var(--bg-elevated)",
                      fontSize:16, cursor:"pointer", position:"relative",
                      display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    ⚙️
                    {hasPendingWrites && (
                      <span style={{
                        position:"absolute", top:4, right:4,
                        width:6, height:6, borderRadius:"50%",
                        background:"#94A3B8", pointerEvents:"none",
                      }} />
                    )}
                  </button>

                  {settingsOpen && (
                    <div style={{
                      position:"absolute", top:38, right:0, zIndex:200,
                      background:"var(--bg-elevated)", border:"1px solid var(--border)",
                      borderRadius:10, padding:"14px 16px", width:240,
                      boxShadow:"var(--shadow-elevated)", display:"flex", flexDirection:"column", gap:12,
                    }}>
                      <div style={{ fontSize:9, letterSpacing:3, color:"var(--text-faint)", marginBottom:2 }}>НАСТРОЙКИ ДНЯ</div>

                      {/* Wake time */}
                      <label style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:11, color:"var(--text-secondary)" }}>
                        Подъём в:
                        <select value={settings.wakeUpTime * 60}
                          onChange={e => updateSettings({ wakeUpTime: Number(e.target.value) / 60 })}
                          style={{ background:"var(--bg-surface)", border:"1px solid var(--border)", borderRadius:5,
                            color:"var(--text-primary)", fontSize:11, padding:"2px 6px", cursor:"pointer" }}>
                          {Array.from({ length: 11 }, (_, i) => 5 * 60 + i * 30).map(min => (
                            <option key={min} value={min}>
                              {String(Math.floor(min / 60)).padStart(2,"0")}:{String(min % 60).padStart(2,"0")}
                            </option>
                          ))}
                        </select>
                      </label>

                      {/* Sport days */}
                      <div>
                        <div style={{ fontSize:11, color:"var(--text-secondary)", marginBottom:6 }}>Спорт:</div>
                        <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                          {[["Пн",1],["Вт",2],["Ср",3],["Чт",4],["Пт",5],["Сб",6],["Вс",0]].map(([label, dow]) => {
                            const on = settings.hasSportDays.includes(dow);
                            return (
                              <button key={dow}
                                onClick={() => updateSettings({
                                  hasSportDays: on
                                    ? settings.hasSportDays.filter(d => d !== dow)
                                    : [...settings.hasSportDays, dow],
                                })}
                                style={{
                                  padding:"3px 7px", borderRadius:5, fontSize:10, cursor:"pointer",
                                  border:`1px solid ${on ? "#4ADE80" : "var(--border)"}`,
                                  background: on ? "rgba(74,222,128,0.12)" : "transparent",
                                  color: on ? "#4ADE80" : "var(--text-muted)",
                                  fontFamily:"inherit",
                                }}>
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Sport duration */}
                      <label style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:11, color:"var(--text-secondary)" }}>
                        Длительность спорта:
                        <select value={settings.sportDuration}
                          onChange={e => updateSettings({ sportDuration: Number(e.target.value) })}
                          style={{ background:"var(--bg-surface)", border:"1px solid var(--border)", borderRadius:5,
                            color:"var(--text-primary)", fontSize:11, padding:"2px 6px", cursor:"pointer" }}>
                          <option value={1}>1ч</option>
                          <option value={1.5}>1.5ч</option>
                          <option value={2}>2ч</option>
                        </select>
                      </label>

                      {/* ── Sync section ── */}
                      <div style={{ borderTop:"1px solid var(--border)", paddingTop:10, marginTop:2 }}>
                        <div style={{ fontSize:9, letterSpacing:3, color:"var(--text-faint)", marginBottom:8 }}>СИНХРОНИЗАЦИЯ</div>

                        {/* Device ID */}
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
                          <span style={{ fontSize:10, color:"var(--text-muted)", flexShrink:0 }}>Твой ID:</span>
                          <span style={{ fontSize:10, color:"var(--text-primary)", fontFamily:"monospace", flex:1,
                            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {userId.slice(0, 8)}
                          </span>
                          <button
                            onClick={() => { try { navigator.clipboard.writeText(userId); } catch {} }}
                            title="Скопировать ID"
                            style={{ fontSize:13, background:"none", border:"none", cursor:"pointer", padding:"0 2px", flexShrink:0 }}>
                            📋
                          </button>
                        </div>

                        {/* Refresh from own cloud */}
                        <button
                          onClick={() => {
                            const r = syncFromShared(userId);
                            setLastSyncTime(new Date().toLocaleTimeString("ru-RU", { hour:"2-digit", minute:"2-digit" }));
                            setSyncStatus({ ok: r.keysRestored > 0, msg: r.keysRestored > 0
                              ? `✅ Обновлено (${r.keysRestored} кл.)` : "❌ Данные не найдены" });
                            setTimeout(() => setSyncStatus(null), 4000);
                          }}
                          style={{ width:"100%", padding:"5px 8px", borderRadius:5, border:"1px solid var(--border)",
                            background:"rgba(129,140,248,0.08)", color:"#818CF8", fontSize:10,
                            cursor:"pointer", fontFamily:"inherit", marginBottom:8, textAlign:"left" }}>
                          🔄 Обновить с облака
                          {lastSyncTime && <span style={{ float:"right", color:"var(--text-faint)", fontSize:9 }}>{lastSyncTime}</span>}
                        </button>

                        {/* Restore from another device */}
                        <div style={{ fontSize:9, color:"var(--text-faint)", marginBottom:4 }}>
                          Перенести с другого устройства:
                        </div>
                        <div style={{ display:"flex", gap:5 }}>
                          <input
                            value={syncInput}
                            onChange={e => setSyncInput(e.target.value)}
                            placeholder="u_abc123…"
                            style={{ flex:1, padding:"4px 7px", borderRadius:5, border:"1px solid var(--border)",
                              background:"var(--bg-surface)", color:"var(--text-primary)", fontSize:10,
                              fontFamily:"monospace", outline:"none", minWidth:0 }}
                          />
                          <button
                            onClick={() => {
                              const id = syncInput.trim();
                              if (!id) return;
                              const r = syncFromShared(id);
                              setSyncStatus({ ok: r.keysRestored > 0, msg: r.keysRestored > 0
                                ? `✅ Данные восстановлены (${r.keysRestored} ключей)` : "❌ Данные не найдены для этого ID" });
                              if (r.keysRestored > 0) setSyncInput("");
                              setTimeout(() => setSyncStatus(null), 4000);
                            }}
                            style={{ padding:"4px 8px", borderRadius:5, border:"1px solid var(--border)",
                              background:"rgba(34,211,238,0.08)", color:"#22D3EE", fontSize:10,
                              cursor:"pointer", fontFamily:"inherit", flexShrink:0, whiteSpace:"nowrap" }}>
                            Синхр.
                          </button>
                        </div>

                        {syncStatus && (
                          <div style={{ marginTop:6, fontSize:10,
                            color: syncStatus.ok ? "#4ADE80" : "#FF6B6B" }}>
                            {syncStatus.msg}
                          </div>
                        )}

                        <div style={{ marginTop:8, fontSize:9, color:"var(--text-ghost)", lineHeight:1.5 }}>
                          Синхронизация через общее хранилище.<br />
                          Не передавай свой ID посторонним.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ fontFamily:"'IBM Plex Sans'", fontWeight:700, fontSize:32,
                  color: pct>75?"#4ADE80":pct>40?"#FFD93D":"#818CF8" }}>
                  {pct}%
                </div>
              </div>
              <div style={{ width:180, height:5, background:"var(--border)", borderRadius:3, overflow:"hidden" }}>
                <div className="pf" style={{ height:"100%", width:`${pct}%`,
                  background: theme==="light" ? "linear-gradient(90deg,#B8A8D8,#A8C8E8)" : "linear-gradient(90deg,#818CF8,#22D3EE)", borderRadius:3 }} />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display:"flex", gap:4, marginTop:14 }}>
            {[["days","📅 По дням"],["all","📋 Все задачи"],["achievements","🏆 Достижения"],["analytics","📊 Аналитика"]].map(([id,label]) => (
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

          {/* НЕДЕЛЯ */}
          {recurringWork.length > 0 && (() => {
            const currentWS = getWeekStartDate(todayStr);
            const currentAlloc = allWeekAllocations[currentWS] || {};
            const weekDates = Array.from({ length: 7 }, (_, i) => {
              const d = new Date(currentWS + "T00:00:00");
              d.setDate(d.getDate() + i);
              return d.toISOString().split("T")[0];
            });
            return (
              <div style={{ marginBottom:14, padding:"10px 12px", background:"var(--bg-elevated)", borderRadius:8, border:"1px solid var(--border)" }}>
                <div style={{ fontSize:9, letterSpacing:3, color:"var(--text-faint)", marginBottom:8 }}>НЕДЕЛЯ</div>
                {recurringWork.map(work => {
                  const dateMap = currentAlloc[work.id] || {};
                  const doneH = weekDates.reduce((sum, dateStr) =>
                    completedWorkBlocks.has(`${work.id}_${dateStr}`) ? sum + (dateMap[dateStr] || 0) : sum, 0);
                  const pct = work.weeklyHours > 0 ? Math.min(100, Math.round(doneH / work.weeklyHours * 100)) : 0;
                  return (
                    <div key={work.id}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4, alignItems:"center" }}>
                        <span style={{ fontSize:10, color:"var(--text-secondary)" }}>{work.emoji} {work.title}</span>
                        <span style={{ fontSize:9, color:"var(--text-muted)" }}>{Math.round(doneH * 10) / 10} / {work.weeklyHours}ч</span>
                      </div>
                      <div style={{ height:2.5, background:"var(--border)", borderRadius:2, overflow:"hidden" }}>
                        <div className="pf" style={{ height:"100%", width:`${pct}%`, background:work.color, borderRadius:2 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* МОИ ПРОЕКТЫ */}
          {projects.length > 0 && (() => {
            // Compute total spent hours per project across all completed work blocks
            const spentByProject = {};
            for (const proj of projects) {
              let h = 0;
              for (const alloc of Object.values(allWeekAllocations)) {
                const dateMap = alloc[proj.id] || {};
                for (const [dateStr, hours] of Object.entries(dateMap)) {
                  if (completedWorkBlocks.has(`${proj.id}_${dateStr}`)) h += hours;
                }
              }
              spentByProject[proj.id] = Math.round(h * 10) / 10;
            }

            const doneProjects = projects.filter(p => p.status === "done");

            const handleComplete = (proj) => {
              const msg = `Завершить проект «${proj.title}»? Он будет отмечен как выполненный.`;
              if (!window.confirm(msg)) return;
              completeProject(proj.id);
              const spent = spentByProject[proj.id] ?? 0;
              const earnedXP = Math.round(spent * 5);
              if (earnedXP > 0) addXP(earnedXP);
              setAchievementPopup({ emoji: "🎉", label: "Проект завершён!", desc: `${proj.emoji} ${proj.title} · +${earnedXP} XP` });
              setTimeout(() => setAchievementPopup(null), 4000);
            };

            return (
              <div style={{ marginBottom:14, padding:"10px 12px", background:"var(--bg-elevated)", borderRadius:8, border:"1px solid var(--border)" }}>
                <div style={{ fontSize:9, letterSpacing:3, color:"var(--text-faint)", marginBottom:8 }}>МОИ ПРОЕКТЫ</div>

                {/* Active projects */}
                {activeProjects.map(proj => {
                  const spent   = spentByProject[proj.id] ?? 0;
                  const goal    = proj.totalHoursGoal;
                  const pct     = goal ? Math.min(100, Math.round(spent / goal * 100)) : null;

                  // Current week hours
                  const currentWS = getWeekStartDate(todayStr);
                  const weekDateMap = (allWeekAllocations[currentWS] || {})[proj.id] || {};
                  const weekDatesArr = Array.from({ length: 7 }, (_, i) => {
                    const d = new Date(currentWS + "T00:00:00");
                    d.setDate(d.getDate() + i);
                    return d.toISOString().split("T")[0];
                  });
                  const weekDoneH = weekDatesArr.reduce((sum, ds) =>
                    completedWorkBlocks.has(`${proj.id}_${ds}`) ? sum + (weekDateMap[ds] || 0) : sum, 0);

                  // Deadline info
                  let deadlineLabel = null;
                  if (proj.deadline) {
                    const weeksLeft = Math.ceil(
                      (new Date(proj.deadline) - new Date()) / (7 * 24 * 3600 * 1000)
                    );
                    const dlStr = new Date(proj.deadline + "T00:00:00")
                      .toLocaleDateString("ru-RU", { day:"numeric", month:"short" });
                    deadlineLabel = `до ${dlStr} · ${Math.max(0, weeksLeft)} нед`;
                  }

                  return (
                    <div key={proj.id} style={{ marginBottom:10 }}>
                      {/* Title row */}
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:3 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:5, minWidth:0 }}>
                          <span style={{ width:7, height:7, borderRadius:"50%", background:proj.color, flexShrink:0, display:"inline-block" }} />
                          <span style={{ fontSize:11, color:"var(--text-primary)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                            {proj.emoji} {proj.title}
                          </span>
                        </div>
                        <button onClick={() => handleComplete(proj)}
                          style={{ fontSize:9, padding:"2px 7px", borderRadius:4, border:"1px solid var(--border)",
                            background:"transparent", color:"var(--text-muted)", cursor:"pointer",
                            fontFamily:"inherit", flexShrink:0, marginLeft:4, whiteSpace:"nowrap" }}>
                          ✓ Завершить
                        </button>
                      </div>

                      {/* Progress bar */}
                      {goal ? (
                        <>
                          <div style={{ height:3, background:"var(--border)", borderRadius:2, overflow:"hidden", marginBottom:2 }}>
                            <div style={{ height:"100%", width:`${pct}%`, background:proj.color, borderRadius:2, transition:"width .3s" }} />
                          </div>
                          <div style={{ fontSize:9, color:"var(--text-faint)", display:"flex", justifyContent:"space-between" }}>
                            <span>{spent} / {goal} ч ({pct}%)</span>
                            {deadlineLabel && <span>{deadlineLabel}</span>}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize:9, color:"var(--text-faint)" }}>
                          {Math.round(weekDoneH * 10) / 10} ч эта неделя / {proj.weeklyHours} ч цель
                          {deadlineLabel && <span style={{ marginLeft:6 }}>{deadlineLabel}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Completed projects toggle */}
                {doneProjects.length > 0 && (
                  <div style={{ marginTop:4 }}>
                    <button onClick={() => setDoneProjectsOpen(o => !o)}
                      style={{ fontSize:9, color:"var(--text-faint)", background:"none", border:"none",
                        cursor:"pointer", fontFamily:"inherit", padding:0, letterSpacing:1 }}>
                      {doneProjectsOpen ? "▾" : "▸"} Завершённые ({doneProjects.length})
                    </button>
                    {doneProjectsOpen && (
                      <div style={{ marginTop:6, display:"flex", flexDirection:"column", gap:5 }}>
                        {doneProjects.map(proj => {
                          const spent = spentByProject[proj.id] ?? 0;
                          const doneDate = proj.completedAt
                            ? new Date(proj.completedAt).toLocaleDateString("ru-RU", { day:"numeric", month:"short" })
                            : null;
                          return (
                            <div key={proj.id} style={{ display:"flex", alignItems:"center", gap:5 }}>
                              <span style={{ fontSize:10, color:"#4ADE80", flexShrink:0 }}>✓</span>
                              <div style={{ minWidth:0 }}>
                                <div style={{ fontSize:10, color:"var(--text-faint)", textDecoration:"line-through",
                                  whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                                  {proj.emoji} {proj.title}
                                </div>
                                <div style={{ fontSize:9, color:"var(--text-ghost)" }}>
                                  {spent} ч{doneDate ? ` · ${doneDate}` : ""}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

              </div>
            );
          })()}

          <div style={{ fontSize:9, letterSpacing:3, color:"var(--text-faint)", marginBottom:10 }}>ПО ТЕМАМ</div>
          {catStats.map(({ c, total, done }) => {
            const cat = CAT[c];
            const p = total > 0 ? Math.round(done/total*100) : 0;
            const allDone = done === total && total > 0;
            return (
              <div key={c} style={{ marginBottom:9 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3, alignItems:"center" }}>
                  <span style={{ fontSize:11, color: allDone ? cat.color : (theme==="light" ? "var(--text-secondary)" : "var(--text-muted)"), opacity:1 }}>
                    {cat.emoji} {cat.label}
                  </span>
                  <span style={{ fontSize:9, color: theme==="light" ? "var(--text-muted)" : "var(--text-faint)" }}>{done}/{total}</span>
                </div>
                <div style={{ height:2.5, background:"var(--border)", borderRadius:2, overflow:"hidden" }}>
                  <div className="pf" style={{ height:"100%", width:`${p}%`, background:cat.color, opacity: allDone?1:0.7, borderRadius:2 }} />
                </div>
              </div>
            );
          })}

          {/* Side projects */}
          <div style={{ marginTop:20, padding:12, background: theme==="light" ? "var(--bg-surface)" : "var(--bg-elevated)", borderRadius:8, border:"1px solid var(--border)" }}>
            <div style={{ fontSize:9, letterSpacing:3, color:"var(--text-muted)", marginBottom:8 }}>ПАРАЛЛЕЛЬНО</div>
            {[
              ["📖","GO Паттерны","в пути"],
              ["📖","Психология влияния","финал"],
              ["📖","Общая психопатология","начать до конца мес."],
              ["📖","Black Hat GO","после паттернов"],
              ["💻","EventManager","20–30ч/нед"],
              ["🏃","Спорт","утром ~2ч"],
            ].map(([e,n,s]) => (
              <div key={n} style={{ fontSize:10, color:"var(--text-secondary)", marginBottom:5, lineHeight:1.4, opacity:1 }}>
                {e} <span style={{ color: theme==="light" ? "var(--text-secondary)" : "var(--text-muted)" }}>{n}</span>
                <span style={{ fontSize:9, color: theme==="light" ? "var(--text-muted)" : "var(--text-faint)", display:"block", paddingLeft:16 }}>{s}</span>
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
          <div style={{ marginTop:12, padding:10, background: theme==="light" ? "var(--bg-surface)" : "var(--bg-elevated)", borderRadius:8, border:"1px solid var(--border)" }}>
            <div style={{ fontSize:9, letterSpacing:3, color:"var(--text-muted)", marginBottom:8 }}>ПАРЫ</div>
            {(theme==="light" ? [
              ["обязательно!","rgba(240,196,176,0.3)","#B05830"],
              ["читать","rgba(168,216,204,0.3)","#2A7A68"],
              ["50/50 читать","rgba(184,168,216,0.25)","#6040A0"],
              ["работать на компе","rgba(168,200,232,0.3)","#304E80"],
              ["пропустить","rgba(232,180,192,0.25)","#A03050"],
            ] : [
              ["обязательно!","rgba(255,165,0,0.15)","#FFA500"],
              ["читать","rgba(74,222,128,0.12)","#4ADE80"],
              ["50/50 читать","rgba(253,224,71,0.12)","#FDE047"],
              ["работать на компе","rgba(34,211,238,0.12)","#22D3EE"],
              ["пропустить","rgba(255,107,107,0.12)","#FF6B6B"],
            ]).map(([label,bg,color]) => (
              <div key={label} style={{ display:"inline-flex", alignItems:"center", marginRight:6, marginBottom:4 }}>
                <span style={{ fontSize:9, padding:"1px 5px", borderRadius:3, background:bg, color, whiteSpace:"nowrap" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── MAIN AREA ── */}
        <div style={{ flex:1, minWidth:0 }}>

          {/* ── TAB: BY DAYS ── */}
          {tab === "days" && (() => {
            // Month navigation helpers
            const allMonths = ALL_MONTHS;
            const monthIdx  = allMonths.indexOf(currentMonth);
            const prevMonth = allMonths[monthIdx - 1] ?? null;
            const nextMonth = allMonths[monthIdx + 1] ?? null;
            const RU_MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
            const [yr, mo] = currentMonth.split("-").map(Number);
            const monthLabel = `${RU_MONTHS[mo - 1]} ${yr}`;

            const goMonth = (m) => {
              setCurrentMonth(m);
              try { window.storage?.setItem?.("current_month_v1", m); } catch {}
            };

            const activeDays = generateDays(currentMonth);

            // Month progress: tasks from activeDays only
            const monthTaskIds = [...new Set(activeDays.flatMap(d => d.taskIds))];
            const monthDone    = monthTaskIds.filter(id => completed.has(id)).length;
            const monthTotal   = monthTaskIds.length;
            const monthPct     = monthTotal > 0 ? Math.round(monthDone / monthTotal * 100) : 0;

            // bookIndex: sequential index among commute-days (days with uni), full DAYS for stability
            const bookIndexByDate = {};
            let commuteIdx = 0;
            for (const d of DAYS) { if (d.uni?.length > 0) bookIndexByDate[d.date] = commuteIdx++; }

            const btnBase = { padding:"4px 10px", borderRadius:6, border:"1px solid var(--border)",
              background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:13,
              color:"var(--text-secondary)", lineHeight:1 };
            const btnDisabled = { ...btnBase, opacity:0.3, cursor:"default" };

            // Week view helpers
            const _wd = (ds, n) => { const d = new Date(ds+"T00:00:00"); d.setDate(d.getDate()+n); return d.toISOString().split("T")[0]; };
            const weekEndDate = _wd(currentWeekStart, 6);
            const prevWeekStart = _wd(currentWeekStart, -7);
            const nextWeekStart = _wd(currentWeekStart, 7);
            const canGoPrev = DAYS.some(d => d.date >= prevWeekStart && d.date <= _wd(prevWeekStart, 6));
            const canGoNext = DAYS.some(d => d.date >= nextWeekStart);
            const weekDays = DAYS.filter(d => d.date >= currentWeekStart && d.date <= weekEndDate);
            const [,wsm, wsd] = currentWeekStart.split("-").map(Number);
            const [,wem, wed] = weekEndDate.split("-").map(Number);
            const RU_MONTHS_SHORT = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
            const weekLabel = wsm === wem
              ? `${wsd}–${wed} ${RU_MONTHS_SHORT[wsm-1]}`
              : `${wsd} ${RU_MONTHS_SHORT[wsm-1]} – ${wed} ${RU_MONTHS_SHORT[wem-1]}`;
            const goWeek = (ws) => setCurrentWeekStart(ws);
            const goToday = () => {
              const t = new Date(); const dow = t.getDay();
              const m = new Date(t); m.setDate(t.getDate()-(dow===0?6:dow-1));
              setCurrentWeekStart(m.toISOString().split("T")[0]);
            };
            const switchCalendarView = (v) => {
              setCalendarView(v);
              try { window.storage?.setItem?.("calendar_view_v1", v); } catch {}
            };
            const weekStats = (() => {
              let studyH = 0, workH = 0, tasksDone = 0;
              for (const day of weekDays) {
                studyH += day.freeH;
                workH += Math.round(Object.values(getWorkHoursForDay(day.date)).reduce((s,h)=>s+h,0)*10)/10;
                tasksDone += day.taskIds.filter(id => completed.has(id)).length;
              }
              return { studyH, workH, tasksDone };
            })();

            const renderDayCard = (day) => {
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

                // Timeline
                const dayView = dayViews[day.date] ?? "tasks";
                const dayOfWeek = new Date(day.date + "T00:00:00").getDay();
                const hasSport = settings.hasSportDays.includes(dayOfWeek);
                const bookIdx = bookIndexByDate[day.date] ?? 0;
                const workForDay = getWorkHoursForDay(day.date);
                const workTasks = recurringWork
                  .map(w => ({ id: w.id, title: w.title, est: workForDay[w.id] ?? 0, color: w.color, taskType: "heavy" }))
                  .filter(t => t.est > 0);
                const allDayTasks = [
                  ...tasks.map(t => ({ ...t, color: CAT[t.cat]?.color })),
                  ...workTasks,
                ];
                const timeline = isOpen ? buildDayTimeline(day, {
                  wakeUpTime: settings.wakeUpTime,
                  hasSport,
                  books: userBooks,
                  tasks: allDayTasks,
                  bookIndex: bookIdx,
                }) : [];

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
                            background: day.wn==="ЗН"
                              ? (theme==="light"?"rgba(168,200,232,0.25)":"rgba(34,211,238,0.1)")
                              : (theme==="light"?"rgba(180,160,216,0.25)":"rgba(192,132,252,0.1)"),
                            color: day.wn==="ЗН"
                              ? (theme==="light"?"#4A78A8":"#22D3EE")
                              : (theme==="light"?"#7060A8":"#C084FC") }}>
                            {day.wn}
                          </span>
                          {isToday && <span style={{ fontSize:8, padding:"1px 6px", borderRadius:3, background:"rgba(74,222,128,0.15)", color:"#4ADE80", letterSpacing:1 }}>СЕГОДНЯ</span>}
                          {allDone && <span style={{ fontSize:8, padding:"1px 6px", borderRadius:3, background:"rgba(74,222,128,0.1)", color:"#4ADE80" }}>✓ ГОТОВО</span>}
                          {day.uni.length > 0 && <span style={{ fontSize:9, color: theme==="light" ? "var(--text-muted)" : "var(--text-faint)" }}>🎓 {day.uni.length} пар.</span>}
                          <span style={{ fontSize:9, color: theme==="light" ? "var(--text-muted)" : "var(--text-faint)" }}>~{totalEstDay}ч задач</span>
                          {(() => {
                            const wh = Object.values(getWorkHoursForDay(day.date)).reduce((s, h) => s + h, 0);
                            return wh > 0 ? <span style={{ fontSize:9, color:"var(--text-muted)" }}>💻 {wh}ч</span> : null;
                          })()}
                          <span style={{ fontSize:8, padding:"1px 6px", borderRadius:3,
                            background:"rgba(34,211,238,0.08)", color:"#22D3EE",
                            letterSpacing:0.5, whiteSpace:"nowrap" }}>
                            ⏱ {day.freeH}ч свободно
                          </span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ flex:1, height:2.5, background:"var(--border)", borderRadius:2, overflow:"hidden" }}>
                            <div style={{ height:"100%", width:`${dayPct}%`, borderRadius:2,
                              background: allDone?"#4ADE80":(theme==="light"?"#7060A8":"#4A4AAA"), transition:"width .4s" }} />
                          </div>
                          <span style={{ fontSize:9, color: theme==="light" ? "var(--text-muted)" : "var(--text-faint)", flexShrink:0 }}>{doneTasks.length}/{tasks.length}</span>
                        </div>
                      </div>

                      <span style={{ color:"var(--text-ghost)", fontSize:10, transition:"transform .2s",
                        transform: isOpen?"rotate(180deg)":"none", display:"inline-block" }}>▼</span>
                    </div>

                    {/* ─ Expanded ─ */}
                    {isOpen && (
                      <div style={{ borderTop:"1px solid var(--border-subtle)", background: theme==="light" ? "var(--bg-surface)" : undefined }}>

                        {/* ─ View tabs ─ */}
                        <div style={{ display:"flex", gap:0, padding:"8px 14px 0", borderBottom:"1px solid var(--border-subtle)" }}>
                          {[["🕐 Мой день","timeline"],["✅ Задачи","tasks"]].map(([label, view]) => (
                            <button key={view}
                              onClick={() => setDayViews(prev => ({ ...prev, [day.date]: view }))}
                              style={{
                                padding:"4px 12px", fontSize:10, cursor:"pointer", fontFamily:"inherit",
                                border:"1px solid var(--border)", borderBottom:"none",
                                borderRadius: view === "timeline" ? "6px 0 0 0" : "0 6px 0 0",
                                background: dayView === view ? "var(--bg-elevated)" : "transparent",
                                color: dayView === view ? "var(--text-primary)" : "var(--text-muted)",
                                marginBottom:-1, position:"relative", zIndex: dayView === view ? 1 : 0,
                              }}>
                              {label}
                            </button>
                          ))}
                        </div>

                        {/* ─ Timeline view ─ */}
                        {dayView === "timeline" && (
                          <div style={{ padding:"16px 14px 12px", borderBottom:"1px solid var(--border-subtle)" }}>
                            <DayTimeline
                              blocks={timeline}
                              theme={theme}
                              onBlockClick={(block) => {
                                setDayViews(prev => ({ ...prev, [day.date]: "tasks" }));
                                setHighlightTask({ id: block.taskId, date: day.date });
                                setTimeout(() => {
                                  const el = document.querySelector(`[data-task-id="${block.taskId}"]`);
                                  el?.scrollIntoView({ behavior:"smooth", block:"center" });
                                }, 50);
                                setTimeout(() => setHighlightTask(null), 600);
                              }}
                            />
                          </div>
                        )}

                        {/* ─ Tasks view ─ */}
                        {dayView === "tasks" && <>

                        {/* Tip */}
                        <div style={{ padding:"8px 14px", background: theme==="light" ? "var(--bg-elevated)" : "var(--bg-base)", fontSize:11, color:"var(--text-muted)", lineHeight:1.6, borderBottom:"1px solid var(--border-subtle)", borderLeft: theme==="light" ? "3px solid var(--accent-lavender)" : "none" }}>
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
                                    <span style={{ color: theme==="light" ? "var(--text-secondary)" : "var(--text-faint)" }}>{cls.time}</span>
                                    <span style={{ color: theme==="light" ? "var(--text-secondary)" : "var(--text-muted)" }}>{cls.name}</span>
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
                            const isHighlighted = highlightTask?.id === task.id && highlightTask?.date === day.date;
                            return (
                              <div key={task.id} data-task-id={task.id} className="task-row tr"
                                style={{ display:"flex", alignItems:"flex-start", gap:9, padding:"5px 7px",
                                  borderRadius:6, cursor:"pointer",
                                  boxShadow: isHighlighted ? "inset 0 0 0 2px rgba(129,140,248,0.6)" : "none",
                                  transition:"box-shadow 0.5s" }}
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
                          {/* Work blocks */}
                          {(() => {
                            const workForDay = getWorkHoursForDay(day.date);
                            const activeWork = recurringWork.filter(w => (workForDay[w.id] ?? 0) > 0);
                            if (!activeWork.length) return null;
                            return (
                              <div style={{ marginTop:8, paddingTop:8, borderTop:"1px solid var(--border-subtle)" }}>
                                <div style={{ fontSize:8, letterSpacing:3, color:"var(--text-ghost)", marginBottom:8 }}>💼 РАБОТА</div>
                                {activeWork.map(work => {
                                  const hours = workForDay[work.id];
                                  const dailyTarget = work.weeklyHours / 5;
                                  const pct = Math.min(100, Math.round(hours / dailyTarget * 100));
                                  const blockKey = `${work.id}_${day.date}`;
                                  const done = completedWorkBlocks.has(blockKey);
                                  const isEditing = workEdit?.workId === work.id && workEdit?.date === day.date;
                                  return (
                                    <div key={work.id} style={{ display:"flex", alignItems:"center", gap:9, padding:"4px 7px", borderRadius:6, cursor:"pointer", opacity: done ? 0.55 : 1 }}
                                      onClick={e => !isEditing && handleWorkBlockToggle(e, work, day.date, hours)}>
                                      <div className={`cbx${done?" on":""}`}
                                        style={{ background: done ? work.color : "transparent", flexShrink:0 }}>
                                        {done && <span style={{ fontSize:9, color:"#000", fontWeight:700 }}>✓</span>}
                                      </div>
                                      <div style={{ flex:1 }}>
                                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                                          <span style={{ display:"inline-block", width:6, height:6, borderRadius:"50%", background:work.color, flexShrink:0 }} />
                                          <span style={{ fontSize:12, color: done ? "var(--text-faint)" : "var(--text-primary)", textDecoration: done ? "line-through" : "none", lineHeight:1.4 }}>
                                            {work.title}
                                          </span>
                                          <span style={{ fontSize:9, color:"var(--text-faint)" }}>— {hours}ч</span>
                                        </div>
                                        <div style={{ height:2, background:"var(--border)", borderRadius:2, overflow:"hidden", maxWidth:120 }}>
                                          <div className="pf" style={{ height:"100%", width:`${pct}%`, background:work.color, borderRadius:2, opacity:0.7 }} />
                                        </div>
                                      </div>
                                      <button onClick={e => { e.stopPropagation(); setWorkEdit(isEditing ? null : { workId: work.id, date: day.date, value: hours }); }}
                                        style={{ background:"none", border:"none", cursor:"pointer", fontSize:11, color:"var(--text-muted)", padding:"2px 4px", flexShrink:0, lineHeight:1 }}
                                        title="Скорректировать часы">✏️</button>
                                      {isEditing && (
                                        <div style={{ display:"flex", alignItems:"center", gap:4 }} onClick={e => e.stopPropagation()}>
                                          <input type="number" min="0" max="12" step="0.5"
                                            value={workEdit.value}
                                            onChange={e => setWorkEdit(prev => ({ ...prev, value: +e.target.value }))}
                                            style={{ width:48, padding:"2px 4px", borderRadius:4, border:"1px solid var(--border)", background:"var(--bg-elevated)", color:"var(--text-primary)", fontSize:11, fontFamily:"inherit" }} />
                                          <button onClick={() => { setWeekOverride(getWeekKeyStr(day.date), work.id, workEdit.value); setWorkEdit(null); }}
                                            style={{ padding:"2px 8px", borderRadius:4, border:"none", background:work.color, color:"#000", fontSize:10, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>✓</button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}

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

                        </>}
                      </div>
                    )}
                  </div>
                );
            };

            return (
            <div style={{ display:"grid", gap:8 }}>

              {/* View switcher */}
              <div style={{ display:"flex", gap:4, marginBottom:2 }}>
                {[["📅 Месяц","month"],["📆 Неделя","week"]].map(([label, v]) => (
                  <button key={v} onClick={() => switchCalendarView(v)}
                    style={{ padding:"5px 12px", fontSize:11, cursor:"pointer", fontFamily:"inherit",
                      borderRadius:6, border:"1px solid var(--border)",
                      background: calendarView === v ? "var(--bg-elevated)" : "transparent",
                      color: calendarView === v ? "var(--text-primary)" : "var(--text-muted)",
                      fontWeight: calendarView === v ? 600 : 400 }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* ── MONTH MODE ── */}
              {calendarView === "month" && <>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                  <button style={prevMonth ? btnBase : btnDisabled} disabled={!prevMonth}
                    onClick={() => prevMonth && goMonth(prevMonth)}>←</button>
                  <span style={{ flex:1, textAlign:"center", fontSize:13, fontWeight:600,
                    color:"var(--text-primary)" }}>{monthLabel}</span>
                  <button style={nextMonth ? btnBase : btnDisabled} disabled={!nextMonth}
                    onClick={() => nextMonth && goMonth(nextMonth)}>→</button>
                </div>
                <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4, paddingLeft:2 }}>
                  Выполнено в {RU_MONTHS[mo - 1].toLowerCase()}:{" "}
                  <span style={{ color:"var(--text-primary)" }}>{monthDone} / {monthTotal}</span> задач · {monthPct}%
                </div>
                {activeDays.map(renderDayCard)}
              </>}

              {/* ── WEEK MODE ── */}
              {calendarView === "week" && <>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                  <button style={canGoPrev ? btnBase : btnDisabled} disabled={!canGoPrev}
                    onClick={() => canGoPrev && goWeek(prevWeekStart)}>←</button>
                  <span style={{ flex:1, textAlign:"center", fontSize:13, fontWeight:600,
                    color:"var(--text-primary)" }}>{weekLabel}</span>
                  <button style={{ ...btnBase, fontSize:11, padding:"4px 8px" }}
                    onClick={goToday}>Сегодня</button>
                  <button style={canGoNext ? btnBase : btnDisabled} disabled={!canGoNext}
                    onClick={() => canGoNext && goWeek(nextWeekStart)}>→</button>
                </div>
                <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4, paddingLeft:2 }}>
                  📚 {weekStats.studyH}ч учёбы · 💻 {weekStats.workH}ч работы · ✅ {weekStats.tasksDone} задач · 🔥 {streak}
                </div>
                <div className="week-scroll" style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
                  {weekDays.map(day => (
                    <div key={day.date} style={{ minWidth:260, flex:"0 0 260px" }}>
                      {renderDayCard(day)}
                    </div>
                  ))}
                </div>
              </>}

            </div>
            );
          })()}

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
            const ACH_COLOR    = { sql_master:"#FFD93D", kafka_producer:"#FF8C42", container_queen:"#22D3EE", architect:"#F9A8D4", streak_7:"#FF6B6B", bookworm:"#4ADE80", sprint_slayer:"#818CF8", week_warrior:"#22D3EE" };
            const currIdx      = LEVEL_IDS.indexOf(level.id);
            const fromColor    = LEVEL_COLOR[level.id];
            const toColor      = LEVEL_COLOR[LEVEL_IDS[currIdx + 1]] ?? fromColor;
            const totalDoneH   = TASKS.filter(t => completed.has(t.id)).reduce((s, t) => s + t.est, 0);
            const totalWorkDoneH = (() => {
              let h = 0;
              for (const work of recurringWork) {
                for (const alloc of Object.values(allWeekAllocations)) {
                  const dateMap = alloc[work.id] || {};
                  for (const [dateStr, hours] of Object.entries(dateMap)) {
                    if (completedWorkBlocks.has(`${work.id}_${dateStr}`)) h += hours;
                  }
                }
              }
              return Math.round(h * 10) / 10;
            })();

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
                    ["📖", Math.round(totalDoneH * 10) / 10 + "ч", "изучено"],
                    ["💼", totalWorkDoneH + "ч", "рабочих часов"],
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

          {/* ── TAB: ANALYTICS ── */}
          <Suspense fallback={<div style={{ color:"var(--text-faint)", fontSize:12, padding:24 }}>Загрузка...</div>}>
          {tab === "analytics" && (() => {
            const completedCount = analyticsData.summary.completionRate > 0
              || analyticsData.summary.totalHoursLearned > 0
              || analyticsData.summary.totalHoursWorked > 0
              ? 1 : 0;

            if (completedCount === 0) {
              return (
                <div style={{ textAlign:"center", padding:"60px 20px" }}>
                  <div style={{ fontSize:64, marginBottom:16 }}>📊</div>
                  <div style={{ fontSize:14, color:"var(--text-muted)" }}>
                    Начни выполнять задачи — здесь появится твоя аналитика
                  </div>
                </div>
              );
            }

            const activeDaysCount = (analyticsData.dailyActivity ?? [])
              .filter(d => d.hoursLearned + d.hoursWorked > 0).length;

            return (
              <div style={{ display:"flex", flexDirection:"column", gap:28, paddingBottom:32 }}>

                {/* 1. Summary cards */}
                <SummaryStats
                  summary={analyticsData.summary}
                  weeklyProgress={analyticsData.weeklyProgress}
                  theme={theme}
                />

                {/* 2. Weekly + category charts */}
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:"var(--text-muted)",
                    textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>
                    Прогресс обучения
                  </div>
                  {/* Pass only weeklyProgress + categoryProgress — heatmap rendered separately */}
                  <AnalyticsCharts
                    data={{ ...analyticsData, dailyActivity: [] }}
                    theme={theme}
                  />
                </div>

                {/* 3. Activity heatmap */}
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:"var(--text-muted)",
                    textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>
                    Активность
                  </div>
                  <AnalyticsCharts
                    data={{ weeklyProgress:[], categoryProgress:[], dailyActivity: analyticsData.dailyActivity, readingProgress:[] }}
                    theme={theme}
                  />
                  <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:8 }}>
                    Всего активных дней: {activeDaysCount}
                  </div>
                </div>

                {/* 4. Books */}
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:"var(--text-muted)",
                    textTransform:"uppercase", letterSpacing:1, marginBottom:14 }}>
                    Книги
                  </div>
                  <ReadingProgressPanel data={analyticsData} theme={theme} />
                </div>

              </div>
            );
          })()}
          </Suspense>
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
      <AddProjectModal
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        onSave={addProject}
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
