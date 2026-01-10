import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { ApiUsageStatus, UsageData, ApiRequest } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ApiUsageTracker {
  private usageFile: string;
  private monthlyLimit: number;
  private warningThreshold: number;
  private criticalThreshold: number;
  private usage!: UsageData;

  constructor() {
    this.usageFile = path.join(__dirname, '..', '..', 'data', 'api_usage.json');
    this.monthlyLimit = parseInt(process.env.API_MONTHLY_LIMIT ?? '1000', 10);
    this.warningThreshold = 0.8;
    this.criticalThreshold = 0.95;
    this.ensureDataDir();
    this.loadUsage();
  }

  private ensureDataDir(): void {
    const dataDir = path.dirname(this.usageFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  private loadUsage(): void {
    try {
      if (fs.existsSync(this.usageFile)) {
        const data = JSON.parse(fs.readFileSync(this.usageFile, 'utf8')) as UsageData;
        this.usage = data;
      } else {
        this.resetUsage();
      }

      if (this.isNewMonth()) {
        this.resetUsage();
      }
    } catch (error) {
      console.error('Error loading API usage data:', error);
      this.resetUsage();
    }
  }

  private saveUsage(): void {
    try {
      fs.writeFileSync(this.usageFile, JSON.stringify(this.usage, null, 2));
    } catch (error) {
      console.error('Error saving API usage data:', error);
    }
  }

  private resetUsage(): void {
    const now = new Date();
    this.usage = {
      month: now.getMonth(),
      year: now.getFullYear(),
      count: 0,
      requests: [],
      lastReset: now.toISOString(),
    };
    this.saveUsage();
  }

  private isNewMonth(): boolean {
    const now = new Date();
    return this.usage.month !== now.getMonth() || this.usage.year !== now.getFullYear();
  }

  canMakeRequest(): boolean {
    if (this.isNewMonth()) {
      this.resetUsage();
    }
    return this.usage.count < this.monthlyLimit;
  }

  getRemainingRequests(): number {
    if (this.isNewMonth()) {
      this.resetUsage();
    }
    return Math.max(0, this.monthlyLimit - this.usage.count);
  }

  getUsagePercentage(): number {
    if (this.isNewMonth()) {
      this.resetUsage();
    }
    return (this.usage.count / this.monthlyLimit) * 100;
  }

  recordRequest(type = 'flight_lookup', flightId: string | null = null): void {
    if (this.isNewMonth()) {
      this.resetUsage();
    }

    this.usage.count++;
    const request: ApiRequest = {
      timestamp: new Date().toISOString(),
      type: type,
      flightId: flightId,
    };
    this.usage.requests.push(request);

    if (this.usage.requests.length > 100) {
      this.usage.requests = this.usage.requests.slice(-100);
    }

    this.saveUsage();

    const percentage = this.getUsagePercentage();
    if (percentage >= this.criticalThreshold * 100) {
      console.warn(
        `API Usage Critical: ${String(this.usage.count)}/${String(this.monthlyLimit)} (${percentage.toFixed(1)}%)`
      );
    } else if (percentage >= this.warningThreshold * 100) {
      console.warn(
        `API Usage Warning: ${String(this.usage.count)}/${String(this.monthlyLimit)} (${percentage.toFixed(1)}%)`
      );
    }
  }

  getUsageStatus(): ApiUsageStatus {
    const remaining = this.getRemainingRequests();
    const percentage = this.getUsagePercentage();

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    let emoji = '';

    if (percentage >= this.criticalThreshold * 100) {
      status = 'critical';
      emoji = '';
    } else if (percentage >= this.warningThreshold * 100) {
      status = 'warning';
      emoji = '';
    }

    return {
      status,
      emoji,
      used: this.usage.count,
      remaining,
      limit: this.monthlyLimit,
      percentage: Math.round(percentage),
      resetsOn: this.getNextResetDate(),
    };
  }

  private getNextResetDate(): string {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth.toISOString().split('T')[0];
  }

  shouldLimitTracking(): boolean {
    const percentage = this.getUsagePercentage();
    return percentage >= this.criticalThreshold * 100;
  }

  getUsageMessage(): string {
    const status = this.getUsageStatus();

    if (status.status === 'critical') {
      return `*API Usage Critical*: ${String(status.used)}/${String(status.limit)} requests used (${String(status.percentage)}%). Flight tracking may be limited to preserve remaining requests. Resets on ${status.resetsOn}.`;
    } else if (status.status === 'warning') {
      return `*API Usage Warning*: ${String(status.used)}/${String(status.limit)} requests used (${String(status.percentage)}%). Consider limiting flight tracking. Resets on ${status.resetsOn}.`;
    }

    return `${status.emoji} API Usage: ${String(status.used)}/${String(status.limit)} requests used (${String(status.percentage)}%). ${String(status.remaining)} requests remaining.`;
  }
}
