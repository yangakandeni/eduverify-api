variable "api_name" {
  type = string
}

variable "stage_name" {
  description = "API Gateway deployment stage name (distinct from the /v1 path prefix baked into the resources themselves, and distinct from the environment name — e.g. this can be \"staging\" while every resource still lives under /v1/*)."
  type        = string
}

variable "lambda_invoke_arn" {
  type = string
}

variable "lambda_function_name" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "log_retention_days" {
  description = "Retention for the API Gateway access-log CloudWatch log group (distinct from the Lambda's own log group, which the lambda_api module manages)."
  type        = number
  default     = 14
}

variable "enable_data_trace" {
  description = "Enable full request/response payload tracing (aws_api_gateway_method_settings.data_trace_enabled) in addition to access logs. Off by default — data traces can capture header values (e.g. X-Api-Key) in CloudWatch Logs. Flip on temporarily in the relevant environment's tfvars while actively debugging, then revert."
  type        = bool
  default     = false
}
