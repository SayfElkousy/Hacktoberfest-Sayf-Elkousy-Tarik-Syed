# Connecting the teacher dashboard

The dashboard creates a lab, generates its join code, and holds the procedure. Students type that code into the student site. The student site gets the procedure for that code, breaks it down, and guides the student. Progress goes back to the dashboard live.

## Labby

Labby, in this repo, is already connected, through `src/js/85-student-site.js`. Labby has no server yet, so the connection runs in the teacher's browser. Open it at `http://localhost:8080/labby` and it connects by itself. Opened any other way, set the address and token under **Settings → Student site**. While a session is active:

- The session is published under its live session code, with Labby's own steps and the period's lab groups as teams.
- Every 3 seconds, each group's progress is read back and applied through `LabSessionAPI`: completed steps, measurements, answers, help requests and safety alerts.
- Blocking checkpoints with questions are sent to that group's students, and their answers are submitted as the checkpoint response. Teacher approval still happens in Labby.

The rest of this page describes the API for anything else that connects, and for when Labby gets a server. `web/teacher-test.html` is a small working example.

## Teams

Send `teams` with a lab and students choose one when they join:

```json
{
  "code": "ABC123",
  "procedure": "...",
  "teams": [{ "id": "g1", "name": "Group 1" }],
  "steps": ["Weigh the empty beaker.", "Pour in the water."]
}
```

`steps` is optional. Send your own step list and the plan's steps match it one to one, so `s3` is your third step.

