/**
 * 2, 4, 8, 16, 32 минуты. Общая кривая для доставки уведомлений и переноса
 * записей в МИС: обе ждут восстановления чужого сервиса, а не нашего.
 */
export function exponentialBackoffMs(attempt: number, maxAttempt = 5) {
  const bounded = Math.min(Math.max(attempt, 1), maxAttempt);
  return 2 ** bounded * 60_000;
}
