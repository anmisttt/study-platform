import { expect, test, type Page } from "@playwright/test";

async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("browser-test-password-123");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  const messages = await (await page.request.get(`/api/__test/emails?email=${encodeURIComponent(email)}`)).json();
  const link = messages.at(-1).text.split(" ").at(-1);
  await page.goto(link);
  await expect(page.getByText("Email verified. You can now sign in.")).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("browser-test-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
}

test("verified account manages its profile, key, rooms and shared progress", async ({ page, browser }, testInfo) => {
  const email = `owner-${Date.now()}@example.com`;
  await register(page, email);
  await expect(page.getByRole("link", { name: "Profile" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Profile" }).locator("svg")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Personal details" })).toHaveCount(0);
  await expect(page.getByLabel("Name")).toHaveCount(0);
  await page.getByLabel("API key", { exact: true }).fill("sk-browser-owner-private-123456");
  await page.getByRole("button", { name: "Save key", exact: true }).click();
  await expect(page.getByText("Saved key ending in 3456")).toBeVisible();
  await expect(page.getByLabel("Replace API key")).toHaveValue("");
  await page.goto("/chapters/1/overview");
  await page.getByRole("button", { name: "Generate new room" }).click();
  await expect(page.getByRole("heading", { name: "Theory 1", exact: true })).toBeVisible();
  const roomUrl = page.url();
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(roomUrl);
  await expect(guestPage.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await guestPage.getByPlaceholder("Type your answer in any language...").fill("A thoughtful answer written by a guest participant.");
  await guestPage.getByRole("button", { name: "Check", exact: true }).click();
  await expect(guestPage.getByText("4/5 · Good")).toBeVisible();
  await page.goto("/profile");
  await expect(page.locator(".room-summary")).toHaveCount(1);
  await expect(page.locator(".room-summary")).toContainText("Average 4.0/5");
  await page.screenshot({ path: testInfo.outputPath("profile-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("profile-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Remove key" }).click();
  await expect(page.getByText("No key saved")).toBeVisible();
  await guestPage.getByRole("button", { name: "Try again" }).click();
  await expect(guestPage.getByRole("button", { name: "Check", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete this room for everyone?" });
  await expect(deleteDialog).toBeVisible();
  await expect(deleteDialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("delete-room-desktop.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(deleteDialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(deleteDialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("delete-room-mobile.png"), fullPage: true });
  await deleteDialog.getByRole("button", { name: "Delete for everyone" }).click();
  await expect(deleteDialog).not.toBeVisible();
  await expect(page.getByText(/Your rooms will appear here/)).toBeVisible();
  await expect(guestPage.getByText("This room has been deleted.")).toBeVisible();
  await guest.close();
});

test("registration screen offers all sign-in methods at mobile width", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("register-mobile.png"), fullPage: true });
});

test("sign-in returns to the current question and preserves its draft", async ({ page, browser }) => {
  const ownerEmail = `draft-owner-${Date.now()}@example.com`;
  await register(page, ownerEmail);
  await page.goto("/chapters/1/overview");
  await page.getByRole("button", { name: "Generate new room" }).click();
  await expect(page.getByRole("heading", { name: "Theory 1", exact: true })).toBeVisible();
  const roomUrl = page.url();
  const participant = await browser.newContext(); const participantPage = await participant.newPage();
  const email = `participant-${Date.now()}@example.com`;
  await register(participantPage, email);
  await participantPage.getByRole("button", { name: "Sign out" }).click();
  await participantPage.goto(roomUrl);
  await participantPage.getByPlaceholder("Type your answer in any language...").fill("Keep this unfinished draft while I sign in.");
  await participantPage.getByRole("link", { name: "Sign in", exact: true }).click();
  await participantPage.getByLabel("Email", { exact: true }).fill(email);
  await participantPage.getByLabel("Password", { exact: true }).fill("browser-test-password-123");
  await participantPage.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(participantPage).toHaveURL(roomUrl);
  await expect(participantPage.getByPlaceholder("Type your answer in any language...")).toHaveValue("Keep this unfinished draft while I sign in.");
  await expect(participantPage.getByText("Room saved to your profile.")).toBeVisible();
  await participantPage.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(participantPage.locator(".room-summary")).toHaveCount(1);
  await expect(participantPage.locator(".room-summary .room-role")).toHaveText("Participant");
  await expect(participantPage.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await participant.close();
});

test("signed-in participants keep overview and question links in their profile with role filters", async ({ page, browser }, testInfo) => {
  await register(page, `participation-owner-${Date.now()}@example.com`);
  await page.goto("/chapters/1/overview");
  await page.getByRole("button", { name: "Generate new room" }).click();
  await expect(page.getByRole("heading", { name: "Theory 1", exact: true })).toBeVisible();
  const roomUrl = page.url();
  const roomId = new URL(roomUrl).searchParams.get("roomId")!;
  const participant = await browser.newContext();
  try {
    const participantPage = await participant.newPage();
    await register(participantPage, `participation-member-${Date.now()}@example.com`);
    // Opening the overview alone must register participation, with no socket or answer required.
    await participantPage.goto(`/chapters/1/overview?roomId=${roomId}`);
    await expect(participantPage.getByText("Room saved to your profile.")).toBeVisible();
    await participantPage.getByRole("link", { name: "Profile", exact: true }).click();
    await expect(participantPage.locator(".room-summary")).toHaveCount(1);
    await expect(participantPage.locator(".room-role")).toHaveText("Participant");
    await expect(participantPage.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
    const denied = await participantPage.request.delete(`/api/rooms/${roomId}`, { headers: { Origin: "http://127.0.0.1:5183" } });
    expect(denied.status()).toBe(404);

    // Reopening the same room from a question link must not duplicate its card.
    const registration = participantPage.waitForResponse(response => response.url().endsWith(`/rooms/${roomId}/participants/me`));
    await participantPage.goto(roomUrl);
    expect(await (await registration).json()).toEqual({ participationCreated: false });
    await participantPage.getByRole("link", { name: "Profile", exact: true }).click();
    await expect(participantPage.locator(".room-summary")).toHaveCount(1);

    // This account can author another room while remaining a participant in the shared one.
    await participantPage.goto("/chapters/1/overview");
    await participantPage.getByRole("button", { name: "Generate new room" }).click();
    await expect(participantPage.getByRole("heading", { name: "Theory 1", exact: true })).toBeVisible();
    await participantPage.getByRole("link", { name: "Profile", exact: true }).click();
    await expect(participantPage.locator(".room-summary")).toHaveCount(2);
    const filters = participantPage.getByRole("group", { name: "Filter rooms" });
    await expect(filters.getByRole("button", { name: "All 2", exact: true })).toHaveAttribute("aria-pressed", "true");
    await filters.getByRole("button", { name: "Author 1", exact: true }).click();
    await expect(participantPage.locator(".room-summary")).toHaveCount(1);
    await expect(participantPage.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
    await filters.getByRole("button", { name: "Participant 1", exact: true }).click();
    await expect(participantPage.locator(".room-summary")).toHaveCount(1);
    await expect(participantPage.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
    await filters.getByRole("button", { name: "All 2", exact: true }).click();
    await participantPage.screenshot({ path: testInfo.outputPath("participation-desktop.png"), fullPage: true });
    await participantPage.setViewportSize({ width: 320, height: 760 });
    expect(await participantPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(filters.getByRole("button", { name: "Participant 1", exact: true })).toBeVisible();
    await participantPage.screenshot({ path: testInfo.outputPath("participation-mobile.png"), fullPage: true });

    await page.getByRole("link", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Delete for everyone" }).click();
    await expect(page.locator(".room-summary")).toHaveCount(0);
    await participantPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(participantPage.locator(".room-summary")).toHaveCount(1);
    await expect(filters.getByRole("button", { name: "Participant 0", exact: true })).toBeVisible();
  } finally { await participant.close(); }
});

test("password recovery updates the password and returns to sign-in", async ({ page }) => {
  const email = `reset-${Date.now()}@example.com`;
  await register(page, email);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("password reset link has been sent");
  const emails = await (await page.request.get(`/api/__test/emails?email=${encodeURIComponent(email)}`)).json();
  await page.goto(emails.at(-1).text.split(" ").at(-1));
  await page.getByLabel("Password", { exact: true }).fill("updated-browser-password-123");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Password updated. Sign in with your new password.")).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("updated-browser-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
});
