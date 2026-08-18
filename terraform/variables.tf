variable "aws_region" {
  description = "AWS region to deploy into. Matches eduverify's own af-south-1 (in-country residency/latency) since this repo's Lambda talks to that region's DynamoDB table."
  type        = string
  default     = "af-south-1"
}

variable "environment" {
  type    = string
  default = "staging"
}

variable "project_name" {
  description = "Short project slug used as a prefix for resource names, distinct from eduverify's own project_name (\"eduverify\"/\"eduverify-staging\") so resources never collide in the same account."
  type        = string
  default     = "eduverify-api-staging"
}

variable "stage_name" {
  description = "API Gateway deployment stage name."
  type        = string
  default     = "staging"
}

variable "dynamodb_table_name" {
  description = "Name of the existing eduverify institutions table this API reads from."
  type        = string
}

variable "dynamodb_table_arn" {
  description = "ARN of the existing eduverify institutions table, owned and written by the separate eduverify repo's Terraform. Passed in as a plain variable rather than a terraform_remote_state data source, to keep the two repos' deploy pipelines decoupled (see the plan doc's Part 2 infra decisions)."
  type        = string
}

variable "dynamodb_gsi_arn" {
  description = "ARN of that table's GSI1 (name-prefix search / list-by-status)."
  type        = string
}

variable "lambda_runtime" {
  type    = string
  default = "nodejs20.x"
}

variable "lambda_architecture" {
  type    = string
  default = "arm64"
}

variable "lambda_memory_size" {
  type    = number
  default = 512
}

variable "lambda_timeout" {
  type    = number
  default = 10
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "api_key_tiers_json" {
  description = "JSON object of apiKey -> tier, e.g. {\"<generated-key-value>\": \"internal\"} — consumed by src/keyTiers.ts at runtime. Deliberately NOT derived from module.usage_plans' output: that would create a dependency cycle (this Lambda's env var would depend on the usage plan, which depends on the API Gateway, which depends on this Lambda's invoke ARN). Bootstrap sequence instead: (1) apply once with this left as \"{}\" to create the API key, (2) read the real value via `terraform output -json api_key_values`, (3) set TF_VAR_api_key_tiers_json (or a gitignored secrets tfvars) and apply again. Never commit real key values."
  type        = string
  default     = "{}"
  sensitive   = true
}

variable "api_keys" {
  description = "API keys to create and attach to the usage plan, e.g. [{name = \"eduverify-internal-staging\", tier = \"internal\"}]. Manually maintained — no self-serve signup in v1."
  type = list(object({
    name = string
    tier = string
  }))
  default = []
}

variable "usage_plan_quota_limit" {
  type    = number
  default = 100000
}

variable "usage_plan_rate_limit" {
  type    = number
  default = 50
}

variable "usage_plan_burst_limit" {
  type    = number
  default = 20
}
