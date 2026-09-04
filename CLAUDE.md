# Claude Code

## Never commit or push

Do **not** run `git commit`, `git push`, or any other command that commits or
pushes changes, unless the user explicitly asks you to. The user handles
version control themselves. Just make the changes in the working tree and
leave them unstaged.

## Read before writing

Read the project guidance in **`AGENTS.md`** (root of the repository) before
creating or modifying any files. It defines the project's architecture and
folder conventions.

## Code reviews live in `code-review.md`

**`code-review.md`** (root of the repository) is the single home for code review
findings. It carries its own protocol section — read it before doing either of
the following.

- **"do a code review"** → review the changes, then **overwrite `code-review.md`**
  with the findings, deleting the previous contents. Keep its Protocol section.
  Reviewing does not include fixing.
- **"fix the review" / "fix the findings"** → read `code-review.md` and implement
  it, highest severity first. **Skip any finding that does not hold up** — one
  that is wrong, no longer applies, or costs more to fix than the defect is worth.
  At the end, report what was fixed **and every skip with its reason**. Never drop
  a skipped finding silently.