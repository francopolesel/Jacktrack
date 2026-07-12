# email-notifications Specification

## Purpose

Send email notifications via Resend when new tracking events are detected. Each notification includes all new events for a tracking in a single email, and events are never re-sent.

## Requirements

### Requirement: Conditional Sending

The system MUST send an email ONLY when new events are detected for a tracking.

#### Scenario: One new event

- GIVEN tracking "1Z999AA10123456784" has 1 new event after a poll
- WHEN the scheduler finishes processing the poll
- THEN the system sends one email to the registered address
- AND the email includes the single new event

#### Scenario: No new events (no email)

- GIVEN a poll returns no new events for any tracking
- WHEN the scheduler finishes processing
- THEN the system sends zero emails
- AND no notifications are queued

### Requirement: Single Email per Batch

The system MUST include ALL new events for a tracking in a SINGLE email.

#### Scenario: Multiple new events

- GIVEN tracking "1Z999AA10123456784" has 3 new events after a poll
- WHEN the notification is sent
- THEN the email contains all 3 events in a single message
- AND the recipient receives exactly one email, not three

### Requirement: No Duplicate Sending

The system MUST NOT re-send events that have already been sent via email.

#### Scenario: Stored sent-flag

- GIVEN an event was already included in a previous email
- WHEN a later poll re-fetches the same event from 17Track
- THEN that event is NOT included in any new email
- AND the sent-flag in the database prevents re-sending

### Requirement: Email Content

The email MUST include the tracking number, a list of events with location and description.

#### Scenario: Email format verification

- GIVEN tracking "1Z999AA10123456784" has a new event in "Shenzhen" with description "Package received at sorting facility"
- WHEN the email is sent
- THEN the body contains the tracking number "1Z999AA10123456784"
- AND the body contains the location "Shenzhen"
- AND the body contains the description

### Requirement: Email Subject

The email subject MUST be "New tracking update".

#### Scenario: Subject line

- GIVEN any new tracking event triggers an email
- WHEN the email is sent
- THEN the subject line is exactly "New tracking update"

### Requirement: Resend API

The system MUST use the Resend API for sending emails.

#### Scenario: Send via Resend

- GIVEN new events are detected for a tracking
- WHEN the system sends the notification
- THEN it calls the Resend API with the recipient email, subject, and HTML body

### Requirement: Send Failure Handling

The system MUST handle Resend API failures without losing event data.

#### Scenario: Resend API is unavailable

- GIVEN new events are detected for a tracking
- WHEN the Resend API returns an error
- THEN the system logs the failure
- AND the events remain marked as unsent
- AND the system retries on the next poll cycle
- AND no events are lost
