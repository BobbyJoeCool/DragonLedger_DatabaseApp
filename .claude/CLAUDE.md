# Claude Instructions — DragonLedger DatabaseApp

## Permissions

### Always allowed without asking
- `ls`, `find`, `cat`, `grep`, `wc`, and any other read-only shell commands
- Reading any file in this repo
- Running `npm test`, `npm run lint`, `npm run format:check`
- Running `npm run ping:db` or `npx vitest` to check current state
- Editing `.md` files (README, docs, outlines, notes)
- Editing `.mermaid` files or Mermaid diagrams embedded in Markdown
- Running `git status`, `git log`, `git diff` (read-only git commands)

### Always confirm before doing
- Editing any `.ts`, `.tsx`, `.js`, `.json`, `.css`, `.prisma`, or `.yaml` source file
- Deleting any file or directory
- Running `prisma migrate dev` or `prisma db push` (changes the live database)
- Running `git commit`, `git push`, or any destructive git command
- Installing or removing npm packages

---

## Design Decisions — Ask First

When designing or extending any of the following, **stop and ask for input before writing code** if there is more than one reasonable approach:

- **Database schema** — field names, types, nullability, indexes, foreign key behavior, JSON vs normalized columns
- **API endpoint shape** — URL structure, query param names, response envelope, error format
- **UI components** — layout, which shadcn component to use, interaction patterns, where state lives
- **Import/transform logic** — how Open5e fields map to Prisma model fields
- **Auth or security decisions** — any change to how the password gate works

"More than one reasonable approach" means: if a senior developer could make a defensible argument for two different choices, ask. Do not silently pick one.

---

## Ambiguity Rule

When a request is ambiguous — even slightly — ask a clarifying question before starting work. It is always better to ask one short question than to build the wrong thing. This applies especially to:

- Scope ("should this apply to all content types or just spells?")
- Behavior ("what should happen if the source already exists?")
- UI placement ("should this button be in the sidebar or the page header?")
- Data shape ("should tags be a string array or a relation?")

One focused question is enough. Do not present a long list of options unless the decision genuinely has many independent dimensions.

---

## Project Notes

- npm workspaces: `client` (React/Vite) and `server` (Express/TypeScript)
- Prisma CLI lives at root; `@prisma/client` is in the `server` workspace
- `prisma/.env` is loaded automatically by Prisma CLI; `.env` at root is loaded by the server at runtime
- Test files write logs to `DevTools/Tests/`; the running server writes logs to `DevTools/Logs/`
- Tailwind v4 — CSS-first config via `@import "tailwindcss"` in `index.css`; no `tailwind.config.js`
- Prisma 6 is intentional — Prisma 7 removed `url` from datasource and requires driver adapters
- Azure SQL uses SQL auth (user/password in the connection string), not Azure AD auth
- TypeScript target is `ES2022` (not ES2023) — the VS Code Edge Tools extension schema caps at ES2022
