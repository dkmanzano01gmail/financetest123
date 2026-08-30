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

export async function sendStudentMaterialsStatement(input: {
  to: string;
  studentName: string;
  total: number;
  filename: string;
  pdfBase64: string;
}) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "student_materials_statement",
      token: APPS_SCRIPT_TOKEN,
      to: input.to,
      subject: "Materiais de aula — Selá Cerâmica",
      body: `Olá, ${input.studentName}!\n\nSegue em anexo o demonstrativo dos seus materiais utilizados nas aulas da Selá Cerâmica.\n\nValor total: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(input.total)}\n\nVocê pode realizar o pagamento via Pix utilizando o QR Code ou código Pix disponível no próprio documento.\n\nObrigada!\nSelá Cerâmica`,
      attachments: [{ filename: input.filename, mimeType: "application/pdf", base64: input.pdfBase64 }],
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || `Falha no serviço de e-mail (${response.status}).`);
  }
  return { recipient: input.to };
}

export { NOTIFICATION_EMAIL };
