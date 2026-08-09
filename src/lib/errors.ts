import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message = code,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "validation_error",
          message: error.issues[0]?.message || "Проверьте введённые данные.",
          fields: error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  if (error instanceof AppError) {
    return Response.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof Error && error.message === "database_not_configured") {
    return Response.json(
      {
        ok: false,
        error: {
          code: "database_not_configured",
          message: "База данных ещё не подключена.",
        },
      },
      { status: 503 },
    );
  }

  console.error("Unhandled API error", error);
  return Response.json(
    {
      ok: false,
      error: {
        code: "internal_error",
        message: "Не удалось выполнить запрос. Попробуйте ещё раз.",
      },
    },
    { status: 500 },
  );
}
