# AGENTS.md — BCMap Editor

Guidelines for AI agents working in this repository.

## Docker test hygiene (required)

The E2E/unit test stack lives in `docker-compose.test.yml`.

- **Tear the stack down after every test run**, before finishing your task:
    ```bash
    docker compose -f docker-compose.test.yml down --volumes --rmi local
    ```
    This removes the test containers, anonymous volumes, and locally built test images (including the large Playwright-based ones).
- **Don't leave duplicates behind.** Past sessions accumulated stale artifacts — an orphan `bcmap-test` image and exited test containers/volumes older than 3 weeks — because stacks were rebuilt without cleanup. Before finishing, check:
    ```bash
    docker ps -a | grep -i bcmap
    docker images | grep -i bcmap
    ```
    Expected: only the long-lived dev stack from `docker-compose.yml` may remain (and only when the task needs it).
- **Reuse images when re-running tests** unless `Dockerfile.test` or dependencies changed. The npm scripts always pass `--build`; to reuse images, invoke Compose directly:
    ```bash
    docker compose -f docker-compose.test.yml up --no-build --abort-on-container-exit test
    ```
    Rebuilding the test image is slow because the Playwright base is large (~1 GB).
- If a test run is interrupted, clean up the previous one before starting a new one.
