variable "function_name" {
  description = "Name of the ingestion Lambda function (and its ECR repository)."
  type        = string
}

variable "role_arn" {
  description = "ARN of the IAM execution role for the function."
  type        = string
}

variable "image_uri" {
  description = "Full ECR image URI (repository:tag) to deploy. Built and pushed outside Terraform — see this module's main.tf header comment for the bootstrap order."
  type        = string
}

variable "architecture" {
  description = "Lambda instruction set architecture (x86_64 or arm64). Must match the platform the image was built for."
  type        = string
  default     = "x86_64"
}

variable "timeout" {
  description = "Function timeout in seconds."
  type        = number
  default     = 300
}

variable "memory_size" {
  description = "Function memory in MB."
  type        = number
  default     = 3008
}

variable "environment_variables" {
  description = "Environment variables passed to the function."
  type        = map(string)
  default     = {}
}

variable "log_group_name" {
  description = "CloudWatch Logs log group name for the function, e.g. /aws/lambda/eduverify-api-staging-ingestion."
  type        = string
}

variable "log_retention_days" {
  description = "Retention period for the function's log group."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags applied to the function, ECR repository, and log group."
  type        = map(string)
  default     = {}
}
