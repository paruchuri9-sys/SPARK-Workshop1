# SPARK reusable meeting poll

## Initial poll: SPARK Core Educators Meeting
- Dates: Wednesday October 28 and Thursday October 29, 2026.
- One-hour availability options starting at **2, 3, 4, 5, 6, and 7 PM** on each day, Central Time.
- Thursday is labelled **preferred**; respondents may choose any or all slots.
- Optional classroom question: "Would you be able to test the SPARK classroom scenario and share your findings with your class before Thursday? This is optional." Choices: Yes / Maybe / No.

## Setup (organizer)
1. **First publish the merged `v2/database.rules.json` in Firebase Console → Realtime Database → Rules.** The old rules do not permit poll writes. Inspect and reconcile with production before replacement. Publishing a GitHub file does not deploy database rules.
2. Open `https://paruchuri9-sys.github.io/SPARK-Workshop1/schedule-admin.html` in your intended organizer browser. The form starts with the SPARK meeting details. Click **Create meeting poll**.
3. Copy the generated teacher link. Send only the teacher link, which looks like `schedule.html?poll=<random-code>`.
4. Keep the same organizer browser and browser profile. Firebase Anonymous Authentication owns the poll; a copy of the organizer URL opened elsewhere **does not** grant access to names. Clearing browser storage may permanently lose organizer access. Download the CSV as a backup after responses.
5. Organizer page shows names, answers, per-slot availability, and CSV download. Teacher page shows only counts and input fields.

## Reuse
Create another poll from `schedule-admin.html` with a new title, two dates, starting/ending hours, preferred date, and Yes/Maybe/No question. It receives a new random poll code and independent responses. The current form supports two dates and one-hour slots; edit `schedule-admin.html` to support more dates or a different question type.

## Data/privacy limits
- Named responses stored at `meetingPolls/{pollId}/entries/{anonymousAuthUid}`, readable only by organizer or the corresponding respondent under the shipped rules.
- Public totals are calculated client-side from `meetingPolls/{pollId}/votes/{anonymousAuthUid}`; these records have **no names**, but authenticated technically savvy visitors could inspect **pseudonymous individual availability and auth UIDs** through Firebase. UI shows totals only. **This is not a counts-only backend or truly anonymous availability design.** For stronger privacy deploy a trusted server-side tally function with only aggregate counts publicly accessible.
- Participants can update their response using the same browser/auth session. Clearing cookies/browser storage may produce a second response.
- Rules prevent one participant editing another user's record, but without a trusted backend the public vote path can be manipulated by someone writing directly via the API. This is a low-stakes scheduling poll, not a secure election or audited survey.
- Store the organizer CSV securely; it contains names.
- Test Firebase rules with two independent student browsers, one owner browser, and one unrelated browser before emailing the poll.

## Test
- Create a disposable poll; submit with two participant browsers, choose overlapping/non-overlapping times, verify public counts, edit one response and check counts change.
- Verify owner page sees names and CSV matches; unrelated signed-in browser must receive permission denied for `entries`.
- Verify one participant cannot write to another UID entry; unknown slot IDs are rejected; a poll without a valid owner cannot be populated.
- Confirm data retention and deletion requirements with SPARK's applicable institutional procedures.
