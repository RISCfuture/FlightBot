const fs = require('fs');
const path = require('path');

class ApiUsageTracker {
  constructor() {
    this.usageFile = path.join(__dirname, '..', 'data', 'api_usage.json');
    this.monthlyLimit = parseInt(process.env.API_MONTHLY_LIMIT) || 1000; // FlightAware typically allows more
    this.warningThreshold = 0.8; // 80% usage warning
    this.criticalThreshold = 0.95; // 95% usage critical
    this.ensureDataDir();
    this.loadUsage();
  }

  ensureDataDir() {
    const dataDir = path.dirname(this.usageFile);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  loadUsage() {
    try {
      if (fs.existsSync(this.usageFile)) {
        const data = JSON.parse(fs.readFileSync(this.usageFile, 'utf8'));
        this.usage = data;
      } else {
        this.resetUsage();
      }
      
      // Reset if new month
      if (this.isNewMonth()) {
        this.resetUsage();
      }
    } catch (error) {
      console.error('Error loading API usage data:', error);
      this.resetUsage();
    }
  }

  saveUsage() {
    try {
      fs.writeFileSync(this.usageFile, JSON.stringify(this.usage, null, 2));
    } catch (error) {
      console.error('Error saving API usage data:', error);
    }
  }

  resetUsage() {
    const now = new Date();
    this.usage = {
      month: now.getMonth(),
      year: now.getFullYear(),
      count: 0,
      requests: [],
      lastReset: now.toISOString()
    };
    this.saveUsage();
  }

  isNewMonth() {
    const now = new Date();
    return this.usage.month !== now.getMonth() || this.usage.year !== now.getFullYear();
  }

  canMakeRequest() {
    if (this.isNewMonth()) {
      this.resetUsage();
    }
    return this.usage.count < this.monthlyLimit;
  }

  getRemainingRequests() {
    if (this.isNewMonth()) {
      this.resetUsage();
    }
    return Math.max(0, this.monthlyLimit - this.usage.count);
  }

  getUsagePercentage() {
    if (this.isNewMonth()) {
      this.resetUsage();
    }
    return (this.usage.count / this.monthlyLimit) * 100;
  }

  recordRequest(type = 'flight_lookup', flightId = null) {
    if (this.isNewMonth()) {
      this.resetUsage();
    }
    
    this.usage.count++;
    this.usage.requests.push({
      timestamp: new Date().toISOString(),
      type: type,
      flightId: flightId
    });
    
    // Keep only last 100 requests for analysis
    if (this.usage.requests.length > 100) {
      this.usage.requests = this.usage.requests.slice(-100);
    }
    
    this.saveUsage();
    
    // Log usage milestones
    const percentage = this.getUsagePercentage();
    if (percentage >= this.criticalThreshold * 100) {
      console.warn(`🚨 API Usage Critical: ${this.usage.count}/${this.monthlyLimit} (${percentage.toFixed(1)}%)`);
    } else if (percentage >= this.warningThreshold * 100) {
      console.warn(`⚠️ API Usage Warning: ${this.usage.count}/${this.monthlyLimit} (${percentage.toFixed(1)}%)`);
    }
  }

  getUsageStatus() {
    const remaining = this.getRemainingRequests();
    const percentage = this.getUsagePercentage();
    
    let status = 'healthy';
    let emoji = '✅';
    
    if (percentage >= this.criticalThreshold * 100) {
      status = 'critical';
      emoji = '🚨';
    } else if (percentage >= this.warningThreshold * 100) {
      status = 'warning';
      emoji = '⚠️';
    }
    
    return {
      status,
      emoji,
      used: this.usage.count,
      remaining,
      limit: this.monthlyLimit,
      percentage: Math.round(percentage),
      resetsOn: this.getNextResetDate()
    };
  }

  getNextResetDate() {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth.toISOString().split('T')[0];
  }

  shouldLimitTracking() {
    const percentage = this.getUsagePercentage();
    return percentage >= this.criticalThreshold * 100;
  }

  getUsageMessage() {
    const status = this.getUsageStatus();
    
    if (status.status === 'critical') {
      return `🚨 *API Usage Critical*: ${status.used}/${status.limit} requests used (${status.percentage}%). Flight tracking may be limited to preserve remaining requests. Resets on ${status.resetsOn}.`;
    } else if (status.status === 'warning') {
      return `⚠️ *API Usage Warning*: ${status.used}/${status.limit} requests used (${status.percentage}%). Consider limiting flight tracking. Resets on ${status.resetsOn}.`;
    }
    
    return `${status.emoji} API Usage: ${status.used}/${status.limit} requests used (${status.percentage}%). ${status.remaining} requests remaining.`;
  }
}

module.exports = ApiUsageTracker;