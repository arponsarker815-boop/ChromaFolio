import React, {
  Component,
  ErrorInfo,
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  AiProvider,
  DailyGoalType,
  DailyReadingGoalState,
  GoogleVoiceName,
  VoiceEngine,
  WeekDayKey,
  WeeklyScheduleSlot,
} from '../types/ebook';
import {
  OperationType,
  auth,
  db,
  googleAuthProvider,
  handleFirestoreError,
} from '../utils/firebase';
import {
  DEFAULT_WEEKLY_SCHEDULE,
  WEEKDAY_ORDER,
  getTodayDateKey,
  loadDailyGoal,
  loadWeeklySchedule,
  normalizeDailyGoalForToday,
  saveDailyGoal,
  saveWeeklySchedule,
} from '../utils/storage';

export interface AiBackendStatus {
  geminiConfigured: boolean;
}

export interface ScheduleReminderStatus {
  todayEnabled: boolean;
  todayTime: string;
  isDueNow: boolean;
  nextSessionLabel: string;
  notificationsSupported: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
}

interface AppAuthContextValue {
  user: User | null;
  authReady: boolean;
  isSigningIn: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<User | null>;
  signOutGoogle: () => Promise<void>;
  getAuthHeaders: () => Promise<Record<string, string>>;
  aiStatus: AiBackendStatus;
  preferredAiProvider: AiProvider;
  setPreferredAiProvider: (provider: AiProvider) => void;
  syncVoicePreferences: (engine: VoiceEngine, voiceName: GoogleVoiceName) => void;
  dailyGoal: DailyReadingGoalState;
  updateDailyGoalConfig: (patch: { goalType?: DailyGoalType; target?: number }) => void;
  logReadingProgress: (delta: { deltaMinutes?: number; deltaPages?: number }) => void;
  weeklySchedule: Record<WeekDayKey, WeeklyScheduleSlot>;
  updateScheduleSlot: (dayKey: WeekDayKey, patch: Partial<WeeklyScheduleSlot>) => void;
  applyTimeToEnabledDays: (timeOfDay: string) => void;
  enableScheduleNotifications: () => Promise<boolean>;
  scheduleReminder: ScheduleReminderStatus;
}

const AppAuthContext = createContext<AppAuthContextValue | null>(null);

