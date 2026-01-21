// CodeBuddy executor - based on Claude Code executor
// CodeBuddy Code is Tencent's internal fork of Claude Code with similar CLI interface

use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::process::Command;
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;
use std::process::Stdio;
use derivative::Derivative;

use crate::{
    approvals::ExecutorApprovalService,
    command::{CmdOverrides, CommandBuildError, CommandBuilder, CommandParts, apply_overrides},
    env::ExecutionEnv,
    executors::{
        AppendPrompt, AvailabilityInfo, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
        codex::client::LogWriter,
        claude::{ClaudeLogProcessor, HistoryStrategy},
        claude::client::{ClaudeAgentClient, AUTO_APPROVE_CALLBACK_ID, STOP_GIT_CHECK_CALLBACK_ID},
        claude::protocol::ProtocolPeer,
        claude::types::PermissionMode,
    },
    logs::stderr_processor::normalize_stderr_logs,
    logs::utils::EntryIndexProvider,
    stdout_dup::create_stdout_pipe_writer,
};

fn base_command() -> &'static str {
    "codebuddy"
}

#[derive(Derivative, Clone, Serialize, Deserialize, TS, JsonSchema)]
#[derivative(Debug, PartialEq)]
#[ts(export)]
pub struct CodeBuddy {
    #[serde(default)]
    pub append_prompt: AppendPrompt,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plan: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approvals: Option<bool>,
    #[serde(flatten)]
    pub cmd: CmdOverrides,

    #[serde(skip)]
    #[ts(skip)]
    #[derivative(Debug = "ignore", PartialEq = "ignore")]
    approvals_service: Option<Arc<dyn ExecutorApprovalService>>,
}

impl CodeBuddy {
    async fn build_command_builder(&self) -> Result<CommandBuilder, CommandBuildError> {
        let mut builder = CommandBuilder::new(base_command()).params(["-p"]);

        let plan = self.plan.unwrap_or(false);
        let approvals = self.approvals.unwrap_or(false);
        if plan && approvals {
            tracing::warn!("Both plan and approvals are enabled. Plan will take precedence.");
        }
        // Always use BypassPermissions mode - actual permission control is handled via hooks
        builder = builder.extend_params([format!(
            "--permission-mode={}",
            PermissionMode::BypassPermissions
        )]);
        builder = builder.extend_params([
            "--verbose",
            "--output-format=stream-json",
            "--input-format=stream-json",
            "--include-partial-messages",
            "--disallowedTools=AskUserQuestion",
        ]);

        apply_overrides(builder, &self.cmd)
    }

    pub fn permission_mode(&self) -> PermissionMode {
        if self.plan.unwrap_or(false) {
            PermissionMode::Plan
        } else if self.approvals.unwrap_or(false) {
            PermissionMode::Default
        } else {
            PermissionMode::BypassPermissions
        }
    }

    pub fn get_hooks(&self, commit_reminder: bool) -> Option<serde_json::Value> {
        let mut hooks = serde_json::Map::new();

        if commit_reminder {
            hooks.insert(
                "Stop".to_string(),
                serde_json::json!([{
                    "hookCallbackIds": [STOP_GIT_CHECK_CALLBACK_ID]
                }]),
            );
        }

        if self.plan.unwrap_or(false) {
            hooks.insert(
                "PreToolUse".to_string(),
                serde_json::json!([
                    {
                        "matcher": "^ExitPlanMode$",
                        "hookCallbackIds": ["tool_approval"],
                    },
                    {
                        "matcher": "^(?!ExitPlanMode$).*",
                        "hookCallbackIds": [AUTO_APPROVE_CALLBACK_ID],
                    }
                ]),
            );
        } else if self.approvals.unwrap_or(false) {
            hooks.insert(
                "PreToolUse".to_string(),
                serde_json::json!([
                    {
                        "matcher": "^(?!(Glob|Grep|NotebookRead|Read|Task|TodoWrite)$).*",
                        "hookCallbackIds": ["tool_approval"],
                    }
                ]),
            );
        } else {
            // Default mode: auto-approve all tools via hooks (replaces --dangerously-skip-permissions)
            hooks.insert(
                "PreToolUse".to_string(),
                serde_json::json!([
                    {
                        "matcher": ".*",
                        "hookCallbackIds": [AUTO_APPROVE_CALLBACK_ID],
                    }
                ]),
            );
        }

        Some(serde_json::Value::Object(hooks))
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for CodeBuddy {
    fn use_approvals(&mut self, approvals: Arc<dyn ExecutorApprovalService>) {
        self.approvals_service = Some(approvals);
    }

    async fn spawn(
        &self,
        current_dir: &Path,
        prompt: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let command_builder = self.build_command_builder().await?;
        let command_parts = command_builder.build_initial()?;
        self.spawn_internal(current_dir, prompt, command_parts, env)
            .await
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let command_builder = self.build_command_builder().await?;
        let command_parts = command_builder.build_follow_up(&[
            "--fork-session".to_string(),
            "--resume".to_string(),
            session_id.to_string(),
        ])?;
        self.spawn_internal(current_dir, prompt, command_parts, env)
            .await
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, current_dir: &Path) {
        let entry_index_provider = EntryIndexProvider::start_from(&msg_store);

        // Process stdout logs (CodeBuddy's JSON output - same format as Claude)
        ClaudeLogProcessor::process_logs(
            msg_store.clone(),
            current_dir,
            entry_index_provider.clone(),
            HistoryStrategy::Default,
        );

        // Process stderr logs using the standard stderr processor
        normalize_stderr_logs(msg_store, entry_index_provider);
    }

    // MCP configuration methods - CodeBuddy uses similar config path
    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".codebuddy.json"))
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        // Check if codebuddy command is available by checking common paths
        let codebuddy_exists = std::process::Command::new("codebuddy")
            .arg("--version")
            .output()
            .is_ok();
        
