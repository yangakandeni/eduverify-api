variable "aws_region" {
  type    = string
  default = "af-south-1"
}

variable "environment" {
  type = string
}

variable "project_name" {
  description = "Short project slug used as a prefix for resource names, e.g. \"eduverify-api-staging\"."
  type        = string
}

variable "dynamodb_table_name" {
  type = string
}

variable "s3_bucket_name" {
  type = string
}

variable "tf_state_bucket_name" {
  description = "Name of this stack's own Terraform state bucket — already exists (bootstrapped by eduverify/terraform/data-stack's backend_state.tf before this root existed), declared here only so this root's state matches what's actually live and doesn't plan to destroy it."
  type        = string
}

variable "ingestion_image_uri" {
  description = "Full ECR image URI (repository:tag) for the ingestion Lambda's container image — see modules/lambda_ingestion_container's bootstrap-order comment."
  type        = string
}

variable "lambda_memory_size" {
  description = "Same parser, same PDF, same memory need as the legacy zip+layer Lambda."
  type        = number
  default     = 3008
}

variable "lambda_timeout" {
  type    = number
  default = 300
}

variable "lambda_architecture" {
  type    = string
  default = "x86_64"
}

variable "scraper_schedule_expression" {
  type    = string
  default = "cron(0 6 ? * MON *)"
}

variable "log_retention_days" {
  type    = number
  default = 7
}

variable "alert_email" {
  type    = string
  default = ""
}