const JS_DAY_TO_KEY: WeekDayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const NOTIFIED_STORAGE_KEY = 'chromafolio-last-notified-slot';

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function formatTime12h(hhmm: string): string {
  const [hRaw, mRaw] = hhmm.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export class FirebaseErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application boundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#F9F9F8] dark:bg-[#0B0D12] text-zinc-900 dark:text-zinc-100">
          <div className="max-w-md w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-3 shadow-lg">
            <h2 className="font-serif text-xl font-semibold">Something interrupted your session</h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 break-words">
              {this.state.message || 'An unexpected error occurred while syncing your study data.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold"
            >
              Reload Studio
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const AppAuthProvider: React.FC<{
  children: ReactNode;
  initialAiProvider: AiProvider;
  initialVoiceEngine: VoiceEngine;
  initialGoogleVoice: GoogleVoiceName;
  onSyncReaderPrefs?: (patch: {
    aiProvider?: AiProvider;
    voiceEngine?: VoiceEngine;
    googleVoiceName?: GoogleVoiceName;
  }) => void;
}> = ({
  children,
  initialAiProvider,
  initialVoiceEngine,
  initialGoogleVoice,
  onSyncReaderPrefs,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [aiStatus, setAiStatus] = useState<AiBackendStatus>({
    geminiConfigured: true,
  });
  const [preferredAiProvider, setPreferredAiProviderState] =
    useState<AiProvider>(initialAiProvider);
  const [dailyGoal, setDailyGoal] = useState<DailyReadingGoalState>(() => loadDailyGoal());
  const [weeklySchedule, setWeeklySchedule] = useState<Record<WeekDayKey, WeeklyScheduleSlot>>(
    () => loadWeeklySchedule()
  );
  const [nowTick, setNowTick] = useState(() => Date.now());

  const userRef = useRef<User | null>(null);
  userRef.current = user;
  const dailyGoalRef = useRef(dailyGoal);
  dailyGoalRef.current = dailyGoal;
  const scheduleRef = useRef(weeklySchedule);
  scheduleRef.current = weeklySchedule;

  // Fetch server AI provider readiness once
  useEffect(() => {
    fetch('/api/ai/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.geminiConfigured === 'boolean') {
          setAiStatus({
            geminiConfigured: Boolean(data.geminiConfigured),
          });
        }
      })
      .catch(() => {
        // Ignore network errors on status check
      });
  }, []);

  // Auth listener & user profile bootstrap
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);

      if (!firebaseUser || !firebaseUser.emailVerified) {
        return;
      }

      const profilePath = `users/${firebaseUser.uid}`;
      try {
        const profileRef = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(profileRef);
        const safeName = (firebaseUser.displayName || 'Reader').trim().slice(0, 120) || 'Reader';
        const safePhoto =
          firebaseUser.photoURL && firebaseUser.photoURL.length <= 500
            ? firebaseUser.photoURL
            : undefined;

        if (!snap.exists()) {
          await setDoc(profileRef, {
            uid: firebaseUser.uid,
            displayName: safeName,
            ...(safePhoto ? { photoURL: safePhoto } : {}),
            preferredAiProvider: initialAiProvider,
            preferredVoiceEngine: initialVoiceEngine,
            preferredGoogleVoice: initialGoogleVoice,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.warn('Could not initialize user profile:', err);
      }

      // Bootstrap daily goal doc if missing
      const goalPath = `users/${firebaseUser.uid}/goals/daily`;
      try {
        const goalRef = doc(db, 'users', firebaseUser.uid, 'goals', 'daily');
        const gSnap = await getDoc(goalRef);
        if (!gSnap.exists()) {
          const localG = normalizeDailyGoalForToday(loadDailyGoal());
          await setDoc(goalRef, {
            ownerId: firebaseUser.uid,
            goalType: localG.goalType,
            target: clampInt(localG.target, 1, 600),
            dateKey: localG.dateKey,
            minutesCompleted: clampInt(localG.minutesCompleted, 0, 1440),
            pagesCompleted: clampInt(localG.pagesCompleted, 0, 2000),
            streakDays: clampInt(localG.streakDays, 0, 36500),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, goalPath);
      }

      void profilePath;
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Firestore real-time listeners (strictly attached only when authenticated & verified)
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) return;

    const profilePath = `users/${user.uid}`;
    const unsubProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        const provider: AiProvider = 'gemini';
        const voiceEngine = d.preferredVoiceEngine === 'browser' ? 'browser' : 'google-ai';
        const googleVoiceName: GoogleVoiceName = ['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir'].includes(
          d.preferredGoogleVoice
        )
          ? d.preferredGoogleVoice
          : 'Kore';
        setPreferredAiProviderState(provider);
        onSyncReaderPrefs?.({ aiProvider: provider, voiceEngine, googleVoiceName });
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, profilePath);
      }
    );

    const goalPath = `users/${user.uid}/goals/daily`;
    const unsubGoal = onSnapshot(
      doc(db, 'users', user.uid, 'goals', 'daily'),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        const normalized = normalizeDailyGoalForToday({
          goalType: d.goalType === 'pages' ? 'pages' : 'minutes',
          target: clampInt(Number(d.target ?? 20), 1, 600),
          dateKey: typeof d.dateKey === 'string' ? d.dateKey : getTodayDateKey(),
          minutesCompleted: clampInt(Number(d.minutesCompleted ?? 0), 0, 1440),
          pagesCompleted: clampInt(Number(d.pagesCompleted ?? 0), 0, 2000),
          streakDays: clampInt(Number(d.streakDays ?? 0), 0, 36500),
        });
        setDailyGoal(normalized);
        saveDailyGoal(normalized);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, goalPath);
      }
    );

    const schedulesPath = `users/${user.uid}/schedules`;
    const unsubSchedules = onSnapshot(
      collection(db, 'users', user.uid, 'schedules'),
      (snap) => {
        if (snap.empty) return;
        setWeeklySchedule((prev) => {
          const next = { ...prev };
          snap.forEach((docSnap) => {
            const d = docSnap.data();
            const key = docSnap.id as WeekDayKey;
            if (key in DEFAULT_WEEKLY_SCHEDULE) {
              next[key] = {
                dayKey: key,
                enabled: Boolean(d.enabled),
                timeOfDay:
                  typeof d.timeOfDay === 'string' && /^[0-2][0-9]:[0-5][0-9]$/.test(d.timeOfDay)
                    ? d.timeOfDay
                    : prev[key].timeOfDay,
                notificationsEnabled: Boolean(d.notificationsEnabled),
              };
            }
          });
          saveWeeklySchedule(next);
          return next;
        });
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, schedulesPath);
      }
    );

    return () => {
      unsubProfile();
      unsubGoal();
      unsubSchedules();
    };
  }, [authReady, user, onSyncReaderPrefs]);

  // Background clock for live schedule status & gentle browser push notifications
  useEffect(() => {
    const checkSchedule = () => {
      const now = new Date();
      setNowTick(now.getTime());
      const dayKey = JS_DAY_TO_KEY[now.getDay()];
      const slot = scheduleRef.current[dayKey];
      if (!slot || !slot.enabled || !slot.notificationsEnabled) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const currentHHMM = `${hh}:${mm}`;
      const todayStamp = `${getTodayDateKey()}_${dayKey}_${slot.timeOfDay}`;

      if (currentHHMM === slot.timeOfDay) {
        const lastNotified = localStorage.getItem(NOTIFIED_STORAGE_KEY);
        if (lastNotified !== todayStamp) {
          localStorage.setItem(NOTIFIED_STORAGE_KEY, todayStamp);
          try {
            new Notification('ChromaFolio Reading Time', {
              body: `It's ${formatTime12h(slot.timeOfDay)} — open your colourful eBook to keep your reading streak alive.`,
            });
          } catch {
            // Ignore notification errors in restricted contexts
          }
        }
      }
    };

    checkSchedule();
    const timer = window.setInterval(checkSchedule, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<User | null> => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      return result.user;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setAuthError(msg);
      return null;
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOutGoogle = useCallback(async () => {
    await signOut(auth);
  }, []);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const current = userRef.current;
    if (!current) return {};
    try {
      const token = await current.getIdToken();
      return { Authorization: `Bearer ${token}` };
    } catch {
      return {};
    }
  }, []);

  const persistProfilePatch = useCallback(
    async (patch: {
      preferredAiProvider?: AiProvider;
      preferredVoiceEngine?: VoiceEngine;
      preferredGoogleVoice?: GoogleVoiceName;
    }) => {
      const current = userRef.current;
      if (!current || !current.emailVerified) return;
      const profilePath = `users/${current.uid}`;
      try {
        await updateDoc(doc(db, 'users', current.uid), {
          ...patch,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, profilePath);
      }
    },
    []
  );

  const setPreferredAiProvider = useCallback(
    (provider: AiProvider) => {
      setPreferredAiProviderState(provider);
      onSyncReaderPrefs?.({ aiProvider: provider });
      void persistProfilePatch({ preferredAiProvider: provider });
    },
    [onSyncReaderPrefs, persistProfilePatch]
  );

  const syncVoicePreferences = useCallback(
    (engine: VoiceEngine, voiceName: GoogleVoiceName) => {
      void persistProfilePatch({
        preferredVoiceEngine: engine,
        preferredGoogleVoice: voiceName,
      });
    },
    [persistProfilePatch]
  );

  const persistDailyGoal = useCallback(async (nextGoal: DailyReadingGoalState) => {
    const current = userRef.current;
    if (!current || !current.emailVerified) return;
    const path = `users/${current.uid}/goals/daily`;
    try {
      const ref = doc(db, 'users', current.uid, 'goals', 'daily');
      const snap = await getDoc(ref);
      const payload = {
        goalType: nextGoal.goalType,
        target: clampInt(nextGoal.target, 1, 600),
        dateKey: nextGoal.dateKey,
        minutesCompleted: clampInt(nextGoal.minutesCompleted, 0, 1440),
        pagesCompleted: clampInt(nextGoal.pagesCompleted, 0, 2000),
        streakDays: clampInt(nextGoal.streakDays, 0, 36500),
        updatedAt: serverTimestamp(),
      };
      if (snap.exists()) {
        await updateDoc(ref, payload);
      } else {
        await setDoc(ref, { ownerId: current.uid, ...payload });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }, []);

  const updateDailyGoalConfig = useCallback(
    (patch: { goalType?: DailyGoalType; target?: number }) => {
      const base = normalizeDailyGoalForToday(dailyGoalRef.current);
      const next: DailyReadingGoalState = {
        ...base,
        goalType: patch.goalType ?? base.goalType,
        target: patch.target !== undefined ? clampInt(patch.target, 1, 600) : base.target,
      };
      setDailyGoal(next);
      saveDailyGoal(next);
      void persistDailyGoal(next);
    },
    [persistDailyGoal]
  );

  const logReadingProgress = useCallback(
    (delta: { deltaMinutes?: number; deltaPages?: number }) => {
      const base = normalizeDailyGoalForToday(dailyGoalRef.current);
      const next: DailyReadingGoalState = {
        ...base,
        minutesCompleted: clampInt(base.minutesCompleted + (delta.deltaMinutes ?? 0), 0, 1440),
        pagesCompleted: clampInt(base.pagesCompleted + (delta.deltaPages ?? 0), 0, 2000),
      };
      setDailyGoal(next);
      saveDailyGoal(next);
      void persistDailyGoal(next);
    },
    [persistDailyGoal]
  );

  const persistScheduleSlot = useCallback(async (slot: WeeklyScheduleSlot) => {
    const current = userRef.current;
    if (!current || !current.emailVerified) return;
    const path = `users/${current.uid}/schedules/${slot.dayKey}`;
    try {
      const ref = doc(db, 'users', current.uid, 'schedules', slot.dayKey);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, {
          enabled: slot.enabled,
          timeOfDay: slot.timeOfDay,
          notificationsEnabled: slot.notificationsEnabled,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(ref, {
          ownerId: current.uid,
          dayKey: slot.dayKey,
          enabled: slot.enabled,
          timeOfDay: slot.timeOfDay,
          notificationsEnabled: slot.notificationsEnabled,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }, []);

  const updateScheduleSlot = useCallback(
    (dayKey: WeekDayKey, patch: Partial<WeeklyScheduleSlot>) => {
      const currentSlot = scheduleRef.current[dayKey];
      const nextSlot: WeeklyScheduleSlot = {
        ...currentSlot,
        ...patch,
        dayKey,
        timeOfDay:
          patch.timeOfDay && /^[0-2][0-9]:[0-5][0-9]$/.test(patch.timeOfDay)
            ? patch.timeOfDay
            : currentSlot.timeOfDay,
      };
      const nextMap = { ...scheduleRef.current, [dayKey]: nextSlot };
      setWeeklySchedule(nextMap);
      saveWeeklySchedule(nextMap);
      void persistScheduleSlot(nextSlot);
    },
    [persistScheduleSlot]
  );

  const applyTimeToEnabledDays = useCallback(
    (timeOfDay: string) => {
      if (!/^[0-2][0-9]:[0-5][0-9]$/.test(timeOfDay)) return;
      const nextMap = { ...scheduleRef.current };
      const changed: WeeklyScheduleSlot[] = [];
      for (const { key } of WEEKDAY_ORDER) {
        if (nextMap[key].enabled) {
          nextMap[key] = { ...nextMap[key], timeOfDay };
          changed.push(nextMap[key]);
        }
      }
      setWeeklySchedule(nextMap);
      saveWeeklySchedule(nextMap);
      changed.forEach((slot) => void persistScheduleSlot(slot));
    },
    [persistScheduleSlot]
  );

  const enableScheduleNotifications = useCallback(async (): Promise<boolean> => {
    const supported = typeof window !== 'undefined' && 'Notification' in window;
    let granted = false;
    if (supported) {
      const perm =
        Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission();
      granted = perm === 'granted';
    }
    const toggleTarget = !Object.values(scheduleRef.current).some((s) => s.notificationsEnabled);
    const nextValue = supported ? (granted ? toggleTarget : false) : toggleTarget;

    const nextMap = { ...scheduleRef.current };
    for (const { key } of WEEKDAY_ORDER) {
      nextMap[key] = { ...nextMap[key], notificationsEnabled: nextValue };
      void persistScheduleSlot(nextMap[key]);
    }
    setWeeklySchedule(nextMap);
    saveWeeklySchedule(nextMap);
    return nextValue;
  }, [persistScheduleSlot]);

  const scheduleReminder = useMemo<ScheduleReminderStatus>(() => {
    const now = new Date(nowTick);
    const todayIdx = now.getDay();
    const todayKey = JS_DAY_TO_KEY[todayIdx];
    const todaySlot = weeklySchedule[todayKey];
    const [hh, mm] = (todaySlot?.timeOfDay || '20:00').split(':').map(Number);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const slotMinutes = (hh || 0) * 60 + (mm || 0);
    const isDueNow =
      Boolean(todaySlot?.enabled) && Math.abs(nowMinutes - slotMinutes) <= 20;

    let nextSessionLabel = 'No reading days scheduled';
    if (todaySlot?.enabled && slotMinutes >= nowMinutes - 20) {
      nextSessionLabel = isDueNow
        ? `Scheduled now (${formatTime12h(todaySlot.timeOfDay)})`
        : `Today at ${formatTime12h(todaySlot.timeOfDay)}`;
    } else {
      for (let offset = 1; offset <= 7; offset++) {
        const idx = (todayIdx + offset) % 7;
        const k = JS_DAY_TO_KEY[idx];
        const s = weeklySchedule[k];
        if (s?.enabled) {
          const dayMeta = WEEKDAY_ORDER.find((w) => w.key === k);
          nextSessionLabel = `${offset === 1 ? 'Tomorrow' : dayMeta?.short || k} at ${formatTime12h(
            s.timeOfDay
          )}`;
          break;
        }
      }
    }

    const notificationsSupported = typeof window !== 'undefined' && 'Notification' in window;
    const notificationPermission: NotificationPermission | 'unsupported' = notificationsSupported
      ? Notification.permission
      : 'unsupported';

    return {
      todayEnabled: Boolean(todaySlot?.enabled),
      todayTime: todaySlot?.timeOfDay || '20:00',
      isDueNow,
      nextSessionLabel,
      notificationsSupported,
      notificationPermission,
    };
  }, [weeklySchedule, nowTick]);

  const value: AppAuthContextValue = {
    user,
    authReady,
    isSigningIn,
    authError,
    signInWithGoogle,
    signOutGoogle,
    getAuthHeaders,
    aiStatus,
    preferredAiProvider,
    setPreferredAiProvider,
    syncVoicePreferences,
    dailyGoal,
    updateDailyGoalConfig,
    logReadingProgress,
    weeklySchedule,
    updateScheduleSlot,
    applyTimeToEnabledDays,
    enableScheduleNotifications,
    scheduleReminder,
  };

  return <AppAuthContext.Provider value={value}>{children}</AppAuthContext.Provider>;
};

export function useAppAuth(): AppAuthContextValue {
  const ctx = useContext(AppAuthContext);
  if (!ctx) {
    throw new Error('useAppAuth must be used inside AppAuthProvider');
  }
  return ctx;
}
