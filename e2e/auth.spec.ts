import { test, expect } from "@playwright/test";

const email = process.env.E2E_ADMIN_EMAIL ?? "";
const password = process.env.E2E_ADMIN_PASSWORD ?? "";

test("una ruta protegida redirige a /login sin sesión", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("login correcto lleva al dashboard", async ({ page }) => {
  test.skip(!email || !password, "Faltan E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD en .env");

  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
