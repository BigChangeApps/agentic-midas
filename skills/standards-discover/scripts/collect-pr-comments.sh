#!/usr/bin/env bash
# Collect the human review comments of completed Azure DevOps pull requests and split them into batches.
#
# usage: collect-pr-comments.sh <org> <project> <repo> <base-branch> <pr-count|all> <out-dir> [area paths...]
#
# Writes to <out-dir>:
#   pr-ids.tsv          id<TAB>date<TAB>subject, newest first (from the "Merged PR <id>: ..." squash subjects)
#   pr-comments.jsonl   one human comment per line
#   batches/batch-NN.jsonl  the comments split by PR, at most BATCH_COMMENTS (300) comments or BATCH_PRS (60) PRs each
#   stats.json          prs_read, prs_with_review_comments, comments, batches
set -euo pipefail

org=$1 project=$2 repo=$3 base=$4 count=$5 out=$6
shift 6
BATCH_COMMENTS=${BATCH_COMMENTS:-300}
BATCH_PRS=${BATCH_PRS:-60}
PARALLEL=${PARALLEL:-8}

mkdir -p "$out/raw" "$out/batches"
git fetch -q origin "$base" 2>/dev/null || true

# Squash merges name the PR in the subject; an area limits the history to the PRs that touched it.
git log --first-parent "origin/$base" --date=short --format='%ad%x09%s' -- "$@" \
  | sed -nE 's/^([0-9-]+)	Merged PR ([0-9]+): (.*)$/\2	\1	\3/p' \
  | { if [ "$count" = all ]; then cat; else sed -n "1,${count}p"; fi; } > "$out/pr-ids.tsv" # sed, not head: head closes the pipe and pipefail stops the script

if [ ! -s "$out/pr-ids.tsv" ]; then
  echo "no 'Merged PR <id>' subjects on origin/$base; list PRs with: az repos pr list --status completed" >&2
  exit 2
fi

export org project repo out
fetch() {
  local id=$1
  az devops invoke --org "https://dev.azure.com/$org/" --area git --resource pullRequestThreads \
    --route-parameters project="$project" repositoryId="$repo" pullRequestId="$id" \
    --api-version 7.1 -o json > "$out/raw/$id.json" 2> "$out/raw/$id.err" || echo "PR $id: fetch failed" >&2
}
export -f fetch
cut -f1 "$out/pr-ids.tsv" | xargs -P "$PARALLEL" -I{} bash -c 'fetch {}'

python3 - "$out" "$BATCH_COMMENTS" "$BATCH_PRS" <<'PY'
import json, os, re, sys
out, max_comments, max_prs = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
BOT = re.compile(r"build service|microsoft\.visualstudio|project collection|sonar|dependabot|renovate|azure pipelines|github", re.I)

prs = [line.rstrip("\n").split("\t", 2) for line in open(os.path.join(out, "pr-ids.tsv"))]
by_pr, failed = {}, 0
for pr, date, subject in prs:
    path = os.path.join(out, "raw", f"{pr}.json")
    try:
        threads = json.load(open(path))["value"]
    except Exception:
        failed += 1
        continue
    rows = []
    for t in threads:
        if t.get("isDeleted"):
            continue
        ctx = t.get("threadContext") or {}
        for c in t.get("comments", []):
            author = (c.get("author") or {}).get("displayName", "")
            if c.get("commentType") != "text" or c.get("isDeleted") or BOT.search(author):
                continue
            rows.append({"pr": int(pr), "date": date, "title": subject, "thread": t["id"],
                         "status": t.get("status"), "file": ctx.get("filePath"),
                         "line": (ctx.get("rightFileStart") or {}).get("line"),
                         "author": author, "reply": c.get("id", 1) != 1, "text": c.get("content", "")})
    if rows:
        by_pr[pr] = rows

all_rows = [r for pr, _, _ in prs for r in by_pr.get(pr, [])]
with open(os.path.join(out, "pr-comments.jsonl"), "w") as f:
    f.writelines(json.dumps(r) + "\n" for r in all_rows)

batches, current = [], []
for pr, _, _ in prs:
    rows = by_pr.get(pr)
    if not rows:
        continue
    if current and (sum(len(by_pr[p]) for p in current) + len(rows) > max_comments or len(current) >= max_prs):
        batches.append(current)
        current = []
    current.append(pr)
if current:
    batches.append(current)
for i, batch in enumerate(batches, 1):
    with open(os.path.join(out, "batches", f"batch-{i:02d}.jsonl"), "w") as f:
        f.writelines(json.dumps(r) + "\n" for p in batch for r in by_pr[p])

stats = {"prs_read": len(prs) - failed, "prs_failed": failed, "prs_with_review_comments": len(by_pr),
         "comments": len(all_rows), "batches": len(batches),
         "oldest": prs[-1][1] if prs else None, "newest": prs[0][1] if prs else None}
json.dump(stats, open(os.path.join(out, "stats.json"), "w"))
print(json.dumps(stats))
PY
