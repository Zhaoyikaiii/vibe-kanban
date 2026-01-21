#!/bin/bash
# Vibe Kanban 启动脚本

export HOST=127.0.0.1
export PORT=3456
# 支持通过 nginx 反向代理访问 /vibe 路径
export VK_ALLOWED_ORIGINS="http://localhost/vibe,http://127.0.0.1/vibe,http://localhost:3456,http://127.0.0.1:3456"

cd /root/workspace/vibe-kanban
exec ./target/release/server
