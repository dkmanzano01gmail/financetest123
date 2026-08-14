const NOTIFICATION_EMAIL = "dkmanzano.o@hotmail.com";
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycby3jEledMUp539xy8lNieDAUlnWe7Qw4ixyxCfzf6wrxpl9W0epVgACSCTzv4Y2Uc44mQ/exec";
const APPS_SCRIPT_TOKEN =
  "fb_8a3e1c7d5f9042b6a1d8e7c3f9b2054a6c8d1e3f7b9a0245c6d8e1f3a7b9c2d4";

export async function sendAdminNotification(input: {
  comment: string;
  type: string;
  page: string;
  createdAt: string;
  workspaceName: string;
}) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "lovable_feedback",
      token: APPS_SCRIPT_TOKEN,
      ...input,
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || `Falha no serviço de e-mail (${response.status}).`);
  }
  return { recipient: NOTIFICATION_EMAIL };
}

export { NOTIFICATION_EMAIL };
