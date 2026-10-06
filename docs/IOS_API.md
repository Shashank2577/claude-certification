# iOS client boundary (v1)

`GET /api/v1/study` returns a versioned learner bootstrap with the active certification, safe catalog metadata, and the current review tasks. It never sends answer keys, explanations for unanswered questions, or admin data. `POST /api/v1/content-reports` accepts a learner's content issue report. Both currently use the web session cookie.

An embedded WKWebView can use the web app and these endpoints with the existing cookie session. A standalone native app still needs a dedicated sign-in/token lifecycle, CSRF policy, and parity endpoints for practice, flashcards, mock autosave, and progress before replacing the web flows. Keep scoring and mock deadlines on the server; do not embed the content bank or correct answers in the iOS bundle.

The response contract has `version: 1`; add fields compatibly, and introduce `/api/v2` for breaking changes. Personal responses use `Cache-Control: private, no-store`.
