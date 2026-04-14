import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn();
vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: vi.fn().mockImplementation(() => ({ send: mockSend })),
  SendEmailCommand: vi.fn().mockImplementation((input) => input),
}));

const { sendJobCompletionEmail } = await import('../src/email.js');

describe('sendJobCompletionEmail', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it('sends an email with the correct subject and recipient', async () => {
    mockSend.mockResolvedValueOnce({ MessageId: 'test-123' });
    await sendJobCompletionEmail({
      to: 'user@example.com',
      jobId: 'job-1',
      rootUrl: 'https://configcat.com',
      pagesFound: 42,
    });

    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.Destination.ToAddresses).toEqual(['user@example.com']);
    expect(cmd.Message.Subject.Data).toContain('configcat.com');
    expect(cmd.Message.Body.Text.Data).toContain('42 pages found');
    expect(cmd.Message.Body.Html.Data).toContain('job-1');
  });

  it('does not throw when SES rejects (sandbox mode)', async () => {
    mockSend.mockRejectedValueOnce(new Error('MessageRejected: Email address is not verified'));
    // Should not throw — the helper catches and logs
    await expect(
      sendJobCompletionEmail({
        to: 'unverified@example.com',
        jobId: 'job-2',
        rootUrl: 'https://example.com',
        pagesFound: 5,
      }),
    ).resolves.toBeUndefined();
  });
});
