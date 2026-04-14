import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { createLogger } from './logger.js';

const log = createLogger('email');

const FROM_ADDRESS = process.env.SES_FROM_ADDRESS ?? 'noreply@llmtxtgenerator.online';
const SITE_URL = process.env.SITE_URL ?? 'https://llmtxtgenerator.online';

let ses: SESClient | null = null;
function getSes(): SESClient {
  if (!ses) ses = new SESClient();
  return ses;
}

export interface JobCompletionEmail {
  to: string;
  jobId: string;
  rootUrl: string;
  pagesFound: number;
}

export async function sendJobCompletionEmail(params: JobCompletionEmail): Promise<void> {
  const { to, jobId, rootUrl, pagesFound } = params;
  const hostname = new URL(rootUrl).hostname;
  const jobUrl = `${SITE_URL}/jobs/${jobId}`;

  const subject = `Your llms.txt is ready — ${hostname}`;
  const textBody = [
    `Your crawl of ${rootUrl} is complete.`,
    `${pagesFound} pages found.`,
    '',
    `View & download: ${jobUrl}`,
    '',
    '— llms.txt Generator',
  ].join('\n');

  const htmlBody = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1e293b;">
  <h2 style="font-size: 18px; margin-bottom: 16px;">Your llms.txt is ready</h2>
  <p style="color: #475569; line-height: 1.6;">
    Your crawl of <strong>${rootUrl}</strong> is complete.<br>
    <strong>${pagesFound} pages</strong> found.
  </p>
  <a href="${jobUrl}"
     style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #4f46e5; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
    View &amp; Download
  </a>
  <p style="margin-top: 32px; font-size: 12px; color: #94a3b8;">
    llms.txt Generator &middot; <a href="${SITE_URL}" style="color: #6366f1;">${SITE_URL}</a>
  </p>
</body>
</html>`.trim();

  try {
    await getSes().send(
      new SendEmailCommand({
        Source: FROM_ADDRESS,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject },
          Body: {
            Text: { Data: textBody },
            Html: { Data: htmlBody },
          },
        },
      }),
    );
    log.info('Job completion email sent', { to, jobId, hostname });
  } catch (err) {
    // SES sandbox rejects unverified recipients with MessageRejected.
    // Log and move on — don't fail the job over an email.
    log.warn('Failed to send email (SES sandbox or config issue)', {
      to,
      jobId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
