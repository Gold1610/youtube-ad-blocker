const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

test('manifest.json is valid MV3, references existing files, and scopes permissions strictly to YouTube', () => {
  const manifestPath = path.join(ROOT, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.name);
  assert.ok(manifest.version);
  assert.ok(Array.isArray(manifest.permissions));
  assert.ok(manifest.permissions.includes('storage'));
  assert.ok(manifest.permissions.includes('declarativeNetRequest'));
  assert.equal(manifest.permissions.includes('tabs'), false);

  assert.ok(Array.isArray(manifest.host_permissions));
  assert.equal(manifest.host_permissions.includes('<all_urls>'), false);
  assert.ok(
    manifest.host_permissions.every(
      (p) => p.includes('youtube.com') || p.includes('youtu.be') || p.includes('youtube-nocookie.com')
    )
  );

  for (const iconFile of Object.values(manifest.icons || {})) {
    assert.ok(fs.existsSync(path.join(ROOT, iconFile)), `Missing icon: ${iconFile}`);
  }
  assert.ok(fs.existsSync(path.join(ROOT, manifest.action.default_popup)));
  assert.ok(fs.existsSync(path.join(ROOT, manifest.background.service_worker)));

  for (const cs of manifest.content_scripts || []) {
    for (const jsFile of cs.js || []) {
      assert.ok(fs.existsSync(path.join(ROOT, jsFile)), `Missing content script: ${jsFile}`);
    }
    for (const cssFile of cs.css || []) {
      assert.ok(fs.existsSync(path.join(ROOT, cssFile)), `Missing content css: ${cssFile}`);
    }
  }

  for (const rs of manifest.declarative_net_request?.rule_resources || []) {
    assert.ok(fs.existsSync(path.join(ROOT, rs.path)), `Missing DNR ruleset: ${rs.path}`);
    assert.equal(rs.enabled, false);
  }
});

test('DNR ruleset has unique positive IDs and scopes all rules to YouTube initiator domains', () => {
  const rulesPath = path.join(ROOT, 'rules', 'youtube-ads.json');
  const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));

  assert.ok(Array.isArray(rules) && rules.length >= 5);
  const seenIds = new Set();

  for (const rule of rules) {
    assert.equal(Number.isInteger(rule.id) && rule.id > 0, true);
    assert.equal(seenIds.has(rule.id), false, `Duplicate rule id ${rule.id}`);
    seenIds.add(rule.id);

    assert.equal(rule.action?.type, 'block');
    assert.ok(Array.isArray(rule.condition?.initiatorDomains) && rule.condition.initiatorDomains.length > 0);
    assert.ok(
      rule.condition.initiatorDomains.every((domain) => domain.endsWith('youtube.com') || domain.endsWith('youtube-nocookie.com')),
      `Rule ${rule.id} leaked outside YouTube initiatorDomains`
    );
  }
});
