import { z } from "zod";

const password = z
  .string()
  .min(10, "Минимум 10 символов")
  .max(128, "Слишком длинный пароль")
  .regex(/[A-Za-zА-Яа-яЁё]/, "Добавьте букву")
  .regex(/[0-9]/, "Добавьте цифру");

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Укажите корректный email"),
  password: z.string().min(1, "Введите пароль").max(128),
});

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Укажите имя").max(120),
  clinicName: z.string().trim().min(2, "Укажите клинику").max(160),
  email: z.string().trim().toLowerCase().email("Укажите корректный email"),
  password,
  consent: z.literal(true, {
    error: "Подтвердите согласие с условиями обработки данных",
  }),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