        if codebuddy_exists {
            // Check for auth file
            let auth_file_path = dirs::home_dir().map(|home| home.join(".codebuddy.json"));
            if let Some(path) = auth_file_path
                && let Some(timestamp) = std::fs::metadata(&path)
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64)
            {
                return AvailabilityInfo::LoginDetected {
                    last_auth_timestamp: timestamp,
                };
            }
            return AvailabilityInfo::InstallationFound;
        }
        AvailabilityInfo::NotFound
    }
}

impl CodeBuddy {
    async fn spawn_internal(
        &self,
        current_dir: &Path,
        prompt: &str,
        command_parts: CommandParts,
        env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        let (program_path, args) = command_parts.into_resolved().await?;
        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(program_path);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .args(&args);

        env.clone()
            .with_profile(&self.cmd)
            .apply_to_command(&mut command);

        let mut child = command.group_spawn()?;
        let child_stdout = child.inner().stdout.take().ok_or_else(|| {
            ExecutorError::Io(std::io::Error::other("CodeBuddy missing stdout"))
        })?;
        let child_stdin =
            child.inner().stdin.take().ok_or_else(|| {
                ExecutorError::Io(std::io::Error::other("CodeBuddy missing stdin"))
            })?;

        let new_stdout = create_stdout_pipe_writer(&mut child)?;
        let permission_mode = self.permission_mode();
        let hooks = self.get_hooks(env.commit_reminder);

        // Create interrupt channel for graceful shutdown
        let (interrupt_tx, interrupt_rx) = tokio::sync::oneshot::channel::<()>();

        // Spawn task to handle the SDK client with control protocol
        let prompt_clone = combined_prompt.clone();
        let approvals_clone = self.approvals_service.clone();
        let repo_context = env.repo_context.clone();
        tokio::spawn(async move {
            let log_writer = LogWriter::new(new_stdout);
            let client = ClaudeAgentClient::new(log_writer.clone(), approvals_clone, repo_context);
            let protocol_peer =
                ProtocolPeer::spawn(child_stdin, child_stdout, client.clone(), interrupt_rx);

            // Initialize control protocol
            if let Err(e) = protocol_peer.initialize(hooks).await {
                tracing::error!("Failed to initialize control protocol: {e}");
                let _ = log_writer
                    .log_raw(&format!("Error: Failed to initialize - {e}"))
                    .await;
                return;
            }

            if let Err(e) = protocol_peer.set_permission_mode(permission_mode).await {
                tracing::warn!("Failed to set permission mode to {permission_mode}: {e}");
            }

            // Send user message
            if let Err(e) = protocol_peer.send_user_message(prompt_clone).await {
                tracing::error!("Failed to send prompt: {e}");
                let _ = log_writer
                    .log_raw(&format!("Error: Failed to send prompt - {e}"))
                    .await;
            }
        });

        Ok(SpawnedChild {
            child,
            exit_signal: None,
            interrupt_sender: Some(interrupt_tx),
        })
    }
}
