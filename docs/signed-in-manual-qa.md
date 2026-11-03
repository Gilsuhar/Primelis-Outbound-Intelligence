# Signed-In Manual QA

Run this with legitimate invited users. Do not bypass Supabase Auth.

Viewports:

- 390 x 844
- 768 x 1024
- 1440 x 900

## SALES_USER

| Area | Action | Expected result | Failure signal | Severity if broken |
| --- | --- | --- | --- | --- |
| Login | Sign in with invited sales email | User reaches Home | Login loop or access denied for valid user | High |
| Home | Open `/` | Sales workspace appears | Blank page or admin-only content | High |
| Navigation | Review sidebar/menu | Sales routes visible, admin routes hidden | Admin route visible | Critical |
| Mobile menu | Open and close menu at 390 x 844 | Menu usable, user identity and sign out visible | Menu clipped or unreachable | High |
| Playbook | Open `/playbook` | Product, workflow, proof, and claims guidance visible | Missing start guidance | Medium |
| Account Research | Run limited-info account | Conditional guidance, unknowns preserved | Invented facts | Critical |
| ICP Insights | Open page and review content | Page loads and guidance is readable | Route fails | Medium |
| Create Outreach | Generate safe first message | No unsupported facts or internal labels | Unsafe or malformed output saved | High |
| Build Sequence | Generate short sequence | Distinct steps, safe proof, readable output | Duplicate/malformed sequence | High |
| Reply to Prospect | Paste objection scenario | Answers latest message first | Restarts pitch or ignores history | High |
| Ask Signal Brain | Ask claim-safety question | Approved-context answer with safe caveats | Unsupported claim | High |
| Draft Refinement | Shorten or change CTA | New version preserves safety | Proof or metric meaning changes | High |
| Do Not Contact | Search synthetic blocked account/domain | Blocked state is clear | Blocked account appears safe | Critical |
| Errors | Trigger a safe validation error | Sanitized message, no stack trace | Raw error or secret-like text | Critical |
| Sign out | Sign out | Returns to login | Session remains active | High |
| Session expiration | Reopen after session expiry | Safe login redirect | Broken or exposed state | High |

## KNOWLEDGE_ADMIN

| Area | Action | Expected result | Failure signal | Severity if broken |
| --- | --- | --- | --- | --- |
| Login | Sign in with invited admin email | Admin reaches Home | Valid admin blocked | High |
| Admin navigation | Review sidebar/menu | Admin routes visible | Missing admin routes | Medium |
| Sales routes | Open sales workflows | Sales workflows still usable | Admin cannot use sales routes | Medium |
| Knowledge Library | Open `/knowledge-library` | Records and filters load | Blank or unsafe error | Medium |
| Add Knowledge | Submit invalid then valid-safe test item | Invalid blocked, valid goes to review | Invalid factual claim accepted | High |
| Review Queue | Open queue | Reviewable items visible | Sales-only view or failure | High |
| Imported Signal Review | Review synthetic imported item | Imported data remains review-only | Auto-approved import | Critical |
| Claim Details | Open test claim | Sources and restrictions visible | Missing source safety state | High |
| Source management | Try source removal on approved factual claim | Final source removal blocked | Approved factual claim loses last source | Critical |
| Approval | Approve sourced item | Valid status transition and history | Approval without source | Critical |
| Restriction | Restrict safe test item | Restricted status and history | Restricted item remains generation-eligible | Critical |
| Rejection | Reject safe test item | Rejected status and history | Rejected item remains approved | Critical |
| Archive | Archive safe test item | Archived status and history | Archived item remains generation-eligible | Critical |
| Return to review | Move allowed item to review | Matrix respected | Invalid transition allowed | High |
| Review history | Inspect history | Accurate actor/action recorded | Missing history on success | Medium |
| Account Import | Preview synthetic CSV | Preview before write; no auto-approval | Writes without preview | High |
| Do Not Contact Import | Preview synthetic CSV | Duplicates and invalid rows reported | Invalid row imported | High |
| Direct URL protection | Open admin URL as sales user | Redirect/block | Sales user reaches admin page | Critical |

