module.exports = {
  apps: [{
    name: 'vibe-kanban',
    script: './target/release/server',
    cwd: '/root/workspace/vibe-kanban',
    env: {
      HOST: '127.0.0.1',
      PORT: '3456',
      VK_ALLOWED_ORIGINS: 'https://localhost/vibe,https://127.0.0.1/vibe,http://localhost:3456,http://127.0.0.1:3456'
    },
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/root/workspace/vibe-kanban/logs/error.log',
    out_file: '/root/workspace/vibe-kanban/logs/out.log',
    merge_logs: true
  }]
};
