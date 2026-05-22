# Action Catalog

These are the no-code actions available to testers in the Builder and Recorder.

## Browser Actions

- `goto` - navigate to a full URL or a path relative to Base URL
- `click` - click an element
- `type` - enter text into an element
- `select` - select an option
- `select_by_value` - select an option by exact value
- `wait` - wait for a configured number of milliseconds
- `upload_file` - upload a file through an input
- `download_file` - click and capture a download
- `screenshot` - request screenshot evidence
- `switch_to_frame` - switch following locator actions into a frame; use `main` to return to the page

## Validation Actions

- `verify_text` - verify visible text
- `get_page_title` - verify page title contains the expected result
- `is_disabled` - verify an element is disabled
- `is_enabled` - verify an element is enabled
- `string_contains` - verify text contains the expected result
- `json_validation` - validate that input is valid JSON, optionally containing expected JSON
- `schema_validation` - validate input JSON against a simple JSON schema

## Integration Actions

- `api_call` - call an API URL from input value; expected result can be a status code or response text
- `database_connection` - verify a database endpoint is reachable from a connection URL

## Record And Playback

The Recorder page builds a reusable no-code test by appending recorded steps to the selected test case. Playback runs the same test through the local Playwright runner and captures:

- step status
- message/error
- screenshot per step
- run video
- trace file

