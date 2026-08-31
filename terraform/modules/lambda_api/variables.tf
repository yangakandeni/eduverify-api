variable "function_name" {
  type = string
}

variable "role_arn" {
  type = string
}

variable "source_dir" {
  description = "Directory containing the esbuild-bundled Lambda code (dist/), zipped as-is."
  type        = string
}

variable "runtime" {
  type    = string
  default = "nodejs20.x"
}

variable "architecture" {
  type    = string
  default = "arm64"
}

variable "memory_size" {
  type    = number
  default = 1536
}

variable "timeout" {
  description = "Timeout (seconds). Kept short relative to the ingestion Lambda's 300s — this Lambda only ever does a handful of DynamoDB reads per request, never a PDF parse."
  type        = number
  default     = 10
}

variable "log_retention_days" {
  type    = number
  default = 14
}

variable "environment_variables" {
  type    = map(string)
  default = {}
}

variable "tags" {
  type    = map(string)
  default = {}
}
