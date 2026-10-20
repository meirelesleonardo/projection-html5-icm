'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  shouldOpenView,
  viewUrl,
  browserLaunch,
  startupAction,
} = require('./open-view');

describe('open view', () => {
  it('opens for the exe and honors OPEN_VIEW', () => {
    assert.equal(shouldOpenView({}, true), true);
    assert.equal(shouldOpenView({}, false), false);
    assert.equal(shouldOpenView({ OPEN_VIEW: '0' }, true), false);
    assert.equal(shouldOpenView({ OPEN_VIEW: '1' }, false), true);
  });

  it('builds the local view URL', () => {
    assert.equal(viewUrl({ protocol: 'http', port: 3080 }), 'http://127.0.0.1:3080/view.html');
    assert.equal(viewUrl({ protocol: 'https', port: 3080 }), 'https://127.0.0.1:3080/view.html');
  });

  it('uses the default browser via start on Windows', () => {
    const spec = browserLaunch('http://127.0.0.1:3080/view.html', 'win32');
    assert.equal(spec.file, 'cmd');
    assert.deepEqual(spec.args, ['/c', 'start', '', 'http://127.0.0.1:3080/view.html']);
  });

  it('busy port with view enabled only reopens the browser', () => {
    assert.equal(startupAction(true, true), 'exit-open');
    assert.equal(startupAction(true, false), 'listen');
    assert.equal(startupAction(false, true), 'listen');
  });
});
