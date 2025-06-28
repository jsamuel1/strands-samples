/**
 * GitHub Project Board Setup Script
 * Used by the orchestration agent to automatically create and configure project boards
 */

const { Octokit } = require('@octokit/rest');
const yaml = require('js-yaml');
const fs = require('fs');

class ProjectBoardSetup {
  constructor(token, owner, repo) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
    this.template = this.loadTemplate();
  }

  loadTemplate() {
    try {
      const templateContent = fs.readFileSync('.github/project-board-template.yml', 'utf8');
      return yaml.load(templateContent);
    } catch (error) {
      console.log('Template file not found, using default configuration');
      return this.getDefaultTemplate();
    }
  }

  getDefaultTemplate() {
    return {
      project_board_template: {
        name: "Development Workflow",
        description: "Automated Kanban board managed by orchestration agent",
        columns: [
          { name: "📋 Backlog", purpose: "backlog", wip_limit_formula: "10" },
          { name: "🎨 Design", purpose: "design", wip_limit_formula: "2" },
          { name: "🔨 Implementation", purpose: "implementation", wip_limit_formula: "2" },
          { name: "🔍 Review", purpose: "review", wip_limit_formula: "2" },
          { name: "✅ Done", purpose: "done", wip_limit: null }
        ]
      }
    };
  }

  async analyzeRepository() {
    console.log('Analyzing repository to determine optimal configuration...');
    
    try {
      // Get repository statistics
      const [contributors, issues, pullRequests] = await Promise.all([
        this.getContributors(),
        this.getRecentIssues(),
        this.getRecentPullRequests()
      ]);

      const analysis = {
        contributorCount: contributors.length,
        activeContributors: contributors.filter(c => c.contributions > 5).length,
        issueVelocity: this.calculateIssueVelocity(issues),
        prFrequency: this.calculatePRFrequency(pullRequests),
        avgReviewTime: this.calculateAvgReviewTime(pullRequests),
        teamSize: this.determineTeamSize(contributors.length)
      };

      console.log('Repository Analysis:', analysis);
      return analysis;
    } catch (error) {
      console.error('Error analyzing repository:', error);
      return { teamSize: 'medium', contributorCount: 5 }; // Default fallback
    }
  }

  async getContributors() {
    const { data } = await this.octokit.repos.listContributors({
      owner: this.owner,
      repo: this.repo,
      per_page: 100
    });
    return data;
  }

  async getRecentIssues() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data } = await this.octokit.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      state: 'all',
      since: thirtyDaysAgo.toISOString(),
      per_page: 100
    });
    return data.filter(issue => !issue.pull_request);
  }

  async getRecentPullRequests() {
    const { data } = await this.octokit.pulls.list({
      owner: this.owner,
      repo: this.repo,
      state: 'all',
      per_page: 100
    });
    return data;
  }

  calculateIssueVelocity(issues) {
    const weeksOfData = 4;
    return Math.round(issues.length / weeksOfData);
  }

  calculatePRFrequency(pullRequests) {
    const weeksOfData = 4;
    return Math.round(pullRequests.length / weeksOfData);
  }

  calculateAvgReviewTime(pullRequests) {
    const mergedPRs = pullRequests.filter(pr => pr.merged_at);
    if (mergedPRs.length === 0) return 2; // Default 2 days

    const totalHours = mergedPRs.reduce((sum, pr) => {
      const created = new Date(pr.created_at);
      const merged = new Date(pr.merged_at);
      return sum + (merged - created) / (1000 * 60 * 60);
    }, 0);

    return Math.round(totalHours / mergedPRs.length / 24); // Convert to days
  }

  determineTeamSize(contributorCount) {
    if (contributorCount <= 3) return 'small';
    if (contributorCount <= 8) return 'medium';
    return 'large';
  }

  calculateWIPLimits(analysis) {
    const { teamSize, contributorCount } = analysis;
    const template = this.template.project_board_template;
    
    const limits = {};
    
    template.columns.forEach(column => {
      if (column.wip_limit === null) {
        limits[column.purpose] = null;
      } else if (column.wip_limit_formula) {
        // Simple formula evaluation
        let limit = column.wip_limit_formula.replace('team_size', contributorCount.toString());
        try {
          limit = eval(limit);
          limits[column.purpose] = Math.max(
            column.min_wip_limit || 1,
            Math.min(column.max_wip_limit || 20, Math.round(limit))
          );
        } catch (error) {
          // Fallback to preset values
          const presets = template.wip_presets[`${teamSize}_team`];
          limits[column.purpose] = presets ? presets[column.purpose] : 2;
        }
      }
    });

    console.log('Calculated WIP Limits:', limits);
    return limits;
  }

  async findExistingProject() {
    try {
      // Use GraphQL to find projects associated with the repository
      const query = `
        query($owner: String!, $repo: String!) {
          repository(owner: $owner, name: $repo) {
            projectsV2(first: 10) {
              nodes {
                id
                title
                shortDescription
                url
                closed
                fields(first: 20) {
                  nodes {
                    ... on ProjectV2Field {
                      id
                      name
                      dataType
                    }
                    ... on ProjectV2SingleSelectField {
                      id
                      name
                      dataType
                      options {
                        id
                        name
                        color
                      }
                    }
                  }
                }
                views(first: 10) {
                  nodes {
                    ... on ProjectV2View {
                      id
                      name
                      layout
                      fields(first: 20) {
                        nodes {
                          ... on ProjectV2Field {
                            id
                            name
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const result = await this.octokit.graphql(query, {
        owner: this.owner,
        repo: this.repo
      });

      const projects = result.repository.projectsV2.nodes.filter(p => !p.closed);
      
      if (projects.length > 0) {
        console.log(`Found ${projects.length} existing project(s)`);
        return projects[0]; // Return the first active project
      }

      return null;
    } catch (error) {
      console.error('Error finding existing projects:', error);
      return null;
    }
  }

  async createProject(analysis) {
    console.log('Creating new project board...');
    
    const template = this.template.project_board_template;
    const wipLimits = this.calculateWIPLimits(analysis);

    try {
      // Create project using GraphQL
      const createProjectMutation = `
        mutation($ownerId: ID!, $title: String!, $repositoryId: ID!) {
          createProjectV2(input: {
            ownerId: $ownerId,
            title: $title,
            repositoryId: $repositoryId
          }) {
            projectV2 {
              id
              title
              url
            }
          }
        }
      `;

      // Get owner and repository IDs
      const { data: repoData } = await this.octokit.repos.get({
        owner: this.owner,
        repo: this.repo
      });

      const { data: ownerData } = await this.octokit.users.getByUsername({
        username: this.owner
      });

      const projectResult = await this.octokit.graphql(createProjectMutation, {
        ownerId: ownerData.node_id,
        title: template.name,
        repositoryId: repoData.node_id
      });

      const project = projectResult.createProjectV2.projectV2;
      console.log(`Created project: ${project.title} (${project.url})`);

      // Configure the project
      await this.configureProject(project.id, wipLimits);

      return project;
    } catch (error) {
      console.error('Error creating project:', error);
      throw error;
    }
  }

  async configureProject(projectId, wipLimits) {
    console.log('Configuring project board...');

    try {
      // Add custom fields
      await this.addCustomFields(projectId);

      // Configure columns (views in Projects V2)
      await this.configureColumns(projectId, wipLimits);

      // Set up automations (if supported)
      await this.setupAutomations(projectId);

      console.log('Project configuration completed');
    } catch (error) {
      console.error('Error configuring project:', error);
      throw error;
    }
  }

  async addCustomFields(projectId) {
    const template = this.template.project_board_template;
    
    if (!template.custom_fields) return;

    for (const field of template.custom_fields) {
      try {
        let mutation;
        let variables = {
          projectId,
          name: field.name
        };

        if (field.type === 'single_select') {
          mutation = `
            mutation($projectId: ID!, $name: String!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
              createProjectV2Field(input: {
                projectId: $projectId,
                dataType: SINGLE_SELECT,
                name: $name,
                singleSelectOptions: $options
              }) {
                projectV2Field {
                  ... on ProjectV2SingleSelectField {
                    id
                    name
                  }
                }
              }
            }
          `;
          variables.options = field.options.map(opt => ({
            name: opt.name,
            color: opt.color || 'GRAY',
            description: opt.description || ''
          }));
        } else if (field.type === 'number') {
          mutation = `
            mutation($projectId: ID!, $name: String!) {
              createProjectV2Field(input: {
                projectId: $projectId,
                dataType: NUMBER,
                name: $name
              }) {
                projectV2Field {
                  ... on ProjectV2Field {
                    id
                    name
                  }
                }
              }
            }
          `;
        } else if (field.type === 'text') {
          mutation = `
            mutation($projectId: ID!, $name: String!) {
              createProjectV2Field(input: {
                projectId: $projectId,
                dataType: TEXT,
                name: $name
              }) {
                projectV2Field {
                  ... on ProjectV2Field {
                    id
                    name
                  }
                }
              }
            }
          `;
        }

        if (mutation) {
          await this.octokit.graphql(mutation, variables);
          console.log(`Added custom field: ${field.name}`);
        }
      } catch (error) {
        console.error(`Error adding custom field ${field.name}:`, error);
      }
    }
  }

  async configureColumns(projectId, wipLimits) {
    // Note: Projects V2 uses "views" instead of columns
    // This is a simplified implementation - full implementation would require
    // more complex GraphQL mutations to configure board layout
    console.log('Column configuration would be implemented here');
    console.log('WIP Limits to apply:', wipLimits);
  }

  async setupAutomations(projectId) {
    // Note: Project automations in GitHub Projects V2 are configured through the UI
    // or through specific automation APIs that may not be fully available via GraphQL
    console.log('Automation setup would be implemented here');
  }

  async optimizeExistingProject(project, analysis) {
    console.log(`Optimizing existing project: ${project.title}`);
    
    const wipLimits = this.calculateWIPLimits(analysis);
    
    try {
      // Analyze current project structure
      const currentConfig = await this.analyzeProjectStructure(project);
      
      // Suggest optimizations
      const optimizations = this.generateOptimizations(currentConfig, wipLimits);
      
      // Apply optimizations
      await this.applyOptimizations(project.id, optimizations);
      
      console.log('Project optimization completed');
      return optimizations;
    } catch (error) {
      console.error('Error optimizing project:', error);
      throw error;
    }
  }

  async analyzeProjectStructure(project) {
    // Analyze current project structure and return configuration
    return {
      columns: project.views?.nodes || [],
      fields: project.fields?.nodes || [],
      automations: [] // Would be populated from actual project analysis
    };
  }

  generateOptimizations(currentConfig, wipLimits) {
    const optimizations = [];
    
    // Compare current WIP limits with calculated optimal limits
    // Generate list of recommended changes
    
    return optimizations;
  }

  async applyOptimizations(projectId, optimizations) {
    for (const optimization of optimizations) {
      try {
        // Apply each optimization
        console.log(`Applying optimization: ${optimization.type}`);
      } catch (error) {
        console.error(`Error applying optimization:`, error);
      }
    }
  }

  async setupProjectBoard(forceSetup = false, teamSize = null) {
    try {
      console.log('Starting project board setup...');
      
      // Analyze repository
      const analysis = await this.analyzeRepository();
      if (teamSize) {
        analysis.teamSize = teamSize;
      }

      // Check for existing project
      const existingProject = await this.findExistingProject();

      if (existingProject && !forceSetup) {
        console.log('Found existing project, optimizing...');
        const optimizations = await this.optimizeExistingProject(existingProject, analysis);
        return {
          action: 'optimized',
          project: existingProject,
          optimizations,
          analysis
        };
      } else {
        console.log('Creating new project board...');
        const project = await this.createProject(analysis);
        return {
          action: 'created',
          project,
          analysis
        };
      }
    } catch (error) {
      console.error('Error setting up project board:', error);
      throw error;
    }
  }
}

// Export for use in GitHub Actions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProjectBoardSetup;
}

// CLI usage
if (require.main === module) {
  const token = process.env.GITHUB_TOKEN;
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const forceSetup = process.env.FORCE_SETUP === 'true';
  const teamSize = process.env.TEAM_SIZE;

  if (!token) {
    console.error('GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  const setup = new ProjectBoardSetup(token, owner, repo);
  
  setup.setupProjectBoard(forceSetup, teamSize)
    .then(result => {
      console.log('Project board setup completed:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Project board setup failed:', error);
      process.exit(1);
    });
}
