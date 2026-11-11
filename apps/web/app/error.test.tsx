import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ErrorPage from "./error";
import GlobalError from "./global-error";
import NotFound from "./not-found";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("error.tsx", () => {
  it("показывает сообщение, логирует ошибку и вызывает retry по клику", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    const err = new Error("boom");
    render(<ErrorPage error={err} retry={retry} />);
    expect(screen.getByText("Что-то пошло не так")).toBeTruthy();
    expect(spy).toHaveBeenCalledWith(err);
    fireEvent.click(screen.getByRole("button", { name: "Попробовать снова" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("global-error.tsx", () => {
  it("рендерит сообщение и вызывает retry по клику", () => {
    // Глушим и лог ошибки, и предупреждение валидации DOM про <html> внутри контейнера.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    render(<GlobalError error={new Error("fatal")} retry={retry} />);
    expect(spy).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Попробовать снова" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("not-found.tsx", () => {
  it("содержит ссылку на главную", () => {
    render(<NotFound />);
    expect(screen.getByText("Страница не найдена")).toBeTruthy();
    expect(screen.getByRole("link", { name: "На главную" }).getAttribute("href")).toBe("/");
  });
});
