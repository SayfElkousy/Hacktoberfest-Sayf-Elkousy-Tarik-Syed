/* =====================================================================
   Sign in / create account with role selection (simulated auth).
   Production: real authentication; the role is stored server-side and
   every API call checks it. Passwords are never stored in this demo.
   ===================================================================== */
U.auth = { signin: { email: '', password: '', error: '' }, signup: { name: '', email: '', password: '', role: '', school: '', errors: {} } };

const ROLE_CARDS = [
  { role: 'student', ico: 'cap', title: 'Student', text: 'Join a teacher’s class with a code and get step-by-step guidance during assigned labs.' },
  { role: 'teacher', ico: 'board', title: 'Teacher', text: 'Create classes, prepare labs, follow each group’s progress, and answer help requests.' },
  { role: 'independent', ico: 'compass', title: 'Independent', text: 'Plan and run your own experiments outside a teacher-managed class.' },
];

function authView(route) {
  const isUp = route.name === 'signup';
  const a = U.auth;
  return html`<div class="auth-wrap"><main class="auth" id="main">
    <div class="auth-brand"><span class="brand-mark">${BRAND_MARK}</span><span class="brand-name">Labby</span></div>
    <div class="stack tight"><h1 id="page-title" tabindex="-1">${isUp ? 'Create your Labby account' : 'Sign in to Labby'}</h1>
      <p class="muted">Real-time guidance for classroom labs, from the lesson plan to the last cleanup step.</p></div>
    <div class="card">
      <div class="tabs" role="tablist" aria-label="Account">
        <a class="tab" role="tab" href="#signin" aria-selected="${!isUp}">Sign in</a>
        <a class="tab" role="tab" href="#signup" aria-selected="${isUp}">Create account</a>
      </div>
      <div style="padding-top:18px">${isUp ? signupForm(a.signup) : signinForm(a.signin)}</div>
    </div>
    <div class="demo-accounts stack">
      <div class="row wrap"><span class="demo-tag">${icon('zap', 'sm')}Demo accounts</span><span class="small">Simulated sign-in. No password is checked or stored.</span></div>
      <div class="row wrap">
        ${S.users.filter((u) => u.demo).map((u) => html`<button class="btn btn-sm btn-demo" data-action="demo-login" data-uid="${u.id}">${icon(u.role === 'teacher' ? 'board' : u.role === 'student' ? 'cap' : 'compass', 'sm')}${u.name} · ${u.role === 'independent' ? 'Independent' : cap(u.role)}${u.role === 'teacher' ? ' (sample classes)' : ''}</button>`)}
      </div>
    </div>
  </main></div>`;
}

function signinForm(f) {
  return html`<form class="stack" data-submit="signin" novalidate>
    ${f.error ? html`<div class="error-summary" role="alert">${f.error}</div>` : ''}
    ${field({ label: 'Email', id: 'si-email', bind: 'U.auth.signin.email', value: f.email, type: 'email', attrs: 'autocomplete="email"' })}
    ${field({ label: 'Password', id: 'si-pass', bind: 'U.auth.signin.password', value: f.password, type: 'password', attrs: 'autocomplete="current-password"' })}
    <div class="row between wrap"><button class="btn btn-primary" type="submit">Sign in</button><a href="#signup" class="small">New to Labby? Create an account</a></div>
  </form>`;
}

function signupForm(f) {
  const e = f.errors || {};
  return html`<form class="stack loose" data-submit="signup" novalidate>
    ${Object.keys(e).length ? html`<div class="error-summary" role="alert"><strong>Fix ${plural(Object.keys(e).length, 'field')} to continue.</strong></div>` : ''}
    <fieldset class="stack" style="border:0;padding:0;margin:0">
      <legend class="label" style="margin-bottom:8px">How will you use Labby?</legend>
      <div class="role-cards" role="radiogroup" aria-describedby="${e.role ? 'role-err' : ''}">
        ${ROLE_CARDS.map((r) => html`<label class="role-card">
          <input type="radio" name="role" value="${r.role}" data-bind="U.auth.signup.role" data-type="str"${attr(f.role === r.role, 'checked')}>
          <span class="role-ico">${icon(r.ico)}</span><span class="check-mark">${icon('checkCircle')}</span>
          <strong>${r.title}</strong><span class="small muted">${r.text}</span></label>`)}
      </div>
      ${e.role ? html`<div class="err" id="role-err">${icon('alert', 'sm')}${e.role}</div>` : ''}
      <p class="hint">Your role decides which dashboard you see after signing in. In this phase, only the teacher dashboard is fully built.</p>
    </fieldset>
    <div class="form-grid">
      ${field({ label: 'Full name', id: 'su-name', bind: 'U.auth.signup.name', value: f.name, error: e.name, attrs: 'autocomplete="name"' })}
      ${field({ label: 'Email', id: 'su-email', bind: 'U.auth.signup.email', value: f.email, type: 'email', error: e.email, attrs: 'autocomplete="email"' })}
      ${field({ label: 'Password', id: 'su-pass', bind: 'U.auth.signup.password', value: f.password, type: 'password', error: e.password, hint: 'At least 8 characters.', attrs: 'autocomplete="new-password"' })}
      ${field({ label: 'School or organization', id: 'su-school', bind: 'U.auth.signup.school', value: f.school, opt: true, attrs: 'autocomplete="organization"' })}
    </div>
    <div class="row between wrap"><button class="btn btn-primary" type="submit">Create account</button><a href="#signin" class="small">Already have an account? Sign in</a></div>
  </form>`;
}

function submitSignin() {
  const f = U.auth.signin;
  const email = f.email.trim().toLowerCase();
  const user = S.users.find((u) => u.email.toLowerCase() === email);
  if (!email || !f.password) { f.error = 'Enter your email and password.'; commit(); return; }
  if (!user) { f.error = 'No Labby account uses this email in this browser. Create an account, or use one of the demo accounts below.'; commit(); return; }
  f.error = ''; f.password = '';
  S.currentUserId = user.id; commit(); go(homeFor(user.role));
}
function submitSignup() {
  const f = U.auth.signup; const e = {};
  if (!f.role) e.role = 'Choose Student, Teacher or Independent.';
  if (!f.name.trim()) e.name = 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter an email address like name@school.edu.';
  else if (S.users.some((u) => u.email.toLowerCase() === f.email.trim().toLowerCase())) e.email = 'An account with this email already exists. Sign in instead.';
  if (f.password.length < 8) e.password = 'Use at least 8 characters.';
  f.errors = e;
  if (Object.keys(e).length) { commit(); const first = { role: 'input[name=role]', name: '#su-name', email: '#su-email', password: '#su-pass' }[Object.keys(e)[0]]; U.focusAfter = first; return; }
  const user = { id: uid(), name: f.name.trim(), email: f.email.trim(), role: f.role, school: f.school.trim(), createdAt: Date.now() };
  S.users.push(user); S.currentUserId = user.id;
  U.auth.signup = { name: '', email: '', password: '', role: '', school: '', errors: {} };
  commit(); go(homeFor(user.role));
  toast(`Account created. Welcome to Labby, ${user.name.split(' ')[0]}.`);
}
