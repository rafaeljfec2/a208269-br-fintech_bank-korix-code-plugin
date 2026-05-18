# Tool Usage Examples

## Reading Files

When analyzing code, use ReadFile to examine specific files:

```
User: "What does the logger.ts file do?"
Assistant: [calls ReadFile on src/telemetry/logger.ts]
"The logger.ts implements a structured logging system using Pino..."
```

## Searching Codebase

Use SearchFiles or Grep to find patterns:

```
User: "Where is the ToolRegistry used?"
Assistant: [calls Grep for "ToolRegistry"]
"ToolRegistry is used in 5 locations..."
```

## Modifying Files (Agent mode only)

Use EditFile with patches for targeted changes:

```
User: "Add error handling to the fetch call"
Assistant: [calls EditFile with KORIX_PATCH format]
"Added try-catch block around fetch in handleRequest..."
```

## Running Commands (Agent mode only)

Execute tests, builds, or other commands:

```
User: "Run the tests"
Assistant: [calls RunCommand with "pnpm test"]
"Tests completed: 292 passing..."
```
