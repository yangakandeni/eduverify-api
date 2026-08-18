output "usage_plan_id" {
  value = aws_api_gateway_usage_plan.plan.id
}

output "api_key_values" {
  description = "Map of key name -> the actual generated key value. Sensitive — read via `terraform output -json api_key_values` after apply to hand the value to a client; never logged."
  value       = { for name, key in aws_api_gateway_api_key.keys : name => key.value }
  sensitive   = true
}
