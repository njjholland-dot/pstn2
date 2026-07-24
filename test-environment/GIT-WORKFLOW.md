# Git Workflow for PSTN2 Test Harness

## MANDATORY: All Changes Must Use Git

**CRITICAL**: All modifications to this project MUST be tracked using Git version control. This is not optional.

## Initial Setup

If git repository is not yet initialized:

```bash
cd /Users/nholland/Projects/Claude/PSTN2/test-environment
git init
git add .
git commit -m "Initial commit: PSTN2 Test Harness

- Complete backend implementation (2500+ lines)
- Complete frontend implementation (1500+ lines)
- Database schema and seeds
- Documentation and build files"
```

## Daily Workflow

### Before Making Changes

1. **Check current status**
   ```bash
   git status
   ```

2. **Pull latest changes** (if working with team)
   ```bash
   git pull origin main
   ```

### Making Changes

1. **Create a feature branch** (recommended)
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** to code files

3. **Check what changed**
   ```bash
   git status
   git diff
   ```

4. **Stage your changes**
   ```bash
   # Stage specific files
   git add path/to/file1 path/to/file2

   # Or stage all changes
   git add .
   ```

5. **Commit your changes**
   ```bash
   git commit -m "Brief description of changes

   - Detailed bullet point 1
   - Detailed bullet point 2
   - Detailed bullet point 3"
   ```

### Commit Message Guidelines

**Format:**
```
<type>: <short summary> (max 50 chars)

<detailed description>
- List specific changes
- Reference issue numbers if applicable
- Explain WHY not just WHAT
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements

**Examples:**
```bash
git commit -m "feat: Add number porting simulation

- Implement porting chain resolution (5 hop max)
- Add porting history tracking
- Update database schema with porting_history table"

git commit -m "fix: Correct TypeScript compilation error in simulator-routes

- Fix spacing in getCPConfig function call
- Resolves TS1005 error on line 53"

git commit -m "docs: Update BUILD-STATUS with frontend completion

- Mark all frontend components as complete
- Update progress to 95%
- Add file structure tree"
```

### Pushing Changes

```bash
# Push to remote repository
git push origin feature/your-feature-name

# Or if on main branch
git push origin main
```

### Merging Feature Branches

```bash
# Switch to main branch
git checkout main

# Merge feature branch
git merge feature/your-feature-name

# Delete feature branch (if done)
git branch -d feature/your-feature-name
```

## Viewing History

```bash
# View commit history
git log

# View compact history
git log --oneline

# View last 10 commits
git log -10

# View changes in a specific file
git log -p path/to/file

# View who changed what
git blame path/to/file
```

## Undoing Changes

### Discard uncommitted changes
```bash
# Discard changes in specific file
git checkout -- path/to/file

# Discard all uncommitted changes
git reset --hard HEAD
```

### Undo last commit (keep changes)
```bash
git reset --soft HEAD~1
```

### Undo last commit (discard changes)
```bash
git reset --hard HEAD~1
```

### Revert a specific commit
```bash
git revert <commit-hash>
```

## Branching Strategy

### Main Branches
- `main` - Production-ready code
- `develop` - Development branch (if using)

### Feature Branches
- `feature/authentication` - New authentication features
- `feature/frontend-dashboard` - Dashboard UI work
- `fix/database-connection` - Bug fixes
- `docs/api-documentation` - Documentation updates

## .gitignore

Ensure you have a proper `.gitignore` file:

```gitignore
# Dependencies
node_modules/
venv/

# Environment variables
.env
.env.local

# Build output
dist/
build/

# Logs
*.log
logs/

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Database
*.sql.backup
```

## Git Hooks (Optional but Recommended)

### Pre-commit Hook
Create `.git/hooks/pre-commit`:

```bash
#!/bin/bash
# Run linters before commit
npm run lint --prefix backend
npm run lint --prefix frontend
```

Make it executable:
```bash
chmod +x .git/hooks/pre-commit
```

## Remote Repository Setup

### Connect to GitHub
```bash
# Add remote
git remote add origin https://github.com/username/pstn2-test-harness.git

# Verify remote
git remote -v

# Push to GitHub
git push -u origin main
```

### Connect to GitLab
```bash
git remote add origin https://gitlab.com/username/pstn2-test-harness.git
git push -u origin main
```

## Best Practices

1. **Commit frequently** - Small, logical commits are better than large ones
2. **Write clear messages** - Future you will thank you
3. **Test before committing** - Run tests and ensure code works
4. **Don't commit secrets** - Never commit .env files or API keys
5. **Pull before push** - Always sync with remote before pushing
6. **Use branches** - Keep main branch stable
7. **Review your changes** - Use `git diff` before committing
8. **Keep commits focused** - One logical change per commit

## Emergency: Recover Lost Work

### If you accidentally deleted uncommitted files
```bash
# Git can't help - use OS recovery tools
```

### If you committed but lost local changes
```bash
# Find the commit
git reflog

# Restore from commit
git checkout <commit-hash>
```

### If you pushed bad code
```bash
# Revert the commit (safe - creates new commit)
git revert <commit-hash>
git push origin main
```

## Cheat Sheet

```bash
# Status & Info
git status              # Check current status
git log                 # View history
git diff                # See unstaged changes
git diff --staged       # See staged changes

# Making Changes
git add <file>          # Stage file
git add .               # Stage all changes
git commit -m "msg"     # Commit staged changes
git push                # Push to remote

# Branching
git branch              # List branches
git branch <name>       # Create branch
git checkout <name>     # Switch branch
git checkout -b <name>  # Create and switch
git merge <name>        # Merge branch
git branch -d <name>    # Delete branch

# Syncing
git pull                # Fetch and merge
git fetch               # Fetch only
git push                # Push commits

# Undoing
git reset HEAD <file>   # Unstage file
git checkout -- <file>  # Discard changes
git reset --soft HEAD~1 # Undo last commit (keep changes)
git reset --hard HEAD~1 # Undo last commit (discard changes)
```

## Contact & Support

For git help:
- Official docs: https://git-scm.com/doc
- Pro Git book: https://git-scm.com/book
- Interactive tutorial: https://learngitbranching.js.org/

## Remember

**Git is your safety net. Use it religiously. Every change should be committed.**
