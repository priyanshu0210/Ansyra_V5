# Codex working instructions

Optimize for minimal token and tool usage. Apply these instructions throughout this repository.

- Do not scan the entire repository unless explicitly requested.
- Identify the smallest set of files relevant to the task first.
- Read only those files.
- Do not inspect node_modules, build output, generated files, or unrelated assets.
- Do not run broad searches repeatedly.
- Do not run the full test suite unless necessary.
- Prefer targeted tests for files/components being changed.
- Make minimal changes necessary to solve the requested problem.
- Do not refactor unrelated code.
- Do not use sub-agents unless the task clearly requires them and the user explicitly requests them.
- Do not perform additional audits unless requested.
- Keep explanations concise.
- If a task has been completed successfully, stop instead of searching for additional improvements.
