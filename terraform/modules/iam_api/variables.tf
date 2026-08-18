variable "role_name" {
  description = "Name for the Lambda execution role."
  type        = string
}

variable "dynamodb_table_arn" {
  description = "ARN of the eduverify institutions table (owned by the separate eduverify repo's Terraform) this role gets read-only access to."
  type        = string
}

variable "dynamodb_gsi_arn" {
  description = "ARN of that table's GSI1, for Query access (GetItem/BatchGetItem use the base table ARN)."
  type        = string
}

variable "log_group_name" {
  description = "CloudWatch log group name this role may write to."
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
