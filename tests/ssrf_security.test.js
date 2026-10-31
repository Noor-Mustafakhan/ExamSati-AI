import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateFpscUrl } from '../server/fpscRetrievalService.js';

describe('SSRF Protection & URL Validation', () => {
  it('accepts legitimate official FPSC URLs', () => {
    const valid1 = validateFpscUrl('https://www.fpsc.gov.pk/jobs/gr/current-advertisement');
    assert.equal(valid1.valid, true);

    const valid2 = validateFpscUrl('https://fpsc.gov.pk/rules/css-mpt-rules');
    assert.equal(valid2.valid, true);

    const valid3 = validateFpscUrl('http://syllabus.fpsc.gov.pk/scheme-2026');
    assert.equal(valid3.valid, true);
  });

  it('rejects localhost, loopback, and private IP addresses', () => {
    const loopbackIpv4 = validateFpscUrl('http://127.0.0.1/admin');
    assert.equal(loopbackIpv4.valid, false);
    assert.match(loopbackIpv4.error, /prohibited/i);

    const localhost = validateFpscUrl('http://localhost:5173/api/secret');
    assert.equal(localhost.valid, false);

    const priv10 = validateFpscUrl('http://10.0.0.1/internal');
    assert.equal(priv10.valid, false);

    const priv192 = validateFpscUrl('http://192.168.1.100/router');
    assert.equal(priv192.valid, false);

    const priv172 = validateFpscUrl('http://172.20.0.5/cloud');
    assert.equal(priv172.valid, false);

    const awsMetadata = validateFpscUrl('http://169.254.169.254/latest/meta-data');
    assert.equal(awsMetadata.valid, false);
  });

  it('rejects numeric IP obfuscation techniques (hex, decimal integers)', () => {
    const hexIp = validateFpscUrl('http://0x7f000001/secret');
    assert.equal(hexIp.valid, false);

    const intIp = validateFpscUrl('http://2130706433/data');
    assert.equal(intIp.valid, false);
  });

  it('rejects embedded credentials in URL', () => {
    const creds = validateFpscUrl('https://admin:supersecret@fpsc.gov.pk/dashboard');
    assert.equal(creds.valid, false);
    assert.match(creds.error, /credentials/i);
  });

  it('rejects non-standard ports (e.g. SSH, databases, debug ports)', () => {
    const sshPort = validateFpscUrl('https://fpsc.gov.pk:22/notice');
    assert.equal(sshPort.valid, false);
    assert.match(sshPort.error, /non-standard port/i);

    const dbPort = validateFpscUrl('https://fpsc.gov.pk:5432/sql');
    assert.equal(dbPort.valid, false);
  });

  it('rejects unauthorized external domains and spoofed subdomains', () => {
    const external = validateFpscUrl('https://google.com');
    assert.equal(external.valid, false);

    const spoofed = validateFpscUrl('https://fpsc.gov.pk.attacker.com/malware');
    assert.equal(spoofed.valid, false);
  });

  it('rejects non-HTTP protocols (file, ftp, javascript)', () => {
    const fileProto = validateFpscUrl('file:///etc/passwd');
    assert.equal(fileProto.valid, false);
    assert.match(fileProto.error, /protocol/i);

    const ftpProto = validateFpscUrl('ftp://fpsc.gov.pk/files');
    assert.equal(ftpProto.valid, false);
  });
});
