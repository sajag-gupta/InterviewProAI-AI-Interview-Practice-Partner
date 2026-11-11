import { expect, test, type Page } from "@playwright/test";

const ANSWER_1 = "I have five years of experience building web services with Node and React at two startups.";
const ANSWER_2 = "When our checkout broke, I led the fix, rolled back the deploy and cut errors by 40 percent.";

async function signUp(page: Page, name = "Test User") {
  const email = `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  await page.goto("/auth");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`Hi, ${name.split(" ")[0]}`);
  return email;
}

async function startInterview(page: Page, mode: "Type" | "Speak" = "Type") {
  await page.getByRole("link", { name: "New interview" }).first().click();
  await page.getByLabel("Product manager").check({ force: true });
  if (mode === "Speak") await page.getByLabel("Speak").check({ force: true });
  await page.getByRole("button", { name: "Start interview" }).click();
  await expect(page).toHaveURL(/\/app\/interview\//);
  await expect(page.getByRole("log")).toContainText("tell me about yourself");
}

async function answer(page: Page, text: string) {
  await page.getByLabel("Your answer").fill(text);
  await page.getByRole("button", { name: "Send answer" }).click();
  await expect(page.getByRole("log")).toContainText(text.slice(0, 30));
}

test("landing page explains the product and routes to sign up", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Practice interviews");
  await page.getByRole("main").getByRole("link", { name: /Create an account/ }).first().click();
  await expect(page).toHaveURL(/\/auth/);
});

test("full flow: sign up, interview, report, history, dashboard", async ({ page }) => {
  await signUp(page);
  await expect(page.getByText("Run your first interview")).toBeVisible();

  await startInterview(page);
  await answer(page, ANSWER_1);
  await expect(page.getByRole("log")).toContainText("?", { timeout: 15_000 });
  await answer(page, ANSWER_2);

  await page.getByRole("button", { name: "End interview" }).click();
  await page.getByRole("button", { name: "End and score" }).click();

  await expect(page).toHaveURL(/\/app\/interviews\/.+/, { timeout: 20_000 });
  await expect(page.getByRole("img", { name: /Overall score/ })).toBeVisible();
  await expect(page.getByText("Question by question")).toBeVisible();
  await expect(page.getByTestId("question-0")).toBeVisible();
  await expect(page.getByText("Filler words")).toBeVisible();

  await page.getByRole("link", { name: "History" }).click();
  await expect(page.getByRole("main").getByRole("link", { name: /Product manager/ })).toBeVisible();

  await page.getByRole("link", { name: "Dashboard" }).click();
  await expect(page.getByText("Score trend")).toBeVisible();
});

test("a refresh in the interview room resumes from the database", async ({ page }) => {
  await signUp(page);
  await startInterview(page);
  await answer(page, ANSWER_1);

  await page.reload();
  await expect(page.getByRole("log")).toContainText("five years of experience");
  await expect(page.getByRole("log")).toContainText("tell me about yourself");
});

test("chat commands work: /change role switches the interviewer", async ({ page }) => {
  await signUp(page);
  await startInterview(page);
  await page.getByLabel("Your answer").fill("/change role DevOps");
  await page.getByRole("button", { name: "Send answer" }).click();
  await expect(page.getByRole("log")).toContainText("Switching to DevOps questions");
});

test("sign-in errors are shown, and signed-out users are redirected", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/auth/);
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill("whatever-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("incorrect");
});

test.describe("voice mode", () => {
  test.skip(!process.env.DEEPGRAM_API_KEY, "needs DEEPGRAM_API_KEY");
  test.use({ permissions: ["microphone"] });

  test("microphone opens by itself after the interviewer speaks", async ({ page }) => {
    await signUp(page);
    await startInterview(page, "Speak");
    await expect(page.getByRole("button", { name: "Begin" })).toBeVisible();
    await page.getByRole("button", { name: "Begin" }).click();
    await expect(page.getByText("Your turn. Speak now")).toBeVisible({ timeout: 25_000 });
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Paused" })).toBeVisible();
  });
});
