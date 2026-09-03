/**
 * Envío de mails por la API REST de Resend.
 *
 * Sin SDK: es un POST con JSON, y el paquete `resend` no aporta nada acá.
 * Si no hay RESEND_API_KEY configurada la función no falla, simplemente no
 * manda: el panel de alertas sigue funcionando igual y la app arranca sin
 * necesidad de tener una cuenta de mail.
 */
export async function enviarEmail({
  to,
  subject,
  html,
}: {
  to: string[];
  subject: string;
  html: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from || to.length === 0) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      console.error("Resend rechazó el envío:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    // Que no se pueda avisar por mail nunca debe romper el fichaje ni el panel.
    console.error("Error enviando mail:", e);
    return false;
  }
}

export function plantillaAlertas(
  alertas: { empleado: string; tipo: string; detalle: string }[],
  urlPanel: string
): string {
  const filas = alertas
    .map(
      (a) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${escapar(a.empleado)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${escapar(a.tipo)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569">${escapar(a.detalle)}</td>
      </tr>`
    )
    .join("");

  return `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:0 auto;padding:24px">
    <h1 style="font-size:20px;margin:0 0 4px">Control de personal</h1>
    <p style="color:#64748b;margin:0 0 20px">
      ${alertas.length === 1 ? "Hay 1 aviso nuevo" : `Hay ${alertas.length} avisos nuevos`}.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${filas}</table>
    <p style="margin:24px 0 0">
      <a href="${urlPanel}" style="background:#059669;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">
        Ver el panel
      </a>
    </p>
  </div>`;
}

function escapar(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
