const HIGH_RISK = [/^\/cmd_vel(?:$|\/)/i, /actuator/i, /motor/i, /joint_commands/i, /emergency/i, /shutdown/i];
export function riskForTopic(topic: string): "read" | "actuation" { return HIGH_RISK.some((pattern) => pattern.test(topic)) ? "actuation" : "actuation"; }
export function isHighRiskTopic(topic: string): boolean { return HIGH_RISK.some((pattern) => pattern.test(topic)); }
