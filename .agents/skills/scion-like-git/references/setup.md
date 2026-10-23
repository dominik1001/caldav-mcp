# Setup for scion-like-git

Run once per clone, when `git config --get scion-like-git.configured` prints
nothing. Say what each step changes and skip what the user declines.

1. Configure the clone, and mark it as set up:

   ```sh
   git config push.autoSetupRemote true
   git config fetch.prune true
   git config scion-like-git.configured true
   ```

2. If the repository is on GitHub and the user has admin rights, check
   `gh api repos/{owner}/{repo} -q .delete_branch_on_merge`. If it is not
   `true`, ask, then run
   `gh api -X PATCH repos/{owner}/{repo} -f delete_branch_on_merge=true`.
   Also recommend a ruleset on `main` that blocks force pushes.
3. Report local state that breaks the rules and offer to fix each item:
   `git log --branches --not --remotes --oneline`, `git stash list`,
   `git branch -vv | grep -v '\['`. Delete nothing without confirmation.
