# tracking-monitoring Specification

## Purpose

Periodically poll the 17Track API for all active (non-delivered) tracking registrations, detect new events, persist them, and stop monitoring once delivery is confirmed. State is fully persisted in SQLite so the schedule survives server restarts.

## Requirements

### Requirement: Poll All Active Trackings

The system MUST poll the 17Track API for ALL active tracking numbers that have not yet reached delivery-confirmed status.

#### Scenario: First check — all events new

- GIVEN 3 active trackings exist with no prior event history
- WHEN the scheduler triggers its first poll
- THEN all current events from 17Track are persisted as new events
- AND each event is stored with the current timestamp

#### Scenario: Subsequent check — some new events

- GIVEN 2 trackings have existing event histories
- WHEN the scheduler polls 17Track again
- THEN only events not already in the stored history are persisted as new
- AND previously stored events are not duplicated

#### Scenario: No new events

- GIVEN all trackings have unchanged event histories since the last poll
- WHEN the scheduler polls 17Track
- THEN no new events are persisted
- AND the last-check timestamp is updated

### Requirement: Batch Requests

The system MUST batch tracking numbers into requests of up to 40 per API call.

#### Scenario: More than 40 active trackings

- GIVEN 95 active trackings exist
- WHEN the scheduler polls 17Track
- THEN the system makes 3 API calls (40 + 40 + 15)
- AND all trackings are checked without error

### Requirement: Delivery Detection

The system MUST stop monitoring a tracking when 17Track confirms delivery.

#### Scenario: Delivery confirmed

- GIVEN a tracking reaches "Delivered" status according to 17Track
- WHEN the scheduler processes the poll response
- THEN the tracking is marked as delivered
- AND it is excluded from future polls

### Requirement: Restart Survival

The system MUST continue polling after a server restart, using persisted state from SQLite.

#### Scenario: Server restart

- GIVEN 10 active trackings existed before a server restart
- WHEN the server starts up
- THEN the scheduler loads active trackings from SQLite
- AND resumes polling at the configured interval
- AND no trackings are lost or double-polled

### Requirement: Polling Interval

The system SHOULD poll every 15 minutes.

#### Scenario: Scheduled interval

- GIVEN the system is running
- WHEN 15 minutes have elapsed since the last poll
- THEN the scheduler triggers a new poll cycle

### Requirement: API Error Handling

The system MUST handle 17Track API errors gracefully and continue monitoring.

#### Scenario: 17Track API returns an error

- GIVEN the 17Track API is temporarily unavailable
- WHEN the scheduler attempts a poll
- THEN the system logs the error
- AND the scheduler retries on the next interval
- AND no trackings are incorrectly marked as delivered
