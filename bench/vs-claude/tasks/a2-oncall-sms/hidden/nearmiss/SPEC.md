# SMS on-call paging for the log platform

## Scope
The platform raises a page by SMS to the engineer on call when an alert rule fires. A page carries a masked summary of the triggering log line, a link to the full line behind authentication, and a short alert id. The engineer acknowledges by replying "ACK <id>" or in the console. An alert that is not acknowledged is escalated to the manager of the on-call rota.

Functional requirements:
- Alert rules are evaluated on ingestion; each rule has a name, a condition, a severity and a rota.
- A page for severity high or critical is sent immediately, individually, without batching.
- Pages for lower severities are grouped into one SMS per engineer per 15-minute window.
- Every page, acknowledgement and escalation is written to the audit log with a timestamp.
- Customer identifiers (account number, name, phone, email, IP) are masked before the text leaves the platform.

## Open questions and assumptions
1. Personal data in the SMS. The request wants the full log line in every page, but the data-protection policy forbids sending any customer identifier to a third-party SMS provider. These two requirements conflict, because a full log line contains identifiers. Assumption: the SMS contains the masked summary and an authenticated link to the full line; the customer must confirm that this satisfies "full log line" and which fields count as customer identifiers.
2. Latency versus batching. The 1-minute delivery target contradicts the 15-minute batch, because a batched alert can wait up to 15 minutes. Assumption: high and critical alerts bypass batching and are sent within 1 minute; only low severities are batched. The customer must confirm which severities may wait.
3. Coverage outside business days. The service must run 24/7, but on-call is staffed on business days only. Assumption: outside business days and public holidays pages go to a named fallback contact, and the rota uses UTC+7. The customer must confirm who is paged at weekends and on holidays, and the holiday calendar.
4. Escalation. "Nobody reacts" is not defined. Assumption: an alert is acknowledged when the engineer replies ACK; with no acknowledgement within 10 minutes the platform escalates to the manager on the rota, then repeats every 10 minutes up to three times. The customer must confirm the acknowledgement rule, the timeout, and who "a manager" is (name, role, deputy).
5. What triggers a page. "Something goes wrong" is not specified. Assumption: alert rules are supplied by the customer; until then we ship three default rules (error rate above 5% for 5 minutes, service heartbeat missing for 3 minutes, authentication failures above 50 per minute). The customer must confirm which events and thresholds should page.
