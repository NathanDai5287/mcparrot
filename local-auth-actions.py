import json
import os
from browser_harness.helpers import js

STATE_SCRIPT = """(() => {
  const host = location.hostname;
  if (host === 'bcourses.berkeley.edu') {
    const connected = Boolean(document.querySelector('#global_nav_profile_link'));
    return {stage: connected ? 'connected' : 'working', message: connected ? 'Canvas sign-in succeeded.' : 'Waiting for Canvas sign-in.'};
  }
  const login = document.querySelector('#username') && document.querySelector('#password');
  const rejected = [...document.querySelectorAll('#msg,.errors,.alert-danger,[role=alert]')].some(e => e.offsetParent && /invalid|incorrect|failed|locked|try again/i.test(e.textContent));
  if (rejected && login) return {stage: 'credentials', rejected: true, message: 'The school rejected the sign-in. Correct your details before submitting again.'};
  if (login) return {stage: 'credentials', message: 'Enter your CalNet username and password.'};
  if (host.endsWith('.duosecurity.com') && document.querySelector('#passcode-input')) return {stage: 'code', rejected, message: rejected ? 'The code was rejected. Enter a new code before submitting again.' : 'Enter the SMS code for your phone ending in 2199.'};
  return {stage: 'verification', message: 'Checking the verification choices offered by the school.'};
})()"""


def read_state(step):
    state = js(STATE_SCRIPT)
    if state["stage"] != "verification":
        return state
    skipped_trust = js("""(() => {
      if (!location.hostname.endsWith('.duosecurity.com')) return false;
      const skip = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === 'No, other people use this device');
      if (!skip) return false;
      skip.click();
      return true;
    })()""")
    if skipped_trust:
        return {"stage": "working", "message": "Continuing without persistent device trust."}
    if step == "sms-requested":
        return state
    return js("""(step => {
      if (!location.hostname.endsWith('.duosecurity.com')) return {stage: 'working', message: 'Waiting for school verification.'};
      const buttons = [...document.querySelectorAll('button')];
      const sms = buttons.find(e => /Text message passcode/i.test(e.innerText) && e.innerText.includes('2199'));
      if (sms) {
        sms.click();
        return {stage: 'working', nextStep: 'sms-requested', message: 'Requested the SMS verification option for phone ending in 2199.'};
      }
      const other = buttons.find(e => e.innerText.trim() === 'Other options');
      if (other && step === 'start') {
        other.click();
        return {stage: 'working', nextStep: 'options-opened', message: 'Checking the available verification methods.'};
      }
      return {stage: 'verification', message: 'Waiting for the school verification choices.'};
    })(""" + json.dumps(step) + ")")


def submit_login(payload):
    expression = """(data => {
      if (location.hostname !== 'auth.berkeley.edu') throw Error('Unexpected sign-in page');
      const username = document.querySelector('#username');
      const password = document.querySelector('#password');
      if (!username || !password) throw Error('Sign-in fields are unavailable');
      username.value = data.username;
      password.value = data.password;
      username.dispatchEvent(new Event('input', {bubbles: true}));
      password.dispatchEvent(new Event('input', {bubbles: true}));
      document.querySelector('#submitBtn').click();
      return {stage: 'working', message: 'Credentials submitted. Checking verification.'};
    })(""" + json.dumps(payload) + ")"
    return js(expression)


def submit_code(payload):
    expression = """(data => {
      if (!location.hostname.endsWith('.duosecurity.com')) throw Error('Unexpected verification page');
      const field = document.querySelector('#passcode-input');
      if (!field) throw Error('Verification field is unavailable');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(field, data.code);
      field.dispatchEvent(new Event('input', {bubbles: true}));
      field.dispatchEvent(new Event('change', {bubbles: true}));
      const verify = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === 'Verify');
      if (!verify || verify.disabled) throw Error('Verification is not ready');
      verify.click();
      return {stage: 'working', message: 'Code submitted. Checking Canvas sign-in.'};
    })(""" + json.dumps(payload) + ")"
    return js(expression)


payload = json.load(os.fdopen(3))
action = payload.pop("action")
if action == "state":
    result = read_state(payload.get("step", "start"))
elif action == "login":
    result = submit_login(payload)
elif action == "code":
    result = submit_code(payload)
else:
    result = {"stage": "verification", "message": "Checking support for this verification step."}
payload.clear()
print(json.dumps(result))
