# Security Policy

## Supported versions

Security fixes target the latest released version and the `main` branch.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's private security advisory flow for `wkqco33/pi-ros-helper` when available. Include reproduction steps, affected version, and impact. Do not include credentials, robot access tokens, or private bag files.

## Safety model

This extension can interact with ROS systems. Runtime control tools are preview-only by default and require explicit opt-in plus interactive confirmation. Do not bypass these safeguards in automation unless the deployment environment has an independently reviewed authorization layer.
