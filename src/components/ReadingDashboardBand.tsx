import React, { useState } from 'react';
import {
  Bell,
  BellOff,
  CalendarClock,
  CheckCircle2,
  Flame,
  LogIn,
  LogOut,
  Plus,
  Sparkles,
  Target,
} from 'lucide-react';
import { useAppAuth } from '../contexts/AppAuthContext';
import { WeekDayKey } from '../types/ebook';
import { WEEKDAY_ORDER } from '../utils/storage';

const MINUTE_PRESETS = [10, 20, 30, 45, 60];
const PAGE_PRESETS = [5, 10, 20, 30, 50];

function formatTimeLabel(hhmm: string): string {
  const [hRaw, mRaw] = hhmm.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export const ReadingDashboardBand: React.FC = () => {
  const {
    user,
    isSigningIn,
    authError,
    signInWithGoogle,
    signOutGoogle,
    aiStatus,
    dailyGoal,
    updateDailyGoalConfig,
    logReadingProgress,
    weeklySchedule,
    updateScheduleSlot,
    applyTimeToEnabledDays,
    enableScheduleNotifications,
    scheduleReminder,
  } = useAppAuth();

  const [selectedDay, setSelectedDay] = useState<WeekDayKey>(() => {
    const jsMap: WeekDayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    return jsMap[new Date().getDay()] ?? 'mon';
  });

  const [customTargetInput, setCustomTargetInput] = useState<string>(String(dailyGoal.target));

  // Progress Ring Math
  const isMinutes = dailyGoal.goalType === 'minutes';
  const completed = isMinutes ? dailyGoal.minutesCompleted : dailyGoal.pagesCompleted;
  const target = Math.max(1, dailyGoal.target);
  const ratio = Math.min(1, completed / target);
  const pct = Math.round(ratio * 100);
  const goalReached = completed >= target;

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - ratio);

  const presets = isMinutes ? MINUTE_PRESETS : PAGE_PRESETS;
  const activeSlot = weeklySchedule[selectedDay];
  const anyNotificationsOn = Object.values(weeklySchedule).some((s) => s.notificationsEnabled);

  return (
    <section
      id="reading-goals"
      className="max-w-7xl mx-auto px-6 pb-12 space-y-6"
      aria-label="Reading Goals, Weekly Schedule and AI Connection"
    >
      {/* Google Account & AI Engine Connection Strip */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] p-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'Google Reader'}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full border border-zinc-200 dark:border-zinc-700 shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {user
                ? `${user.displayName || 'Google Reader'} · Connected`
                : 'Connect Google to sync goals & activate Google Gemini AI'}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
              {user
                ? 'Reading goals, weekly reminders, Google Smooth Voice & Gemini AI features are synced.'
                : 'Sign in with Google to activate Gemini AI summaries, study flashcards, Q&A, and cloud goal sync.'}
            </p>
            {authError && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5 truncate">
                {authError}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Google Gemini AI Status Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-xs font-semibold text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>
              Google Gemini AI{' '}
              {user && aiStatus.geminiConfigured ? '· Active' : ''}
            </span>
          </div>

          {user ? (
            <button
              type="button"
              onClick={() => void signOutGoogle()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isSigningIn}
              onClick={() => void signInWithGoogle()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-900 text-white dark:bg-amber-500 dark:text-zinc-950 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{isSigningIn ? 'Signing in…' : 'Sign in with Google'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2-Column Dashboard: Daily Reading Goal Progress Ring + Weekly Reading Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Column 1: Daily Reading Goal & Progress Ring */}
        <div className="lg:col-span-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] p-6 flex flex-col justify-between gap-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                <Target className="w-3.5 h-3.5" />
                <span>Daily Reading Goal</span>
              </div>
              <h2 className="font-serif text-xl sm:text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                {goalReached ? 'Today’s goal complete' : 'Stay consistent every day'}
              </h2>
            </div>

            {/* Minutes vs Pages Toggle */}
            <div className="inline-flex p-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 shrink-0">
              {(['minutes', 'pages'] as const).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  onClick={() => {
                    const defaultTarget = unit === 'minutes' ? 20 : 15;
                    setCustomTargetInput(String(defaultTarget));
                    updateDailyGoalConfig({ goalType: unit, target: defaultTarget });
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                    dailyGoal.goalType === unit
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {unit}
                </button>
              ))}
            </div>
          </div>

          {/* SVG Progress Ring + Stats */}
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 108 108" aria-hidden="true">
                <circle
                  cx="54"
                  cy="54"
                  r={radius}
                  fill="none"
                  strokeWidth="9"
                  className="stroke-zinc-100 dark:stroke-zinc-800"
                />
                <circle
                  cx="54"
                  cy="54"
                  r={radius}
                  fill="none"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  className={`transition-all duration-500 ${
                    goalReached ? 'stroke-emerald-500' : 'stroke-amber-500'
                  }`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-mono text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                  {pct}%
                </span>
                <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  {isMinutes ? 'mins' : 'pages'}
                </span>
              </div>
            </div>

            <div className="flex-1 w-full space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-sm text-zinc-600 dark:text-zinc-400 tabular-nums">
                  <span className="font-mono text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                    {completed}
                  </span>{' '}
                  / {target} {isMinutes ? 'minutes' : 'pages'} today
                </div>

                <div className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 shrink-0">
                  {goalReached ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">Done</span>
                    </>
                  ) : (
                    <>
                      <Flame className="w-3.5 h-3.5" />
                      <span className="tabular-nums">{dailyGoal.streakDays || 1}d streak</span>
                    </>
                  )}
                </div>
              </div>

              {/* Preset Targets + Custom Input */}
              <div className="flex flex-wrap items-center gap-1.5">
                {presets.map((val) => {
                  const active = dailyGoal.target === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        setCustomTargetInput(String(val));
                        updateDailyGoalConfig({ target: val });
                      }}
                      className={`px-2.5 py-1 rounded-lg border text-xs font-mono tabular-nums transition-colors ${
                        active
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 font-semibold'
                          : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      {val}
                      {isMinutes ? 'm' : 'p'}
                    </button>
                  );
                })}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const parsed = Number(customTargetInput);
                    if (Number.isFinite(parsed) && parsed >= 1) {
                      updateDailyGoalConfig({ target: Math.min(600, Math.round(parsed)) });
                    }
                  }}
                  className="inline-flex items-center gap-1 ml-auto"
                >
                  <input
                    type="number"
                    min={1}
                    max={600}
                    aria-label="Custom daily reading target"
                    value={customTargetInput}
                    onChange={(e) => setCustomTargetInput(e.target.value)}
                    onBlur={() => {
                      const parsed = Number(customTargetInput);
                      if (Number.isFinite(parsed) && parsed >= 1) {
                        updateDailyGoalConfig({ target: Math.min(600, Math.round(parsed)) });
                      }
                    }}
                    className="w-16 px-2 py-1 text-xs font-mono tabular-nums rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">target</span>
                </form>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-zinc-500 dark:text-zinc-400">
              Auto-tracked as you read inside any eBook
            </span>
            <button
              type="button"
              onClick={() =>
                logReadingProgress(isMinutes ? { deltaMinutes: 5 } : { deltaPages: 2 })
              }
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>{isMinutes ? 'Log +5 min' : 'Log +2 pages'}</span>
            </button>
          </div>
        </div>

        {/* Column 2: Weekly Reading Schedule & Reminder Indicator */}
        <div className="lg:col-span-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12151E] p-6 flex flex-col justify-between gap-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <CalendarClock className="w-3.5 h-3.5" />
                <span>Weekly Reading Schedule</span>
              </div>
              <h2 className="font-serif text-xl sm:text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                Reserve quiet reading time
              </h2>
            </div>

            {/* Live 'Scheduled time' Reminder Indicator */}
            <div
              className={`px-3 py-1.5 rounded-xl border text-xs font-medium shrink-0 flex items-center gap-2 ${
                scheduleReminder.isDueNow
                  ? 'border-emerald-500/70 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                  : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  scheduleReminder.isDueNow
                    ? 'bg-emerald-500 animate-pulse'
                    : scheduleReminder.todayEnabled
                      ? 'bg-amber-500'
                      : 'bg-zinc-400'
                }`}
              />
              <span className="whitespace-nowrap">
                {scheduleReminder.isDueNow
                  ? 'Scheduled time · Now'
                  : `Scheduled: ${scheduleReminder.nextSessionLabel}`}
              </span>
            </div>
          </div>

          {/* 7 Weekday Schedule Grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAY_ORDER.map(({ key, short }) => {
              const slot = weeklySchedule[key];
              const isSelected = selectedDay === key;
              return (
                <div
                  key={key}
                  className={`rounded-xl border p-2 flex flex-col items-center gap-1.5 transition-all ${
                    isSelected
                      ? 'border-amber-500 ring-1 ring-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20'
                      : slot.enabled
                        ? 'border-zinc-300 dark:border-zinc-700 bg-zinc-50/70 dark:bg-zinc-900/60'
                        : 'border-zinc-200/80 dark:border-zinc-800/80 opacity-65'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedDay(key)}
                    className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 w-full text-center"
                  >
                    {short}
                  </button>
                  <button
                    type="button"
                    aria-label={`Toggle ${short} reading day`}
                    onClick={() => {
                      setSelectedDay(key);
                      updateScheduleSlot(key, { enabled: !slot.enabled });
                    }}
                    className={`w-7 h-4 rounded-full transition-colors flex items-center px-0.5 ${
                      slot.enabled
                        ? 'bg-emerald-500 justify-end'
                        : 'bg-zinc-300 dark:bg-zinc-700 justify-start'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full bg-white shadow-xs" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDay(key)}
                    className="text-[10px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400"
                  >
                    {slot.enabled ? slot.timeOfDay : 'Off'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Selected Day Time Picker + Gentle Push Notification Toggle */}
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {WEEKDAY_ORDER.find((w) => w.key === selectedDay)?.label} time:
              </span>
              <input
                type="time"
                value={activeSlot.timeOfDay}
                onChange={(e) =>
                  updateScheduleSlot(selectedDay, {
                    timeOfDay: e.target.value,
                    enabled: true,
                  })
                }
                className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                type="button"
                onClick={() => applyTimeToEnabledDays(activeSlot.timeOfDay)}
                className="text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:underline whitespace-nowrap"
              >
                Apply to active days
              </button>
            </div>

            <button
              type="button"
              onClick={() => void enableScheduleNotifications()}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors whitespace-nowrap ${
                anyNotificationsOn &&
                scheduleReminder.notificationsSupported &&
                scheduleReminder.notificationPermission === 'granted'
                  ? 'border-emerald-500/70 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
              title={
                scheduleReminder.notificationsSupported
                  ? `Reminder at ${formatTimeLabel(activeSlot.timeOfDay)}`
                  : 'Push notifications unavailable in this browser; indicator stays active'
              }
            >
              {anyNotificationsOn &&
              scheduleReminder.notificationsSupported &&
              scheduleReminder.notificationPermission === 'granted' ? (
                <>
                  <Bell className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Push Reminders On</span>
                </>
              ) : (
                <>
                  <BellOff className="w-3.5 h-3.5" />
                  <span>
                    {scheduleReminder.notificationsSupported
                      ? 'Enable Gentle Reminders'
                      : 'Scheduled Time Indicator'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
