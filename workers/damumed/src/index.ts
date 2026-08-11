import { log } from "./log.js";
import { login } from "./commands/login.js";
import { discover } from "./commands/discover.js";
import { parse } from "./commands/parse.js";
import { run } from "./commands/run.js";

const commands = {
  login: () => login(),
  discover: (args: string[]) => discover(args),
  parse: (args: string[]) => parse(args).then(() => undefined),
  run: (args: string[]) => run(args),
};

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const handler = commands[command as keyof typeof commands];

  if (!handler) {
    console.log(
      [
        "Внешний воркер DamuMed для AI Dos",
        "",
        "  npm run login              вход руками, сохранение сессии",
        "  npm run discover [график]  выгрузка структуры страниц для правки ui.ts",
        "  npm run parse [дд.мм.гггг] [--slots]   снять расписание и свободное время",
        "  npm run run:dry            один прогон очереди без сохранения в МИС",
        "  npm run run:once           один прогон очереди",
        "  npm run run                непрерывный цикл",
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  await handler(args);
}

main().catch((error) => {
  log.error("воркер остановлен", { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
