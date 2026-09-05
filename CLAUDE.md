# Claude Code

## Never commit or push — no exceptions

**Never run any command that commits, pushes, or otherwise rewrites history
unless the user asks for it in that specific message.** The user owns version
control entirely.

This includes, and is not limited to:

```
git commit          git commit --amend      git push
git merge           git rebase              git cherry-pick
git tag             git reset --hard        git stash
gh pr create        gh pr merge
```

Do not stage either — no `git add`. Leave every change in the working tree,
unstaged, exactly where it lands.

This holds **regardless of the circumstances**:

- No matter how small, safe, or obviously correct the change is
- No matter that the build passes and every test is green
- No matter that the work is finished and verified
- No matter that a previous message authorised a commit — **permission never
  carries forward**; it applies once, to that request only
- No matter that committing seems implied by the task

If you believe something should be committed, **say so and stop**. Describe what
you would commit and wait. Offering is correct; acting is not.

## Read before writing

Read the project guidance in **`AGENTS.md`** (root of the repository) before
creating or modifying any files. It defines the project's architecture and
folder conventions.

## Plans live in `plans/` — never outside the repository

Write every implementation plan and design document into the **`plans/`**
directory at the root of this repository. Do **not** write them to a scratch
directory, a temp path, or anywhere else outside the repo — keeping them at a
predictable path means any session, in any tool, can find them.

`plans/` is **gitignored**. Plans are local working notes, not committed
artifacts, so they will not appear in `git status` and must never be staged.

Name each file `NNN-kebab-case-title.md`, where `NNN` is a zero-padded
three-digit sequence number, so the directory always sorts in creation order:

```
plans/001-move-map-and-cars-to-backend.md
plans/002-...
```

Before creating a plan, list `plans/` and take the next unused number. Never
renumber or overwrite an existing plan — supersede it with a new one.

## Code reviews live in `code-review.md`

**`code-review.md`** (root of the repository) is the single home for code review
findings. It is **gitignored and generated** — if it is missing, that is normal;
create it. The authoritative rules are here and in `AGENTS.md`, not in the file
itself.

- **"do a code review"** → review the changes, then write the findings to
  `code-review.md`. **Create the file if it does not exist**; if it does,
  **overwrite it**, deleting the previous findings. Either way the result carries
  the Protocol section reproduced below, then the findings.
  Reviewing does not include fixing.
- **"fix the review" / "fix the findings"** → read `code-review.md` and implement
  it, highest severity first. **Skip any finding that does not hold up** — one
  that is wrong, no longer applies, or costs more to fix than the defect is worth.
  At the end, report what was fixed **and every skip with its reason**. Never drop
  a skipped finding silently.