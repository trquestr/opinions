// Поля, которые на запрос навешивает наш код. `user` положит будущий AuthModule (сессия → пользователь).
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
      user?: unknown;
    }
  }
}

export {};
