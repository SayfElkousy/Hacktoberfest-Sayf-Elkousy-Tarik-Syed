# Labby — teacher dashboard prototype (phase 1)

The student side lives in [`student assistant/`](student%20assistant/README.md): students join with the class code and are guided through the lab by a local Gemma 4 model, with each lab group's progress flowing into Live Progress. Connect the two under Settings → Student site (see `src/js/85-student-site.js`).

A working, clickable prototype of Labby's website: account creation with role selection, simple student/independent placeholder pages, and the full teacher flow:

**Create class → share join code → plan or upload a lab → review and assign → monitor live progress → respond to help requests.**

## How it's built

Plain HTML, CSS and JavaScript with no framework or build tools to install. The files in `src/` are combined into one page by `build.py`:

```
python3 build.py      # writes dist/labby.html
```

Open `dist/labby.html` in a browser to run it (PDF import needs an internet connection to load the PDF reader).

| File | What's in it |
|---|---|
| `src/styles.css` | All styling, light and dark themes |
| `src/js/01-core.js` | Safe HTML templates, the screen-updating helper, icons, time formatting, browser storage |
| `src/js/02-models.js` | Data model definitions and calculations (group status, "may be behind", materials totals, procedure checks) |
| `src/js/03-seed.js` | Demo classes, students, labs, sessions and help requests |
| `src/js/04-services.js` | File reading (PDF/DOCX/TXT), procedure importer, AI planner (live + simulated), simulated student events |
| `src/js/05-store.js` | Saved state, routing, session/help/version actions |
| `src/js/06-ui.js` … `90-help.js` | One file per screen: sign-in, shell, procedure editor, overview, classes, Lab Designer, library/import/editor, live progress, help queue/settings |
| `src/js/99-app.js` | Click/typing handling, live clocks, startup |

## What's real and what's simulated

- **Sign-in**: simulated. Accounts live in the browser; passwords are never stored.
- **AI Lab Designer**: uses live Claude responses when the page is opened in Claude and the viewer allows it; otherwise a labeled simulated assistant answers. Group counts, totals, shortages and timing are always calculated by the app, not the AI.
- **File import**: PDF (text-based), DOCX and TXT are really read in the browser. Turning the text into steps is rule-based, and gaps are flagged rather than filled in.
- **Live student events**: produced by the demo controls on Live Progress and Help Queue.

## Backend work still needed for production

1. Real accounts and sign-in, with the role stored on the server.
2. A database for classes, enrollments, groups, labs and versions, sessions, progress and help requests (the shapes are documented at the top of `02-models.js`).
3. Server-side permission checks: teachers only see their own classes, students, sessions and help requests; a class code only grants enrollment.
4. A join-code endpoint for students (code → choose period → enroll).
5. A realtime channel so student devices send step progress, measurements, checkpoints and help requests, and the teacher view updates instantly.
6. An AI planning endpoint with your own API key, plus server-side PDF/DOCX parsing (including scanned PDFs via OCR) and file storage for originals.

## Phase 2 work in progress (not yet published)

Done so far:
- `02b-checkpoints.js`: teacher-authored checkpoints (questions, image, approval, group vs individual), student profiles, and workspaces (Teacher / Student / Research).
- `02c-release.js`: Student Visibility & Release rules, plus `studentLabView()`, the data-access layer student screens will use. It never includes teacher-only notes, answer keys or unreleased questions.
- `07-session-api.js`: the session engine for checkpoint gates, approvals, revisions, measurements, help requests and one camera per group. Every write takes an event ID, so repeated events are ignored.
- The teacher Live Progress view, demo controls and procedure editor now run on this engine (checked in a browser).

Still to build: student dashboard screens (onboarding, join by code/link, My Classes/My Labs, lab pages), the Live Session camera screen and recording-service adapter, teacher screens for release settings and checkpoint authoring, and the whole Research Workspace.
