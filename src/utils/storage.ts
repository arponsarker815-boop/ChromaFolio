import {
  DailyReadingGoalState,
  EbookDocument,
  ReaderSettings,
  WeekDayKey,
  WeeklyScheduleSlot,
} from '../types/ebook';

const DB_NAME = 'chromafolio-library-db';
const DB_VERSION = 1;
const BOOKS_STORE = 'ebooks';
const SETTINGS_KEY = 'chromafolio-reader-settings';
const DAILY_GOAL_KEY = 'chromafolio-daily-goal';
const WEEKLY_SCHEDULE_KEY = 'chromafolio-weekly-schedule';

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  layoutMode: 'spread',
  renderMode: 'reflow',
  font: 'serif',
  fontSize: 17,
  lineHeight: 1.72,
  letterSpacing: 'normal',
  textColorId: 'auto',
  customTextColor: '#1E293B',
  headingColorId: 'auto',
  customHeadingColor: '#B45309',
  vividness: 105,
  shellTheme: 'light',
  autoReadTurn: true,
  ttsRate: 1.0,
  voiceEngine: 'google-ai',
  googleVoiceName: 'Kore',
  aiProvider: 'gemini',
  bionicReading: false,
  readingRuler: false,
  autoHighlightImportant: true,
  physicalBookStyle: 'hardcover',
  pageFlipStyle: 'book3d',
  pageSoundStyle: 'paper',
  pageSoundVolume: 0.65,
  aiEnabled: true,
};

export function getTodayDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const DEFAULT_DAILY_GOAL: DailyReadingGoalState = {
  goalType: 'minutes',
  target: 20,
  dateKey: getTodayDateKey(),
  minutesCompleted: 0,
  pagesCompleted: 0,
  streakDays: 0,
};

export const WEEKDAY_ORDER: Array<{ key: WeekDayKey; short: string; label: string }> = [
  { key: 'mon', short: 'Mon', label: 'Monday' },
  { key: 'tue', short: 'Tue', label: 'Tuesday' },
  { key: 'wed', short: 'Wed', label: 'Wednesday' },
  { key: 'thu', short: 'Thu', label: 'Thursday' },
  { key: 'fri', short: 'Fri', label: 'Friday' },
  { key: 'sat', short: 'Sat', label: 'Saturday' },
  { key: 'sun', short: 'Sun', label: 'Sunday' },
];

export const DEFAULT_WEEKLY_SCHEDULE: Record<WeekDayKey, WeeklyScheduleSlot> = {
  mon: { dayKey: 'mon', enabled: true, timeOfDay: '20:00', notificationsEnabled: false },
  tue: { dayKey: 'tue', enabled: true, timeOfDay: '20:00', notificationsEnabled: false },
  wed: { dayKey: 'wed', enabled: true, timeOfDay: '20:00', notificationsEnabled: false },
  thu: { dayKey: 'thu', enabled: true, timeOfDay: '20:00', notificationsEnabled: false },
  fri: { dayKey: 'fri', enabled: true, timeOfDay: '20:00', notificationsEnabled: false },
  sat: { dayKey: 'sat', enabled: false, timeOfDay: '10:00', notificationsEnabled: false },
  sun: { dayKey: 'sun', enabled: false, timeOfDay: '10:00', notificationsEnabled: false },
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BOOKS_STORE)) {
        db.createObjectStore(BOOKS_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllStoredBooks(): Promise<EbookDocument[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(BOOKS_STORE, 'readonly');
      const store = tx.objectStore(BOOKS_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result as EbookDocument[]) ?? [];
        items.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveBookToStore(book: EbookDocument): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BOOKS_STORE, 'readwrite');
      const store = tx.objectStore(BOOKS_STORE);
      const req = store.put(book);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not persist eBook to IndexedDB:', err);
  }
}

export async function deleteBookFromStore(bookId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BOOKS_STORE, 'readwrite');
      const store = tx.objectStore(BOOKS_STORE);
      const req = store.delete(bookId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not delete eBook from IndexedDB:', err);
  }
}

export function loadReaderSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_READER_SETTINGS;
    return { ...DEFAULT_READER_SETTINGS, ...JSON.parse(raw), aiProvider: 'gemini' };
  } catch {
    return DEFAULT_READER_SETTINGS;
  }
}

export function saveReaderSettings(settings: ReaderSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function normalizeDailyGoalForToday(goal: DailyReadingGoalState): DailyReadingGoalState {
  const today = getTodayDateKey();
  if (goal.dateKey === today) return goal;
  const reachedYesterday =
    goal.goalType === 'minutes'
      ? goal.minutesCompleted >= goal.target
      : goal.pagesCompleted >= goal.target;
  return {
    ...goal,
    dateKey: today,
    minutesCompleted: 0,
    pagesCompleted: 0,
    streakDays: reachedYesterday ? goal.streakDays + 1 : goal.streakDays,
  };
}

export function loadDailyGoal(): DailyReadingGoalState {
  try {
    const raw = localStorage.getItem(DAILY_GOAL_KEY);
    if (!raw) return { ...DEFAULT_DAILY_GOAL, dateKey: getTodayDateKey() };
    const parsed = JSON.parse(raw) as Partial<DailyReadingGoalState>;
    return normalizeDailyGoalForToday({
      ...DEFAULT_DAILY_GOAL,
      ...parsed,
      dateKey: parsed.dateKey || getTodayDateKey(),
    });
  } catch {
    return { ...DEFAULT_DAILY_GOAL, dateKey: getTodayDateKey() };
  }
}

export function saveDailyGoal(goal: DailyReadingGoalState): void {
  try {
    localStorage.setItem(DAILY_GOAL_KEY, JSON.stringify(goal));
  } catch {
    // Ignore
  }
}

export function loadWeeklySchedule(): Record<WeekDayKey, WeeklyScheduleSlot> {
  try {
    const raw = localStorage.getItem(WEEKLY_SCHEDULE_KEY);
    if (!raw) return DEFAULT_WEEKLY_SCHEDULE;
    const parsed = JSON.parse(raw) as Partial<Record<WeekDayKey, WeeklyScheduleSlot>>;
    return {
      ...DEFAULT_WEEKLY_SCHEDULE,
      ...parsed,
    };
  } catch {
    return DEFAULT_WEEKLY_SCHEDULE;
  }
}

export function saveWeeklySchedule(schedule: Record<WeekDayKey, WeeklyScheduleSlot>): void {
  try {
    localStorage.setItem(WEEKLY_SCHEDULE_KEY, JSON.stringify(schedule));
  } catch {
    // Ignore
  }
}
