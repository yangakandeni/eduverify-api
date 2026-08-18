output "invoke_url" {
  description = "Base URL for the deployed API, e.g. https://<id>.execute-api.af-south-1.amazonaws.com/staging — append /v1/health etc."
  value       = module.api_gateway.invoke_url
}

output "lambda_function_name" {
  value = module.lambda_api.function_name
}

output "usage_plan_id" {
  value = module.usage_plans.usage_plan_id
}

output "api_key_values" {
  description = "Map of key name -> value. Sensitive — `terraform output -json api_key_values` to read, never `terraform output` plain (which redacts sensitive values anyway)."
  value       = module.usage_plans.api_key_values
  sensitive   = true
}
