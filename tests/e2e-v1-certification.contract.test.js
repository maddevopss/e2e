'use strict';

const {
  REQUIRED_SUITES,
  evaluateE2EV1Certification
} = require('../src/certification/e2eV1Certification');

describe('E2E V1 certification', () => {
  const completeEvidence = () => ({
    suites: Object.fromEntries(REQUIRED_SUITES.map((suite) => [suite, 'passed'])),
    sourceCommits: {
      backend: 'backend-sha',
      frontend: 'frontend-sha',
      desktopAgent: 'desktop-sha',
      e2e: 'e2e-sha'
    },
    environment: 'staging-isolated',
    approvedBy: 'release-owner'
  });

  test('certifies a complete cross-repository matrix', () => {
    expect(evaluateE2EV1Certification(completeEvidence())).toMatchObject({
      certified: true,
      status: 'certified',
      missing: []
    });
  });

  test('blocks an incomplete or unapproved matrix', () => {
    const evidence = completeEvidence();
    evidence.suites.desktop_agent_contract = 'failed';
    evidence.sourceCommits.frontend = '';
    evidence.approvedBy = '';

    expect(evaluateE2EV1Certification(evidence)).toMatchObject({
      certified: false,
      status: 'blocked',
      missing: expect.arrayContaining([
        'desktop_agent_contract',
        'source_commit_frontend',
        'approved_by'
      ])
    });
  });
});
