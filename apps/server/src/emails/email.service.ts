import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { ConfigurationService } from '../configuration/configuration.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;

  constructor(private readonly configService: ConfigurationService) {
    this.resend = this.configService.RESEND_API_KEY
      ? new Resend(this.configService.RESEND_API_KEY)
      : null;

    if (!this.resend) {
      this.logger.warn(
        'RESEND_API_KEY not configured — emails will be logged, not sent.',
      );
    }
  }

  async sendLoginToken(email: string, token: string): Promise<void> {
    const subject = 'Your login code';
    const html = `<p>Your login code is:</p><h2>${token}</h2><p>This code expires in 15 minutes.</p>`;

    if (!this.resend) {
      this.logger.log(`[dev] Login token for ${email}: ${token}`);
      return;
    }

    const { error } = await this.resend.emails.send({
      from: this.configService.EMAIL_FROM,
      to: email,
      subject,
      html,
    });

    if (error) {
      this.logger.error(`Failed to send login token to ${email}: ${error.message}`);
      throw new Error(`Failed to send login email: ${error.message}`);
    }
  }
}