`GET /api/dashboard/labs/{code}` includes `teams`, one [TeamProgress](#teamprogress) per team. A team moves as its furthest member does. Teacher questions can target teams with `"teamIds": ["g1"]`.

## Getting the procedure to the student site

Use either way, or both.

### Option 1: the student site asks the dashboard

Set these in the student site's `.env`:

```
DASHBOARD_URL=https://your-dashboard.example
DASHBOARD_KEY=optional-secret
```

The dashboard then needs one endpoint:

`GET /api/labs/{code}`

Return the procedure for that join code as plain text in any format:

```json
{ "procedure": "Double displacement reaction. You need two test tubes..." }
```

Return `404` if the code doesn't exist. A plain-text reply also works, and so does an array of step strings.

If `DASHBOARD_KEY` is set, requests carry `Authorization: Bearer <key>`.

To use a different path, set `DASHBOARD_LAB_PATH`, for example `/labs/{code}/procedure`.

The dashboard is asked every time a student joins, with replies reused for 5 seconds. If the teacher edits the procedure, new students get the new version, and students part way through keep the one they started on.

### Option 2: the dashboard sends it to the student site

`POST /api/dashboard/labs`

```json
{
  "code": "ABC123",
  "procedure": "Double displacement reaction. You need two test tubes..."
}
```

Sending a new procedure for the same code replaces it. Leave out `code` and the student site generates one.

Returns `202` with a [Lab](#lab). It's usually `ready` within seconds.

## Getting progress from the student site

Use either way, or both.

### Option 1: the student site posts it to the dashboard

If `DASHBOARD_URL` is set, each change to a student is sent, at most once a second per student:

`POST /api/labs/{code}/progress`

```json
{ "code": "ABC123", "team": { "id": "g1", "name": "Group 1" }, "student": { } }
```

`student` is a [StudentProgress](#studentprogress). Change the path with `DASHBOARD_PROGRESS_PATH`, or set it empty to turn this off.

### Option 2: the dashboard reads it from the student site

`GET /api/dashboard/labs/{code}` returns `{ "lab": Lab, "students": StudentProgress[], "teams": TeamProgress[] }`.

`GET /api/dashboard/labs/{code}/stream` is a live [server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) stream. It sends the lab and every student when you connect, then each change as it happens.

```js
const events = new EventSource(`${base}/labs/${code}/stream?token=${token}`);

events.onmessage = (message) => {
  const event = JSON.parse(message.data);
  if (event.type === 'lab') showLab(event.lab);
  if (event.type === 'student') showStudent(event.student);
};
```

## Calling the student site

| Dashboard runs on | Base address |
| --- | --- |
| The same laptop | `http://localhost:8080/api/dashboard` |
| Another computer | `https://<laptop address>:8443/api/dashboard` |

The server prints its address and token when it starts. It uses a self-signed certificate, so a dashboard on another computer has to trust it. In a browser, open the address once and click through the warning first.

Every call to these endpoints needs the token:

```
Authorization: Bearer <token>
```

`EventSource` can't set headers, so the stream also accepts `?token=<token>`.

Requests from other websites are allowed. Errors come back as `{ "error": "message" }` with a matching status code.

## Teacher actions

### Ask students a question

`POST /api/dashboard/labs/{code}/prompts`

Which fields you send decides what happens:

```json
{ "question": "What colour is your solution right now?" }
```

Asks that exact question.

```json
{ "topic": "why a precipitate forms" }
```

Gemma writes a comprehension question on that topic, fitted to the step each student is on.

```json
{}
```

Gemma picks the most important idea so far and writes a question on it.

Add `"studentIds": ["..."]` to ask only certain students. Without it, the whole class gets the question.

The question appears on students' screens straight away and is read aloud. A student who's offline gets it when they reconnect.

Returns `{ "sent": [{ "studentId", "promptId", "question" }] }`. Answers arrive with the student's progress, in `answers`.

### Clear a help request

`POST /api/dashboard/labs/{code}/students/{studentId}/resolve` clears `helpRequested` and `alert` once the teacher has dealt with them.

### End a lab

`POST /api/dashboard/labs/{code}/end` tells students the lab is over and stops new ones from joining. Sending the procedure again reopens it.

### List labs

`GET /api/dashboard/labs` returns an array of [Labs](#lab).

## Data

### Lab

```ts
{
  id: string;
  code: string;            // the join code
  procedure: string;
  teams: { id: string; name: string }[];
  knownSteps: string[] | null;
  status: 'preparing' | 'ready' | 'failed' | 'ended';
  plan: LabPlan | null;    // null until ready
  error: string | null;    // set when status is "failed"
  createdAt: number;       // milliseconds since 1970
}
```

### LabPlan

What Gemma worked out from the procedure.

```ts
{
  title: string;
  subject: string;
  objective: string;
  components: { id: string; name: string; lookFor: string; quantity: number }[];
  steps: {
    id: string;
    title: string;
    instruction: string;
    mode: 'camera' | 'measure' | 'sensor' | 'ask';
    lookFor: string;
    confirmQuestion: string;
    measurement: {
      kind: 'angle' | 'length';
      subject: string;
      target: number | null;
      tolerance: number | null;
      unit: 'deg' | 'cm';
    } | null;
    tracks: string[];      // ids of the components this step involves
    questions: { id: string; question: string; expected: string; kind: 'observation' | 'comprehension' }[];
    safety: string | null;
  }[];
}
```

`expected` is never sent to students.

### TeamProgress

```ts
{
  id: string;
  name: string;
  members: string[];        // student names
  online: number;
  stepsDone: number;
  totalSteps: number;
  finished: boolean;
  helpRequested: boolean;
  alert: string | null;
}
```

### StudentProgress

```ts
{
  id: string;
  name: string;
  labId: string;
  teamId: string | null;
  teamName: string | null;
  joinedAt: number;
  lastSeen: number;
  online: boolean;
  phase: 'components' | 'steps' | 'done';
  currentStep: number;      // index into plan.steps

  // Keyed by component id.
  components: Record<string, 'unknown' | 'seen' | 'confirmed' | 'missing'>;

  steps: {
    stepId: string;
    status: 'pending' | 'active' | 'passed' | 'needs_attention' | 'skipped';
    attempts: number;
    lastFeedback: string | null;
  }[];

  measurements: {
    stepId: string;
    label: string;
    value: number;
    unit: string;
    target: number | null;
    withinTolerance: boolean | null;
    source: 'camera' | 'sensor' | 'student';
    at: number;
  }[];

  answers: {
    promptId: string;
    stepId: string | null;
    question: string;
    answer: string;
    correct: boolean;
    feedback: string;
    askedBy: 'teacher' | 'procedure';
    at: number;
  }[];

  helpRequested: boolean;   // the student pressed "Get teacher" or marked equipment missing
  alert: string | null;     // something the teacher should look at, such as a reported spill
}
```

Show `alert` prominently. It's set when a student reports something unsafe or Gemma sees it on camera.

## Things to know

- Codes are matched ignoring case, since students type them by hand.
- Labs and progress are saved to `data/state.json`, so they survive a server restart. Webcam frames are never stored.
- A question that hasn't been answered is lost if the server restarts.
- `measurements` keeps every attempt, so a student who corrected an angle shows both readings. The last one for a step is their final value.
