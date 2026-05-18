# Engineering Standards

## Code & Communication Language

**Code**: English (USA) - identifiers, comments, tests, commit messages  
**Conversation**: Portuguese (PT-BR) - chat responses, explanations

## Core Principles

**Simplicity over cleverness**:
- Simple, readable, reusable solutions
- Check for existing logic before creating new
- Files must stay under 800-1000 lines (refactor when approaching limit)

**No duplicated logic**:
- Search codebase before implementing
- Extract reusable functions/utilities
- Consolidate similar patterns

**Environment separation**:
- Use environment variables for config (dev, staging, prod)
- Never modify `.env` without explicit approval
- Mock data only in tests, never in dev/prod

## TypeScript Standards

**MANDATORY rules**:
- ❌ **NEVER** use `any` type anywhere
- ❌ **NEVER** use `||` for defaults → use `??` (nullish coalescing)
- ✅ **ALWAYS** mark component props as `readonly`
- ✅ **ALWAYS** use `Promise.all()` when operations are independent

**Example - Wrong:**
```typescript
const value = user.name || 'Unknown';  // ❌ Wrong
const handler = (props: any) => { };   // ❌ Wrong
```

**Example - Correct:**
```typescript
const value = user.name ?? 'Unknown';  // ✅ Correct
const handler = (props: { readonly name: string }) => { };  // ✅ Correct
```

## Frontend Standards

**Mobile-first MANDATORY**:
- All frontend implementations must be mobile-first
- Design from smallest screen up
- Responsive breakpoints: mobile → tablet → desktop

## Safe Command Execution

**CRITICAL - Never execute without approval:**

### Destructive commands (Linux/macOS):
- `rm -rf /`, `rm -rf *`, `rm -rf .`, `rm -rf ~/`
- `mkfs`, `dd if=/dev/zero`, `umount /`
- `shutdown`, `reboot`, `init 0`, `halt`
- `chmod -R 777 /`, `chown -R user:group /`
- `curl ... | bash`, `wget ... | sh`

### Destructive commands (Windows):
- `del /f /s /q C:\*`, `rd /s /q C:\`
- `format C:`, `diskpart`
- `shutdown /s /t 0`, `shutdown /r /t 0`
- `powershell Invoke-WebRequest ... | Invoke-Expression`

### Requires confirmation:
- Modifying `.env`, `.git`, `.ssh`, config files
- Publishing: `git push`, `npm publish`, `docker push`, `kubectl apply`
- Commands outside project directory (`/usr`, `/etc`, `C:\Windows`)

**Rule:** Ask for explicit approval before running ANY destructive or sensitive command.

## Code Quality Requirements

**Tests (descriptions in English)**:
- Every new feature needs automated tests
- Unit tests for business logic
- Integration tests for cross-module flows
- Tests must be independent and descriptive

**No unnecessary comments**:
- Code should be self-explanatory
- Only add comments when WHY is non-obvious
- Remove commented-out code

**Dependencies**:
- Minimize external dependencies
- Use well-maintained, popular libraries
- Pin versions in `package.json`
- Check if similar dependency already exists before adding

**Linting & formatting**:
- Run `pnpm run lint` before commit
- Fix all lint errors
- Use eslint, prettier (or language equivalents)

## Security

- ❌ Never commit credentials or secrets
- ✅ Always validate and sanitize user input
- ✅ Keep dependencies updated
- ✅ Check for security alerts in dependencies

## Workflow

**Planning before coding:**
1. Understand the requirement fully
2. Ask 4-6 clarifying questions if needed
3. Propose a plan divided by phases
4. Wait for approval before implementing

**Small iterations:**
- Never generate complete system at once
- Code in small, testable steps
- Validate each step before proceeding

**Refactoring:**
- Refactor without changing behavior
- Extract functions when file grows
- Keep single responsibility

**Bug fixes:**
- Always identify root cause
- Add logs to diagnose
- Fix the cause, not the symptom
- Add test to prevent regression

## Approval Protocol

**Before making changes:**
- Only make clearly requested changes
- Confirm when adding new libraries/frameworks
- Check if change affects business rules, performance, or UX
- Remove old/redundant code when introducing new patterns

## When User Requests Code Directly

**Confirm the step first:**
> "Entendi que você quer [X]. Posso confirmar:
> 1. [Detalhe técnico 1]
> 2. [Detalhe técnico 2]
> 3. [Impacto esperado]
> 
> Posso prosseguir?"
