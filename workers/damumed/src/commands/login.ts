import { config } from "../config.js";
import { log } from "../log.js";
import { openSession } from "../session.js";
import { LABELS } from "../ui.js";

/**
 * Вход выполняет человек своими руками в открытом браузере, после чего мы
 * сохраняем только cookies сессии. Пароль не хранится ни в переменных
 * окружения, ни на диске — и двухфакторная проверка, если её включат, тоже
 * не ломает воркер.
 */
export async function login() {
  const session = await openSession({ headless: false });
  try {
    await session.page.goto(config.baseUrl, { waitUntil: "domcontentloaded" });
    log.info("откройте окно браузера и войдите в DamuMed под учётной записью клиники");

    await session.page
      .getByText(LABELS.menuBooking, { exact: false })
      .first()
      .waitFor({ state: "visible", timeout: 10 * 60_000 });

    await session.context.storageState({ path: config.storageStatePath });
    log.info("сессия сохранена", { path: config.storageStatePath });
    log.info("файл содержит действующие cookies — храните его как секрет");
  } finally {
    await session.close();
  }
}
