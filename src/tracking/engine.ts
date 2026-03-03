import type { StorageAdapter } from '../core/types.js';
import { generateId } from '../core/utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrackingConfig {
  /** Base URL for open-tracking pixel (e.g. "https://your-app.com/track/open") */
  pixelUrl?: string;
  /** Base URL for click-tracking redirect (e.g. "https://your-app.com/track/click") */
  redirectUrl?: string;
}

export interface TrackingEventData {
  timestamp: string;
  ip?: string;
  userAgent?: string;
  url?: string;
}

export interface TrackingStatus {
  emailId: string;
  opens: TrackingEventData[];
  clicks: TrackingEventData[];
  lastOpened?: string;
  lastClicked?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

function storageKey(emailId: string): string {
  return `tracking:${emailId}`;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class TrackingEngine {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly config: TrackingConfig,
  ) {}

  // ---- Storage helpers ----------------------------------------------------

  private async loadStatus(emailId: string): Promise<TrackingStatus> {
    const raw = await this.storage.getMetadata(storageKey(emailId));
    if (!raw) {
      return { emailId, opens: [], clicks: [] };
    }
    return JSON.parse(raw) as TrackingStatus;
  }

  private async saveStatus(status: TrackingStatus): Promise<void> {
    await this.storage.setMetadata(
      storageKey(status.emailId),
      JSON.stringify(status),
    );
  }

  // ---- Public API ---------------------------------------------------------

  /**
   * Inject tracking elements into HTML email content.
   *
   * - If `options.opens` is true and `pixelUrl` is configured, appends an
   *   invisible 1x1 tracking pixel before the closing `</body>` tag (or at
   *   the end of the HTML if no `</body>` is present).
   *
   * - If `options.clicks` is true and `redirectUrl` is configured, rewrites
   *   every `<a href="...">` to route through the redirect URL.
   */
  injectTracking(
    html: string,
    emailId: string,
    options: { opens?: boolean; clicks?: boolean } = {},
  ): string {
    let result = html;

    // Inject open-tracking pixel
    if (options.opens && this.config.pixelUrl) {
      const timestamp = Date.now().toString();
      const pixelTag =
        `<img src="${this.config.pixelUrl}?id=${encodeURIComponent(emailId)}&t=${timestamp}" ` +
        `width="1" height="1" style="display:none" alt="" />`;

      const bodyCloseIndex = result.toLowerCase().lastIndexOf('</body>');
      if (bodyCloseIndex !== -1) {
        result =
          result.slice(0, bodyCloseIndex) + pixelTag + result.slice(bodyCloseIndex);
      } else {
        result += pixelTag;
      }
    }

    // Rewrite links for click tracking
    if (options.clicks && this.config.redirectUrl) {
      const redirectBase = this.config.redirectUrl;
      const eid = encodeURIComponent(emailId);

      result = result.replace(
        /<a\s([^>]*?)href="([^"]+)"([^>]*?)>/gi,
        (_match: string, before: string, url: string, after: string) => {
          // Skip mailto: and tel: links, and links that are already tracked
          if (
            url.startsWith('mailto:') ||
            url.startsWith('tel:') ||
            url.startsWith(redirectBase)
          ) {
            return `<a ${before}href="${url}"${after}>`;
          }

          const trackedUrl = `${redirectBase}?id=${eid}&url=${encodeURIComponent(url)}`;
          return `<a ${before}href="${trackedUrl}"${after}>`;
        },
      );
    }

    return result;
  }

  /**
   * Record an open event for the given email.
   */
  async recordOpen(
    emailId: string,
    event?: Partial<TrackingEventData>,
  ): Promise<void> {
    const status = await this.loadStatus(emailId);

    const openEvent: TrackingEventData = {
      timestamp: event?.timestamp ?? new Date().toISOString(),
      ip: event?.ip,
      userAgent: event?.userAgent,
    };

    status.opens.push(openEvent);
    status.lastOpened = openEvent.timestamp;

    await this.saveStatus(status);
  }

  /**
   * Record a click event for the given email and URL.
   */
  async recordClick(
    emailId: string,
    url: string,
    event?: Partial<TrackingEventData>,
  ): Promise<void> {
    const status = await this.loadStatus(emailId);

    const clickEvent: TrackingEventData = {
      timestamp: event?.timestamp ?? new Date().toISOString(),
      ip: event?.ip,
      userAgent: event?.userAgent,
      url,
    };

    status.clicks.push(clickEvent);
    status.lastClicked = clickEvent.timestamp;

    await this.saveStatus(status);
  }

  /**
   * Retrieve the tracking status for an email, including all recorded opens
   * and clicks with computed lastOpened/lastClicked timestamps.
   */
  async getStatus(emailId: string): Promise<TrackingStatus> {
    const status = await this.loadStatus(emailId);

    // Ensure lastOpened/lastClicked are computed even if loaded from storage
    // without them (e.g. older records)
    if (status.opens.length > 0 && !status.lastOpened) {
      status.lastOpened = status.opens[status.opens.length - 1].timestamp;
    }

    if (status.clicks.length > 0 && !status.lastClicked) {
      status.lastClicked = status.clicks[status.clicks.length - 1].timestamp;
    }

    return status;
  }
}
