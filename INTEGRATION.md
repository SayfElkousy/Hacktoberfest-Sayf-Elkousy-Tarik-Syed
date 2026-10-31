# Labby ↔ recording service: integration contract (v1.0)

This is the contract between Labby's Live Session and the live recording / AI guidance service. The Labby side is implemented in `src/js/08-recording.js` (adapters), `src/js/07-session-api.js` (session engine and API) and `src/js/93-livesession.js` (UI and controller).

## How the pieces fit

```
Student browser                         Labby backend                 Recording service
───────────────                         ─────────────                 ─────────────────
Live Session UI ── LabSessionAPI ──────▶ progress, checkpoints,
   │                (authoritative)      help queue, approvals
   │
   └─ RecordingAdapter ── POST tokenUrl ─▶ checks enrollment, issues ─▶ (token)
                       ── WebSocket wsUrl ──────────────────────────▶ frames / questions
                       ◀─ guidance events ──────────────────────────
```

The recording service **only gives guidance**. It never completes steps, releases or approves checkpoints, or creates help requests. Labby's session API does all of that, and the student confirms step completion.

## Configuration

Set before the app script loads, for example in `index.template.html`:

```html
<script>
  window.LABBY_CONFIG = {
    recordingService: {
      tokenUrl: 'https://labby.example.edu/api/recording/token',   // Labby backend
      wsUrl: 'wss://recording.example.edu/v1/session'              // recording service
    },
    frameIntervalSec: 30,          // default automatic check interval (0 = only when asked)
    maxFrameWidth: 768,            // JPEG width for normal mode
    lowBandwidthFrameWidth: 480,
    jpegQuality: 0.7,
    lowBandwidthQuality: 0.55
  };
</script>
```

When `tokenUrl` and `wsUrl` aren't both set, the "Recording service" option shows as **Not configured** and students can use Claude (live AI on sampled photos) or the clearly labeled Simulated connection.

## 1. Token request (Labby backend)

`POST {tokenUrl}` with cookies:

```json
{ "contractVersion": "1.0", "sessionId": "…", "groupId": "…", "participantId": "…", "procedureVersionId": "…" }
```

The backend must verify that the participant is enrolled in the session's class period, is in that group, and that the session is open. It returns `{ "token": "short-lived", "wsUrl": "optional override" }`. Provider API keys never reach the browser.

## 2. WebSocket messages

**Client → service (JSON text frames)**

| type | fields | when |
|---|---|---|
| `hello` | `contractVersion`, `context` (SessionContext, below) | right after connect |
| `step` | `stepId`, `context` | the current step changed; drop any work for the old step |
| `question` | `requestId`, `sessionId`, `stepId`, `text` | the student typed a question |
| `pause` / `resume` | | camera paused or resumed |
| `bye` | | student left; close and clean up |

**Client → service (binary frames): sampled photos**

`[uint32 big-endian header length][UTF-8 JSON header][JPEG bytes]`, with header
`{ "type":"frame", "requestId", "sessionId", "stepId", "procedureVersionId", "capturedAt", "width", "height", "mime":"image/jpeg" }`.
Frames are sampled stills, not a video stream. If the socket's `bufferedAmount` is over 512 KB, Labby skips the frame and sends a fresh one later.

**Service → client (JSON)**

| type | fields |
|---|---|
| `capabilities` | `{ frames: bool, audio: bool, lowBandwidth: bool }` |
| `status` | `state`: `connected` · `paused` · `reconnecting` · `error`, `detail` |
| `guidance` | GuidanceEvent (below) |

## SessionContext (what Labby sends)

Student-visible information only. Teacher-only notes, answer keys and unreleased checkpoint questions are never included.

```json
{
  "contractVersion": "1.0",
  "sessionId": "…", "assignmentId": "…", "classId": "…", "periodId": "…", "projectId": null,
  "groupId": "…", "participantId": "…", "procedureVersionId": "…",
  "steps": [{ "id": "…", "index": 0, "title": "…", "instructions": "…", "minutes": 4, "materials": ["…"], "inputs": [{ "label": "Mass of metal", "unit": "g" }] }],
  "checkpointPlacement": [{ "id": "…", "afterStepId": "…", "blocks": true, "released": false }],
  "checkpoints": [{ "id": "…", "afterStepId": "…", "title": "…", "info": "…", "observe": "…", "questions": [{ "id": "…", "type": "mc", "prompt": "…", "options": [{ "id": "…", "text": "…" }], "unit": "" }] }],
  "guidanceRules": ["Ground guidance in the current teacher-approved step", "Never invent measurements or observations", "…"],
  "progress": { "currentStepId": "…", "completedStepIds": ["…"], "atCheckpointId": null, "finished": false }
}
```

`checkpoints` lists only released checkpoints. `checkpointPlacement` tells you where every checkpoint sits without revealing its content.

## GuidanceEvent (what the service sends)

```json
{
  "type": "guidance", "eventId": "unique", "requestId": "echo of the frame or question requestId",
  "sessionId": "…", "procedureVersionId": "…", "stepId": "…",
  "viewClear": true,
  "observation": "what is literally visible, or empty",
  "inference": "what the model thinks it means, or empty",
  "guidance": "one or two short sentences for the student",
  "suggestedAction": "none | show_clearer_view | confirm_step | pause_and_get_teacher",
  "stepMayBeComplete": false,
  "teacherHelpRecommended": false,
  "helpCategory": "Equipment | Procedure | Measurement | Other",
  "helpReason": "short reason, or empty"
}
```

Labby validates every event (`validateGuidance`) and **drops** it when the `sessionId`, `stepId` or `procedureVersionId` don't match the current request, when a newer request has superseded it, or when the group is at a checkpoint. A dropped event is counted on screen as "outdated AI response ignored".

Three states stay separate:
- **AI observation**: `observation` / `inference`, labeled as AI.
- **Suggested completion**: `stepMayBeComplete` or `confirm_step`. Labby shows a banner; nothing advances.
- **Confirmed completion**: only when the student presses "Mark step complete", or later a teacher setting allows otherwise.

Only `teacherHelpRecommended` events (and repeated unclear views) are passed to the teacher's Live Progress, labeled "model-generated". Everything else stays with the group.

## Session API events (Labby side)

All writes take an `eventId`; a repeated `eventId` is ignored, and repeating a step completion is a no-op (`duplicate`). These are emitted on `EventBus` and stored in `S.events`:

`session.entered` · `step.completed` · `checkpoint.released` · `response.saved` · `response.submitted` · `approval.requested` · `checkpoint.approved` · `checkpoint.returned` · `progress.updated` · `measurement.recorded` · `help.requested`

Matching operations in `LabSessionAPI`: `authorize`, `enter`, `completeStep`, `saveResponse` (draft or submit), `recordMeasurement`, `requestHelp`, `flag`, `setCamera` (one camera per group), `heartbeat`. Teacher approval uses `Engine.approve` / `Engine.returnForRevision`.

## Privacy and retention (current implementation)

- Labby stores no photos or video. "Video recording: Not saved" is always shown, because nothing records video.
- Guidance text (last 30 events per group) is saved with the group's progress.
- Teachers see progress, measurements, checkpoint answers and help-flag AI events. They never see photos.
- The recording service's own retention must be documented by that team and shown in the setup screen text in `privacyText('remote')`.
