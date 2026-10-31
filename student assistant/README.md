# Student Assistant

The student side of a lab tutor. The teacher's dashboard creates a lab and generates its join code. A student types that code here, this site gets the procedure, breaks it down into the equipment and steps it needs, and walks the student through it, out loud and on screen. It looks through their webcam to identify equipment, check their work and measure things. It asks questions as they go and reports every student's progress back to the dashboard live.

It works from any procedure, in any format. Nothing depends on the camera: anything it can't see, it asks the student about instead.

Everything runs on one laptop. Student video never leaves it.

## What does what

| Job | Done by |
| --- | --- |
| Reading the procedure, deciding how to check each step | Gemma 4 |
| Finding equipment and objects in the camera | Gemma 4 |
| Judging whether a step was done correctly | Gemma 4 |
| Writing questions, grading answers, helping students | Gemma 4 |
| Turning positions into angles and lengths | Plain arithmetic in `shared/measure.ts` and `server/refine.ts` |
| Speaking out loud | Kokoro, an open-source voice model, because Gemma 4 only outputs text |
| Hearing students | The browser's speech recognition. Typing always works too. |

## Setup

You need [Node.js](https://nodejs.org) 24 or newer and [Ollama](https://ollama.com).

Download the model:

```bash
ollama pull gemma4:e4b
```

Install, then build the site:

```bash
npm install
```

```bash
npm run build
```

Start it:

```bash
npm start
```

The first start downloads the Kokoro voice model, about 310 MB, into `~/.cache/student-assistant`. When it's up, the server prints the address students use, a test page, and the dashboard token.

## Running a class

The teacher runs the class from Labby, the dashboard in this repo. Open `dist/labby.html`, go to **Settings**, and under **Student site** enter this server's address and dashboard token. Labby then publishes each active session under the class join code, with the period's lab groups as teams.

Students open the `https://` address the server printed, type the class code and pick their lab group. Each group's steps, measurements, answers, help requests and safety alerts appear in Labby's Live Progress and Help Queue. Labby has to stay open, because the connection runs in the teacher's browser.

To try the student site without Labby, use the test page at `http://localhost:8080/teacher-test.html`.

Students will see a security warning the first time, because the laptop's certificate is self-signed. They click **Advanced**, then **Proceed**. Browsers only allow webcam access over HTTPS, so this can't be skipped.

**Use a network that lets devices reach each other.** Guest and campus Wi-Fi often blocks this, so students won't be able to load the page. If that happens, run a hotspot from a phone or use a small router, and connect the laptop and all students to it. The laptop's address changes on a new network, so restart the server and use the new address it prints.

Windows asks whether to allow Node through the firewall the first time. Allow it for the network type you're using, or other devices can't connect.

**Use Chrome or Edge.** Speech recognition and USB sensors need them. Everything else works in other browsers.

## How steps get checked

When a lab is created, Gemma reads each step and picks how to check it:

| Mode | Used when | What happens |
| --- | --- | --- |
| `camera` | The result can be seen | Gemma judges the webcam picture. If it can't tell, the student is asked instead. |
| `measure` | An angle or length matters | Measured from the picture, then compared with the procedure. If it can't be measured, the student is told the target and can enter their own value. |
| `sensor` | A probe or meter is read | Takes readings over USB, or typed or pasted in. |
| `ask` | Only the student can say | Asks a question and grades the answer. |

Every step can be finished without the camera. If there's no camera, or it can't see what it needs, the student is asked or enters the value themselves.

## Getting good measurements

- Point the camera straight at the thing being measured, side-on, so it isn't seen at an angle.
- Keep the camera level. Angles are measured against the bottom of the picture, so a tilted webcam tilts every angle.
- Lengths need a ruler or metre stick in view, at the same distance from the camera as the object.
- Good contrast helps. A dark object on a light background measures best.

## Tested accuracy

Finding equipment was scored on 26 real photos and 14 everyday scenes with no lab gear, against a hand-checked answer key:

| How it's asked | Items found | Reported when absent |
| --- | --- | --- |
| "Detect this object" (the old way) | 27 of 28 | 65 of 135 checks |
| What the app does now | 27 of 28 | 1 of 135 checks |

An item must also be seen on two separate looks before it's ticked, and students can correct a wrong tick.

Measurements come from drawn test scenes with known true values, not a real webcam, so expect real results to be rougher, especially in poor light:

| Measurement | Result |
| --- | --- |
| Angle, 2° to 30° | Within 0.1° |
| Length with a ruler in view | Within about 1.5% |

## Class size

Gemma runs one request at a time on the GPU, so students share it. Measured on an RTX 5060 with 8 GB of memory:

| Students | Typical wait | Worst wait |
| --- | --- | --- |
| 10 | 1.7 s | 4.7 s |
| 25 | 2.9 s | 11.4 s |

Students waiting on an answer always go ahead of background camera checks. These numbers cover step checks and questions. The equipment scan takes several requests per item, so it runs in the background and takes longer when a whole class starts at once.

## Development

```bash
npm test
```

```bash
npm run typecheck
```

`npm run dev` runs the server and a live-reloading site together. Open `http://localhost:5173`.

Settings are in `.env`. Copy `.env.example` to create it.

The layout:

- `server/brain.ts`: every prompt sent to Gemma
- `server/gemma.ts`: the Ollama client and the GPU queue
- `server/refine.ts`: snaps Gemma's rough position onto real edges in the picture
- `server/student-routes.ts`: the lab flow
- `server/dashboard-routes.ts`: the API for the teacher dashboard, documented in [docs/DASHBOARD_API.md](docs/DASHBOARD_API.md)
- `server/labs.ts`: turns a join code into a ready lab, and works out each team's progress
- `shared/measure.ts`: the arithmetic behind angles and lengths
- `web/styles.css`: the design system. All colours, spacing and type sizes are tokens at the top
- `web/`: the student site

A few things Gemma is particular about, all noted in the code:

- Send images stretched to 3:2. At other shapes, its positions come back distorted.
- Ask for the answer it should reason from first. Putting `visible`, `verdict` or `correct` before the box, description or claim makes it agree without looking.
- Ask about one thing at a time. It's far better at many small questions than one big one.
- Never name an object to find out if it's there. Have it list what it sees first, or describe the picture before answering. Asked to detect a named object, it reports one nearly half the time when there's none, at any image size.
