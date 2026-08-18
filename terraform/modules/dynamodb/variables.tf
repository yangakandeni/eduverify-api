variable "table_name" {
  description = "Name of the DynamoDB table storing institution records."
  type        = string
}

variable "tags" {
  description = "Tags applied to the table."
  type        = map(string)
  default     = {}
}
