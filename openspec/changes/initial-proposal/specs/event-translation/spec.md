# event-translation Specification

## Purpose

Ensure all tracking events are returned and stored in English by leveraging the 17Track API's built-in translation capability, avoiding the need for a separate translation service.

## Requirements

### Requirement: 17Track Translation at Registration

The system MUST request English translation from the 17Track API when registering a tracking number for monitoring.

#### Scenario: Event from Chinese carrier

- GIVEN a tracking from a Chinese carrier returns an event with Chinese description "包裹已到达分拣中心"
- WHEN the system requests the event with translation parameter set to English
- THEN 17Track returns the description translated to "Package arrived at sorting center"
- AND the English version is stored in the database

### Requirement: English Storage

All event descriptions MUST be stored in English in the database and MUST be sent in English in notifications.

#### Scenario: Event with partial translation

- GIVEN a tracking event has mixed Chinese and English fields from 17Track
- WHEN the system stores the event
- THEN only the English-translated description is persisted
- AND the email notification contains only the English description

### Requirement: No Separate Translation API

The system SHOULD NOT integrate or require a separate translation service (e.g., DeepL, Google Translate) for MVP functionality.

#### Scenario: Carrier without translation support

- GIVEN a tracking from a small carrier whose events 17Track does not translate
- WHEN the system receives an event with only the original-language description
- THEN the original description is stored as-is
- AND the system continues monitoring without error
- AND the original text is included in the notification email
