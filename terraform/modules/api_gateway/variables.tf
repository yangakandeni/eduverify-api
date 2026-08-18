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
