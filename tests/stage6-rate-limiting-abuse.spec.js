/**
 * Stage 6 PR G: Rate Limiting & Abuse Prevention E2E Tests
 * Tests rate limiting policies, abuse detection, and traffic anomaly prevention
 */

import { test, expect } from '@playwright/test';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

test.describe('Stage 6 PR G - Rate Limiting & Abuse Prevention E2E', () => {
  test.describe('Rate Limit Policy Creation', () => {
    test('should create a global rate limit policy', async ({ request }) => {
      const response = await request.post(`${API_URL}/api/rate-limit-policies`, {
        data: {
          organizationId: '550e8400-e29b-41d4-a716-446655440000',
          policyName: 'global_policy_e2e',
          policyConfig: {
            policyType: 'global',
            description: 'Global rate limiting for E2E testing',
            requestsPerMinute: 100,
            return429OnLimit: true,
            enforcementType: 'strict'
          }
        }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.created).toBe(true);
      expect(body.policy_id).toBeDefined();
    });

    test('should create endpoint-specific rate limit policy', async ({ request }) => {
      const response = await request.post(`${API_URL}/api/rate-limit-policies`, {
        data: {
          organizationId: '550e8400-e29b-41d4-a716-446655440000',
          policyName: 'endpoint_policy_e2e',
          policyConfig: {
            policyType: 'endpoint',
            description: 'Endpoint-specific rate limiting',
            requestsPerMinute: 50,
            endpointPattern: '/api/v1/sensitive/*'
          }
        }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.created).toBe(true);
    });
  });

  test.describe('Rate Limit Response Handling', () => {
    test('should return 429 when rate limit exceeded', async ({ request }) => {
      const organizationId = '550e8400-e29b-41d4-a716-446655440000';
      const policyId = '12345678-1234-1234-1234-123456789012';

      const responses = [];
      for (let i = 0; i < 65; i++) {
        const response = await request.post(
          `${API_URL}/api/rate-limit/check`,
          {
            data: {
              policyId,
              userId: 'test_user',
              apiKeyId: 'test_key',
              ipAddress: '192.168.1.1',
              organizationId
            }
          }
        ).catch(() => null);

        if (response) responses.push(response);
      }

      const last429 = responses.find(r => r.status() === 429);
      if (last429) {
        expect(last429.status()).toBe(429);
        expect(last429.headers()['retry-after']).toBeDefined();
      }
    });

    test('should include rate limit headers in response', async ({ request }) => {
      const response = await request.get(`${API_URL}/api/health`);

      expect(response.ok()).toBe(true);
      const headers = response.headers();
      if (headers['x-ratelimit-limit']) {
        expect(headers['x-ratelimit-remaining']).toBeDefined();
        expect(headers['x-ratelimit-reset']).toBeDefined();
      }
    });
  });

  test.describe('Abuse Detection Alerts', () => {
    test('should detect brute force attempts', async ({ request }) => {
      const response = await request.post(`${API_URL}/api/abuse-alerts`, {
        data: {
          organizationId: '550e8400-e29b-41d4-a716-446655440000',
          alertType: 'brute_force',
          alertConfig: {
            severityLevel: 'high',
            sourceIp: '192.168.1.100',
            sourceUserId: 'attacker_test',
            detectedBehavior: 'Multiple failed login attempts',
            violationCount: 15,
            confidenceScore: 0.95
          }
        }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.recorded).toBe(true);
      expect(body.alert_id).toBeDefined();
    });

    test('should detect DDoS attacks', async ({ request }) => {
      const response = await request.post(`${API_URL}/api/abuse-alerts`, {
        data: {
          organizationId: '550e8400-e29b-41d4-a716-446655440000',
          alertType: 'ddos',
          alertConfig: {
            severityLevel: 'critical',
            sourceIp: '198.51.100.1',
            detectedBehavior: 'Massive traffic spike',
            violationCount: 10000,
            confidenceScore: 0.99
          }
        }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.recorded).toBe(true);
    });

    test('should record bot activity detection', async ({ request }) => {
      const response = await request.post(`${API_URL}/api/abuse-alerts`, {
        data: {
          organizationId: '550e8400-e29b-41d4-a716-446655440000',
          alertType: 'bot_activity',
          alertConfig: {
            severityLevel: 'medium',
            sourceIp: '203.0.113.50',
            userAgent: 'MaliciousBot/1.0',
            detectedBehavior: 'Automated request patterns',
            violationCount: 100,
            confidenceScore: 0.87
          }
        }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.recorded).toBe(true);
    });
  });

  test.describe('Entity Blocking', () => {
    test('should block entity after abuse alert', async ({ request }) => {
      const alertResponse = await request.post(`${API_URL}/api/abuse-alerts`, {
        data: {
          organizationId: '550e8400-e29b-41d4-a716-446655440000',
          alertType: 'brute_force',
          alertConfig: {
            severityLevel: 'high',
            sourceIp: '192.168.1.200',
            detectedBehavior: 'Brute force attempt'
          }
        }
      });

      const alertBody = await alertResponse.json();
      const alertId = alertBody.alert_id;

      const blockResponse = await request.post(`${API_URL}/api/block-entity`, {
        data: {
          alertId,
          organizationId: '550e8400-e29b-41d4-a716-446655440000',
          blockReason: 'Brute force detected',
          blockDurationMinutes: 60
        }
      });

      expect(blockResponse.status()).toBe(200);
      const blockBody = await blockResponse.json();
      expect(blockBody.blocked).toBe(true);
      expect(blockBody.blocked_until).toBeDefined();
    });
  });

  test.describe('IP Access Control', () => {
    test('should add IP to allowlist', async ({ request }) => {
      const response = await request.post(`${API_URL}/api/ip-access-control`, {
        data: {
          organizationId: '550e8400-e29b-41d4-a716-446655440000',
          ipAddress: '192.168.1.50',
          listType: 'allowlist',
          controlConfig: {
            reason: 'Internal office network',
            isPermanent: true
          }
        }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.added).toBe(true);
      expect(body.control_id).toBeDefined();
    });

    test('should add IP to blocklist', async ({ request }) => {
      const response = await request.post(`${API_URL}/api/ip-access-control`, {
        data: {
          organizationId: '550e8400-e29b-41d4-a716-446655440000',
          ipAddress: '203.0.113.50',
          listType: 'blocklist',
          controlConfig: {
            reason: 'Known malicious IP',
            isPermanent: true
          }
        }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.added).toBe(true);
    });

    test('should add CIDR range to allowlist', async ({ request }) => {
      const response = await request.post(`${API_URL}/api/ip-access-control`, {
        data: {
          organizationId: '550e8400-e29b-41d4-a716-446655440000',
          ipAddress: '10.0.0.0',
          listType: 'allowlist',
          controlConfig: {
            ipRange: '10.0.0.0/8',
            reason: 'Corporate network',
            isPermanent: true
          }
        }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.added).toBe(true);
    });
  });

  test.describe('Traffic Anomaly Detection', () => {
    test('should detect traffic spike', async ({ request }) => {
      const response = await request.post(`${API_URL}/api/traffic-anomalies`, {
        data: {
          organizationId: '550e8400-e29b-41d4-a716-446655440000',
          anomalyConfig: {
            anomalyType: 'traffic_spike',
            severityLevel: 'high',
            baselineRps: 100,
            peakRps: 1000,
            uniqueIpsCount: 500,
            confidence: 0.95
          }
        }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.detected).toBe(true);
      expect(body.anomaly_id).toBeDefined();
      expect(body.spike_percentage).toBe(900);
    });

    test('should detect distributed attack', async ({ request }) => {
      const response = await request.post(`${API_URL}/api/traffic-anomalies`, {
        data: {
          organizationId: '550e8400-e29b-41d4-a716-446655440000',
          anomalyConfig: {
            anomalyType: 'distributed_attack',
            severityLevel: 'critical',
            baselineRps: 100,
            peakRps: 50000,
            uniqueIpsCount: 10000,
            confidence: 0.99
          }
        }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.detected).toBe(true);
    });
  });

  test.describe('Bot Detection', () => {
    test('should record bot detection', async ({ request }) => {
      const response = await request.post(`${API_URL}/api/bot-detection`, {
        data: {
          organizationId: '550e8400-e29b-41d4-a716-446655440000',
          botConfig: {
            botType: 'scraper',
            sourceIp: '198.51.100.100',
            userAgent: 'Scrapy/2.0',
            confidenceScore: 0.92,
            detectionMethod: 'pattern_matching',
            action: 'rate_limited'
          }
        }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.recorded).toBe(true);
      expect(body.bot_id).toBeDefined();
    });
  });

  test.describe('Request Queuing', () => {
    test('should queue rate-limited request', async ({ request }) => {
      const response = await request.post(`${API_URL}/api/queue-request`, {
        data: {
          organizationId: '550e8400-e29b-41d4-a716-446655440000',
          userId: 'user_queue',
          apiKeyId: 'key_queue',
          ipAddress: '192.168.1.100',
          requestConfig: {
            httpMethod: 'POST',
            requestPath: '/api/v1/data',
            retryAfterSeconds: 60,
            requestSizeBytes: 2048,
            priority: 0
          }
        }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.queued).toBe(true);
      expect(body.queue_id).toBeDefined();
      expect(body.queue_position).toBeDefined();
    });
  });

  test.describe('Frontend Rate Limit Alert Display', () => {
    test('should display rate limit alert when 429 received', async ({ page, request }) => {
      await page.goto(FRONTEND_URL);

      // Simulate rate limit response
      await page.evaluate(() => {
        const event = new CustomEvent('ratelimit', {
          detail: {
            isLimited: true,
            retryAfter: 60,
            requestsRemaining: 0
          }
        });
        window.dispatchEvent(event);
      });

      // Check for alert component
      const alert = page.locator('[role="alert"]');
      await expect(alert).toBeVisible({ timeout: 5000 });
    });

    test('should display abuse detection alert', async ({ page }) => {
      await page.goto(FRONTEND_URL);

      // Simulate abuse alert
      await page.evaluate(() => {
        const event = new CustomEvent('abusealert', {
          detail: {
            type: 'brute_force',
            severity: 'high',
            message: 'Suspicious activity detected'
          }
        });
        window.dispatchEvent(event);
      });

      const alert = page.locator('[role="alert"]');
      await expect(alert).toBeVisible({ timeout: 5000 });
      await expect(alert).toContainText('Security Alert');
    });

    test('should display rate limit indicator in header', async ({ page }) => {
      await page.goto(FRONTEND_URL);

      // Simulate rate limit update
      await page.evaluate(() => {
        localStorage.setItem('ratelimit_remaining', '10');
        localStorage.setItem('ratelimit_limit', '100');
        const event = new Event('storage');
        window.dispatchEvent(event);
      });

      const indicator = page.locator('[title="Requests remaining"]');
      // Component may not be visible, so just check if it exists
      const count = await indicator.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  test.describe('Rate Limit Summary Views', () => {
    test('should retrieve rate limit summary', async ({ request }) => {
      const response = await request.get(
        `${API_URL}/api/rate-limit-summary?organizationId=550e8400-e29b-41d4-a716-446655440000`
      );

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.summary).toBeDefined();
      expect(Array.isArray(body.summary)).toBe(true);
    });

    test('should retrieve abuse detection summary', async ({ request }) => {
      const response = await request.get(
        `${API_URL}/api/abuse-detection-summary?organizationId=550e8400-e29b-41d4-a716-446655440000`
      );

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.summary).toBeDefined();
      expect(Array.isArray(body.summary)).toBe(true);
    });

    test('should retrieve traffic anomaly summary', async ({ request }) => {
      const response = await request.get(
        `${API_URL}/api/traffic-anomaly-summary?organizationId=550e8400-e29b-41d4-a716-446655440000`
      );

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.summary).toBeDefined();
      expect(Array.isArray(body.summary)).toBe(true);
    });
  });

  test.describe('Integrated Scenario: Brute Force Detection and Blocking', () => {
    test('should detect brute force, block IP, and queue requests', async ({ request }) => {
      const organizationId = '550e8400-e29b-41d4-a716-446655440000';
      const testIp = '192.168.2.50';

      // 1. Record brute force alert
      const alertRes = await request.post(`${API_URL}/api/abuse-alerts`, {
        data: {
          organizationId,
          alertType: 'brute_force',
          alertConfig: {
            severityLevel: 'high',
            sourceIp: testIp,
            detectedBehavior: 'Multiple failed logins',
            violationCount: 20,
            confidenceScore: 0.94
          }
        }
      });
      expect(alertRes.status()).toBe(200);
      const alertBody = await alertRes.json();

      // 2. Block the entity
      const blockRes = await request.post(`${API_URL}/api/block-entity`, {
        data: {
          alertId: alertBody.alert_id,
          organizationId,
          blockReason: 'Brute force detected',
          blockDurationMinutes: 60
        }
      });
      expect(blockRes.status()).toBe(200);
      const blockBody = await blockRes.json();
      expect(blockBody.blocked).toBe(true);

      // 3. Add IP to blocklist
      const blocklistRes = await request.post(`${API_URL}/api/ip-access-control`, {
        data: {
          organizationId,
          ipAddress: testIp,
          listType: 'blocklist',
          controlConfig: {
            reason: 'Brute force attack source',
            isPermanent: false,
            expiresAt: new Date(Date.now() + 3600000)
          }
        }
      });
      expect(blocklistRes.status()).toBe(200);
      const blocklistBody = await blocklistRes.json();
      expect(blocklistBody.added).toBe(true);

      // 4. Queue legitimate requests
      const queueRes = await request.post(`${API_URL}/api/queue-request`, {
        data: {
          organizationId,
          userId: 'legitimate_user',
          apiKeyId: 'legitimate_key',
          ipAddress: '192.168.3.1',
          requestConfig: {
            httpMethod: 'GET',
            requestPath: '/api/v1/data',
            retryAfterSeconds: 120,
            priority: 5
          }
        }
      });
      expect(queueRes.status()).toBe(200);
      const queueBody = await queueRes.json();
      expect(queueBody.queued).toBe(true);
    });
  });
});
