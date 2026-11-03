# Pilot Issue Triage

Use this guide to classify every pilot issue quickly and consistently.

## Critical

Examples:

- Unauthorized access
- Restricted data exposure
- Secret exposure
- Customer-data exposure
- Unapproved proof appearing in generation
- Production fixture fallback
- Wrong customer metric attribution

Expected response:

- Stop the affected workflow immediately.
- Capture a screenshot only if it does not expose sensitive data.
- Record the route, role, and steps.
- Do not continue wider testing of that workflow until fixed.

## High

Examples:

- Primary workflow unusable
- Repeated unsupported claims
- Conversation history consistently ignored
- Proof validation blocks valid output broadly
- Mobile navigation unusable
- Malformed output stored as success

Expected response:

- Restrict pilot usage of the affected workflow.
- File feedback with exact input type and expected result.
- Fix before expanding the pilot.

## Medium

Examples:

- Confusing state
- Weak fallback
- One route has mobile overflow
- Missing test-database coverage
- Inconsistent wording
- Copy action unreliable

Expected response:

- Document and prioritize.
- Continue pilot only if there is no safety risk and a workaround exists.

## Low

Examples:

- Minor spacing
- Optional copy improvement
- Non-blocking visual inconsistency
- Small label or helper-text issue

Expected response:

- Add to backlog.
- Do not block the limited pilot.

## Required Issue Details

- Severity:
- Route/workflow:
- Role:
- Viewport/device:
- Expected result:
- Actual result:
- Screenshot available:
- Sensitive data included: Yes / No
- Suggested next action:

