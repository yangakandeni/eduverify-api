variable "role_name" {
  description = "Name of the Lambda execution role."
  type        = string
}

variable "s3_bucket_arn" {
  description = "ARN of the registers bucket the Lambda reads raw PDFs from and writes backup dumps to."
  type        = string
}

variable "s3_raw_prefix" {
  description = "Key prefix within the bucket holding raw PDF uploads (read-only for the Lambda)."
  type        = string
  default     = "raw/"
}

variable "s3_backup_prefix" {
  description = "Key prefix within the bucket for backup JSON dumps written by the Lambda."
  type        = string
  default     = "backups/"
}

variable "dynamodb_table_arn" {
  description = "ARN of the institutions DynamoDB table."
  type        = string
}

variable "dynamodb_gsi_arn" {
  description = "ARN of the table's GSI1 index."
  type        = string
}

variable "log_group_name" {
  description = "CloudWatch Logs log group name the Lambda writes to, e.g. /aws/lambda/eduverify-ingestion."
  type        = string
}

variable "tags" {
  description = "Tags applied to the role and policy."
  type        = map(string)
  default     = {}
}
