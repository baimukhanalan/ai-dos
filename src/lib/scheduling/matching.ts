const dayMs = 86_400_000;

export type CandidateSlot = { startsAt: string; durationMinutes: number };

export type MatchWindow = {
  preferredFrom: string | null;
  preferredTo: string | null;
};

export function offerTtlMinutes() {
  const configured = Number(process.env.WAITLIST_OFFER_TTL_MINUTES);
  return Number.isFinite(configured) && configured >= 15 && configured <= 1440
    ? Math.round(configured)
    : 120;
}

/**
 * Первый слот, который попадает в окно пациента, ещё не обещан другому
 * человеку в этом же прогоне и оставляет время доехать до клиники.
 */
export function selectOfferSlot(
  slots: CandidateSlot[],
  window: MatchWindow,
  options: {
    taken?: Set<string>;
    doctorId?: string;
    leadMinutes?: number;
    now?: number;
  } = {},
): CandidateSlot | null {
  const now = options.now ?? Date.now();
  const leadMs = (options.leadMinutes ?? 90) * 60_000;
  const from = window.preferredFrom ? new Date(window.preferredFrom).getTime() : null;
  const to = window.preferredTo ? new Date(window.preferredTo).getTime() : null;

  for (const slot of slots) {
    const start = new Date(slot.startsAt).getTime();
    if (Number.isNaN(start)) continue;
    if (start < now + leadMs) continue;
    if (from !== null && !Number.isNaN(from) && start < from) continue;
    if (to !== null && !Number.isNaN(to) && start > to) continue;
    const key = `${options.doctorId || ""}|${slot.startsAt}`;
    if (options.taken?.has(key)) continue;
    options.taken?.add(key);
    return slot;
  }
  return null;
}

/** Горизонт поиска ограничен окном пациента, но не больше двух недель. */
export function searchDays(window: MatchWindow, now = Date.now()) {
  if (!window.preferredTo) return 7;
  const target = new Date(window.preferredTo).getTime();
  if (Number.isNaN(target) || target <= now) return 1;
  return Math.min(14, Math.max(1, Math.ceil((target - now) / dayMs)));
}
