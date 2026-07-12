# tracking-registration Specification

## Purpose

Allow anonymous users to register a tracking number and email for automated monitoring. The form accepts input, validates both fields, persists valid registrations to SQLite, and returns feedback via HTMX inline updates.

## Requirements

### Requirement: Form Input

The system MUST accept a tracking number (text, required) and email (email, required) via an HTMX-submitted form.

#### Scenario: Valid registration

- GIVEN a user with a valid tracking number "1Z999AA10123456784" and email "user@example.com"
- WHEN the user submits the form
- THEN the registration is persisted to SQLite
- AND the system returns a success message via HTMX

### Requirement: Tracking Number Validation

The system MUST validate that the tracking number is alphanumeric and between 8-40 characters.

#### Scenario: Invalid tracking number — too short

- GIVEN a user submits tracking number "AB12" (4 characters) with a valid email
- WHEN the form is submitted
- THEN the system returns an inline validation error "Tracking number must be 8-40 alphanumeric characters"
- AND the registration is NOT persisted

#### Scenario: Invalid tracking number — special characters

- GIVEN a user submits tracking number "ABC-123-456" (contains hyphens)
- WHEN the form is submitted
- THEN the system returns an inline validation error for the tracking number field
- AND the registration is NOT persisted

### Requirement: Email Validation

The system MUST validate that the email address matches a standard email format.

#### Scenario: Invalid email format

- GIVEN a user submits a valid tracking number with email "not-an-email"
- WHEN the form is submitted
- THEN the system returns an inline validation error "Please enter a valid email address"
- AND the registration is NOT persisted

### Requirement: Duplicate Detection

The system MUST detect and reject duplicate tracking number + email combinations that are already registered.

#### Scenario: Duplicate tracking and email

- GIVEN the combination of tracking number "1Z999AA10123456784" and email "user@example.com" is already registered
- WHEN the same combination is submitted again
- THEN the system returns an inline message indicating the tracking is already being monitored
- AND no duplicate registration is created

### Requirement: Anonymous Access

The system MUST NOT require authentication for registration.

#### Scenario: Unauthenticated registration

- GIVEN an unauthenticated user accesses the registration form
- WHEN the user submits valid tracking and email
- THEN the registration succeeds
- AND no login or session is required

### Requirement: Error Handling

The system MUST return a user-friendly error message if persistence fails due to a server error.

#### Scenario: Server error during persistence

- GIVEN the database is unavailable
- WHEN a user submits a valid registration form
- THEN the system returns a generic error message "Something went wrong. Please try again."
- AND the registration is NOT persisted
