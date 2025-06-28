# GitHub Project Board Setup Guide

This guide helps you set up a GitHub Project board that works optimally with the orchestration agent.

## Quick Setup

### 1. Create a New Project (v2)

1. Go to your repository on GitHub
2. Click on the **"Projects"** tab
3. Click **"Link a project"** → **"New project"**
4. Choose **"Board"** layout
5. Name it something like "Development Workflow" or "Kanban Board"

### 2. Configure Columns

Create these columns in order (the orchestration agent will auto-detect them):

#### Column 1: 📋 Backlog
- **Name**: `Backlog` or `To Do`
- **WIP Limit**: `10` (or adjust based on your team size)
- **Description**: "Issues ready for design work"

#### Column 2: 🎨 Design  
- **Name**: `Design` or `In Design`
- **WIP Limit**: `2` (recommended starting point)
- **Description**: "Issues being designed or awaiting design approval"

#### Column 3: 🔨 Implementation
- **Name**: `Implementation` or `In Progress`
- **WIP Limit**: `2` (adjust based on developer capacity)
- **Description**: "Approved designs being implemented"

#### Column 4: 🔍 Review
- **Name**: `Review` or `In Review`
- **WIP Limit**: `2` (adjust based on reviewer capacity)
- **Description**: "Completed implementations under review"

#### Column 5: ✅ Done
- **Name**: `Done` or `Completed`
- **WIP Limit**: Leave empty (unlimited)
- **Description**: "Completed and merged work"

### 3. Set WIP Limits

For each column (except Done):

1. Click the **three dots (⋯)** on the column header
2. Select **"Column settings"**
3. Set the **"Work in progress limit"** to the desired number
4. Click **"Save"**

### 4. Add Issues to Project

1. Go to your repository's **Issues** tab
2. Open an existing issue or create a new one
3. In the right sidebar, under **"Projects"**, select your project
4. The issue will appear in the **Backlog** column by default

## Advanced Configuration

### WIP Limit Patterns

The orchestration agent can detect WIP limits in several ways:

1. **Project Board Settings** (Recommended)
   - Set via column settings as described above

2. **Column Names**
   - `Design (WIP: 2)`
   - `Implementation [Max: 3]`
   - `Review (Limit: 2)`

3. **Column Descriptions**
   - Include text like "WIP: 2" or "Max: 3" in the column description

### Priority Indicators

Add these indicators to issue titles or labels for priority handling:

- **Urgent**: 🚨, `URGENT`, `CRITICAL`, `P0`
- **High**: ⚡, `HIGH`, `P1`  
- **Normal**: `P2`, `NORMAL`
- **Low**: `P3`, `LOW`

### Automation Rules

The project board can include automation rules that work with the orchestration agent:

1. **Auto-add Issues**: Automatically add new issues to the Backlog column
2. **Auto-move PRs**: Move items to Review when PRs are opened
3. **Auto-close**: Move items to Done when PRs are merged

To set up automation:
1. Go to project settings
2. Click **"Manage access"** → **"Workflows"**
3. Enable relevant automations

## Team Size Recommendations

### Small Team (1-3 developers)
```
Backlog: WIP 5
Design: WIP 1
Implementation: WIP 2
Review: WIP 1
Done: Unlimited
```

### Medium Team (4-8 developers)
```
Backlog: WIP 10
Design: WIP 2
Implementation: WIP 3
Review: WIP 2
Done: Unlimited
```

### Large Team (9+ developers)
```
Backlog: WIP 15
Design: WIP 3
Implementation: WIP 5
Review: WIP 3
Done: Unlimited
```

## Validation Checklist

After setup, verify your project board:

- [ ] Project is linked to the repository
- [ ] All 5 columns are created in the correct order
- [ ] WIP limits are set for Backlog, Design, Implementation, and Review
- [ ] Done column has no WIP limit
- [ ] At least one issue is added to the project
- [ ] Column names match common patterns (Backlog, Design, Implementation, Review, Done)

## Testing the Setup

1. **Create a test issue** with clear requirements
2. **Add it to the project board** (should appear in Backlog)
3. **Run the orchestration agent manually**:
   ```bash
   gh workflow run 00-orchestration-agent.yml
   ```
4. **Check the workflow logs** to see if the project board is detected
5. **Verify WIP limits** are read correctly from the project board

## Troubleshooting

### Project Board Not Detected
- Ensure the project is linked to the repository
- Check that the project is not archived or private
- Verify repository permissions include project access

### WIP Limits Not Working
- Confirm WIP limits are set in column settings (not just descriptions)
- Check column names match expected patterns
- Review orchestration agent logs for detection messages

### Items Not Moving
- Verify issues are properly added to the project board
- Check that workflow triggers are working
- Ensure agents have proper permissions to update project boards

## GitHub CLI Setup (Optional)

You can also manage project boards via GitHub CLI:

```bash
# List projects
gh project list --owner OWNER

# View project
gh project view NUMBER --owner OWNER

# Add issue to project
gh project item-add NUMBER --owner OWNER --url ISSUE_URL
```

## API Integration

The orchestration agent uses GitHub's GraphQL API to interact with project boards. Key operations:

- **Read project structure**: Columns, WIP limits, current items
- **Update item status**: Move items between columns
- **Query metrics**: Item counts, flow rates, cycle times
- **Create project cards**: Add new issues to the board

For more details on the API integration, see the orchestration agent source code.

## Support

If you encounter issues with project board setup:

1. Check the [GitHub Projects documentation](https://docs.github.com/en/issues/planning-and-tracking-with-projects)
2. Review orchestration agent workflow logs
3. Verify permissions and repository access
4. Test with a simple manual workflow first

The orchestration agent includes fallback mechanisms that use labels and issue states if project board integration fails.
